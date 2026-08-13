import ChatGroup from '@icalingua/types/ChatGroup'
import DatabaseUpgradeProgress from '@icalingua/types/DatabaseUpgradeProgress'
import IgnoreChatInfo from '@icalingua/types/IgnoreChatInfo'
import Message from '@icalingua/types/Message'
import MessagePageOptions from '@icalingua/types/MessagePage'
import Room from '@icalingua/types/Room'
import StorageProvider from '@icalingua/types/StorageProvider'
import DBWorkerClient from './DBWorkerClient'
import { DBWorkerTargetKind, deserializeDBWorkerError, SerializedDBWorkerError } from './DBWorkerProtocol'
import { SQLiteMessageSearchTimesOptions } from './SQLiteMessageSearchIndex'

interface SQLiteOpt {
    dataPath: string
    searchDataPath?: string
}

export interface DBWorkerClientLike {
    readonly isClosed: boolean
    createTarget(
        kind: DBWorkerTargetKind,
        args: unknown[],
        callbacks?: Record<string, (...args: any[]) => any>,
        eventHandler?: (name: string, payload: unknown) => void,
    ): Promise<string>
    callTarget<T>(targetId: string, method: string, args?: unknown[]): Promise<T>
    disposeTarget(targetId: string): Promise<void>
    terminate(): Promise<void>
}

export type DBWorkerClientFactory = (name: string) => DBWorkerClientLike

interface ReadRequest {
    method: string
    args: unknown[]
    resolve: (value: any) => void
    reject: (error: unknown) => void
}

type WriterTargetResult = { targetId: string } | { error: unknown }

interface ReadWorkerLane {
    index: number
    client: DBWorkerClientLike
    targetPromise: Promise<string | null>
    busy: boolean
    healthy: boolean
}

const sqliteReadWorkerCount = 2
const createDBWorkerClient: DBWorkerClientFactory = (name) => new DBWorkerClient(name)

export default class SQLStorageProviderWorker implements StorageProvider {
    id: string
    type: 'sqlite3'
    errorHandle: Function
    onUpgradeProgress?: (progress: DatabaseUpgradeProgress) => void
    private readonly connectOpt: SQLiteOpt
    private readonly workerFactory: DBWorkerClientFactory
    private readonly writer: DBWorkerClientLike
    private readonly writerTargetPromise: Promise<WriterTargetResult>
    private readonly readLanes: ReadWorkerLane[]
    private readonly readQueue: ReadRequest[] = []
    private writeTail: Promise<void> = Promise.resolve()
    private searchIndexReady = false
    private closed = false

    constructor(
        id: string,
        type: 'sqlite3',
        connectOpt: SQLiteOpt,
        errorHandle: Function = console.error,
        workerFactory: DBWorkerClientFactory = createDBWorkerClient,
    ) {
        this.id = id
        this.type = type
        this.connectOpt = connectOpt
        this.errorHandle = errorHandle
        this.workerFactory = workerFactory
        this.writer = this.workerFactory(`icalingua-db-write-${id}`)
        this.writerTargetPromise = this.writer
            .createTarget('sql', [id, type, connectOpt], {}, (name, payload) => this.handleEvent(name, payload))
            .then((targetId) => ({ targetId }))
            .catch((error) => ({ error }))
        this.readLanes = Array.from({ length: sqliteReadWorkerCount }, (_, index) => this.createReadLane(index))
    }

    isMessageSearchIndexReady(): boolean {
        return this.searchIndexReady
    }

    async validateMessageSearchIndex(): Promise<void> {
        await this.callWriter<void>('validateMessageSearchIndex')
    }

    async connect(): Promise<void> {
        await this.enqueueWrite<void>('connect')
    }

    async addRoom(room: Room): Promise<any> {
        return this.enqueueWrite('addRoom', [room])
    }

    async updateRoom(roomId: number, room: Partial<Room>): Promise<any> {
        return this.enqueueWrite('updateRoom', [roomId, room])
    }

    async removeRoom(roomId: number): Promise<any> {
        return this.enqueueWrite('removeRoom', [roomId])
    }

    async getAllRooms(): Promise<Room[]> {
        return (await this.enqueueRead<Room[]>('getAllRooms')) || []
    }

    async getRoom(roomId: number): Promise<Room> {
        return (await this.enqueueRead<Room>('getRoom', [roomId])) || null
    }

    async addChatGroup(chatGroup: ChatGroup): Promise<any> {
        return this.enqueueWrite('addChatGroup', [chatGroup])
    }

    async updateChatGroup(name: string, chatGroup: Partial<ChatGroup>): Promise<any> {
        return this.enqueueWrite('updateChatGroup', [name, chatGroup])
    }

    async removeChatGroup(name: string): Promise<any> {
        return this.enqueueWrite('removeChatGroup', [name])
    }

    async getAllChatGroups(): Promise<ChatGroup[]> {
        return (await this.enqueueRead<ChatGroup[]>('getAllChatGroups')) || []
    }

    async getUnreadCount(priority: number): Promise<number> {
        return (await this.enqueueRead<number>('getUnreadCount', [priority])) || 0
    }

    async getFirstUnreadRoom(priority: number): Promise<Room> {
        return (await this.enqueueRead<Room>('getFirstUnreadRoom', [priority])) || null
    }

    async getIgnoredChats(): Promise<IgnoreChatInfo[]> {
        return (await this.enqueueRead<IgnoreChatInfo[]>('getIgnoredChats')) || []
    }

    async isChatIgnored(id: number): Promise<boolean> {
        return (await this.enqueueRead<boolean>('isChatIgnored', [id])) || false
    }

    async addIgnoredChat(info: IgnoreChatInfo): Promise<any> {
        return this.enqueueWrite('addIgnoredChat', [info])
    }

    async removeIgnoredChat(roomId: number): Promise<any> {
        return this.enqueueWrite('removeIgnoredChat', [roomId])
    }

    async addMessage(roomId: number, message: Message): Promise<any> {
        return this.enqueueWrite('addMessage', [roomId, message])
    }

    async updateMessage(roomId: number, messageId: string | number, message: Partial<Message>): Promise<any> {
        return this.enqueueWrite('updateMessage', [roomId, messageId, message])
    }

    async replaceMessage(roomId: number, messageId: string | number, message: Message): Promise<any> {
        return this.enqueueWrite('replaceMessage', [roomId, messageId, message])
    }

    async fetchMessages(roomId: number, options: MessagePageOptions, limit: number): Promise<Message[]> {
        return (await this.enqueueRead<Message[]>('fetchMessages', [roomId, options, limit])) || []
    }

    async fetchMessagesBySender(roomId: number, senderId: string, skip: number, limit: number): Promise<Message[]> {
        return (await this.enqueueRead<Message[]>('fetchMessagesBySender', [roomId, senderId, skip, limit])) || []
    }

    async searchMessages(
        roomId: number,
        keyword: string,
        skip: number,
        limit: number,
        senderId?: string,
    ): Promise<Message[]> {
        return (await this.enqueueRead<Message[]>('searchMessages', [roomId, keyword, skip, limit, senderId])) || []
    }

    async fetchImageMessages(roomId: number, skip: number, limit: number, endTime?: number): Promise<Message[]> {
        return (await this.enqueueRead<Message[]>('fetchImageMessages', [roomId, skip, limit, endTime])) || []
    }

    async getMessage(roomId: number, messageId: string): Promise<Message> {
        return (await this.enqueueRead<Message>('getMessage', [roomId, messageId])) || null
    }

    async fetchMessagesAround(roomId: number, messageId: string, before: number, after: number): Promise<Message[]> {
        return (await this.enqueueRead<Message[]>('fetchMessagesAround', [roomId, messageId, before, after])) || []
    }

    async countUnreadMessagesFrom(roomId: number, messageId: string | number): Promise<number> {
        return (await this.enqueueRead<number>('countUnreadMessagesFrom', [roomId, messageId])) || 0
    }

    async resolveUnreadTargetMessageId(roomId: number, unreadCount: number): Promise<string | null> {
        return (await this.enqueueRead<string | null>('resolveUnreadTargetMessageId', [roomId, unreadCount])) || null
    }

    async addMessages(roomId: number, messages: Message[]): Promise<any> {
        return this.enqueueWrite('addMessages', [roomId, messages])
    }

    async close(): Promise<void> {
        if (this.closed) return
        this.closed = true
        this.searchIndexReady = false
        while (this.readQueue.length) this.readQueue.shift()?.resolve(undefined)

        const readTerminations = this.readLanes.map((lane) =>
            lane.client.terminate().catch((error) => this.reportBackgroundError(error)),
        )
        await this.writeTail
        const target = await this.writerTargetPromise
        try {
            if ('targetId' in target) await this.writer.disposeTarget(target.targetId)
        } catch (error) {
            this.reportBackgroundError(error)
        } finally {
            await this.writer.terminate().catch((error) => this.reportBackgroundError(error))
        }
        await Promise.allSettled(readTerminations)
    }

    private createReadLane(index: number): ReadWorkerLane {
        const lane = {
            index,
            client: this.workerFactory(`icalingua-db-read-${index + 1}-${this.id}`),
            targetPromise: Promise.resolve(null),
            busy: false,
            healthy: true,
        } as ReadWorkerLane
        lane.targetPromise = this.createReadTarget(lane)
        return lane
    }

    private createReadTarget(lane: ReadWorkerLane): Promise<string | null> {
        return lane.client
            .createTarget('sqlReader', [this.id, this.type, this.connectOpt], {
                searchTimes: (keyword: string, options: SQLiteMessageSearchTimesOptions) =>
                    this.searchMessageTimes(keyword, options),
            })
            .catch((error) => {
                lane.healthy = false
                this.reportBackgroundError(error)
                return null
            })
    }

    private restartReadLane(lane: ReadWorkerLane): void {
        if (this.closed) return
        const previousClient = lane.client
        lane.client = this.workerFactory(`icalingua-db-read-${lane.index + 1}-${this.id}`)
        lane.healthy = true
        lane.targetPromise = this.createReadTarget(lane)
        void previousClient.terminate().catch((error) => this.reportBackgroundError(error))
    }

    private enqueueWrite<T>(method: string, args: unknown[] = []): Promise<T | undefined> {
        if (this.closed) return Promise.resolve(undefined)
        const operation = this.writeTail.then(() => this.callWriter<T>(method, args))
        this.writeTail = operation.then(
            () => undefined,
            () => undefined,
        )
        return operation
    }

    private async enqueueRead<T>(method: string, args: unknown[] = []): Promise<T | undefined> {
        if (this.closed) return undefined
        const precedingWrites = this.writeTail
        await precedingWrites
        if (this.closed) return undefined
        return new Promise<T | undefined>((resolve, reject) => {
            this.readQueue.push({ method, args, resolve, reject })
            this.dispatchReads()
        })
    }

    private dispatchReads(): void {
        if (this.closed) return
        while (this.readQueue.length) {
            const lane = this.readLanes.find((candidate) => candidate.healthy && !candidate.busy)
            if (!lane) {
                if (this.readLanes.some((candidate) => candidate.healthy)) return
                const request = this.readQueue.shift()
                if (request) void this.callWriter(request.method, request.args).then(request.resolve, request.reject)
                continue
            }
            const request = this.readQueue.shift()
            if (!request) return
            lane.busy = true
            void this.runRead(lane, request)
        }
    }

    private async runRead(lane: ReadWorkerLane, request: ReadRequest): Promise<void> {
        try {
            const targetId = await lane.targetPromise
            const result = targetId
                ? await lane.client.callTarget(targetId, request.method, request.args)
                : await this.callWriter(request.method, request.args)
            request.resolve(result)
        } catch (error) {
            if (this.closed) request.resolve(undefined)
            else request.reject(this.reportForegroundError(error))
        } finally {
            const shouldRestart = lane.client.isClosed && !this.closed
            lane.busy = false
            if (shouldRestart) this.restartReadLane(lane)
            this.dispatchReads()
        }
    }

    private async callWriter<T>(method: string, args: unknown[] = []): Promise<T | undefined> {
        const target = await this.writerTargetPromise
        if ('error' in target) throw this.reportForegroundError(target.error)
        try {
            return await this.writer.callTarget<T>(target.targetId, method, args)
        } catch (error) {
            if (this.closed) return undefined
            throw this.reportForegroundError(error)
        }
    }

    private async searchMessageTimes(
        keyword: string,
        options: SQLiteMessageSearchTimesOptions,
    ): Promise<number[] | null> {
        return (await this.callWriter<number[] | null>('searchMessageTimes', [keyword, options])) ?? null
    }

    private handleEvent(name: string, payload: unknown): void {
        if (name === 'upgradeProgress') {
            try {
                this.onUpgradeProgress?.(payload as DatabaseUpgradeProgress)
            } catch (error) {
                this.reportBackgroundError(error)
            }
            return
        }
        if (name === 'messageSearchStatus') {
            this.searchIndexReady = Boolean((payload as any)?.ready)
            return
        }
        if (name === 'error') this.reportBackgroundError(deserializeDBWorkerError(payload as SerializedDBWorkerError))
    }

    private reportForegroundError(error: unknown): unknown {
        try {
            this.errorHandle(error)
        } catch (reportedError) {
            return reportedError
        }
        return error
    }

    private reportBackgroundError(error: unknown): void {
        try {
            this.errorHandle(error)
        } catch {
            // Background events and shutdown cleanup must not break database queues.
        }
    }
}
