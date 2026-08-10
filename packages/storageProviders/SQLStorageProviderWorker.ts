import ChatGroup from '@icalingua/types/ChatGroup'
import DatabaseUpgradeProgress from '@icalingua/types/DatabaseUpgradeProgress'
import IgnoreChatInfo from '@icalingua/types/IgnoreChatInfo'
import Message from '@icalingua/types/Message'
import MessagePageOptions from '@icalingua/types/MessagePage'
import Room from '@icalingua/types/Room'
import StorageProvider from '@icalingua/types/StorageProvider'
import { getDBWorkerClient } from './DBWorkerClient'
import { deserializeDBWorkerError, SerializedDBWorkerError } from './DBWorkerProtocol'

interface SQLiteOpt {
    dataPath: string
    searchDataPath?: string
}

export default class SQLStorageProviderWorker implements StorageProvider {
    id: string
    type: 'sqlite3'
    errorHandle: Function
    onUpgradeProgress?: (progress: DatabaseUpgradeProgress) => void
    private readonly worker = getDBWorkerClient()
    private readonly targetPromise: Promise<string | null>
    private searchIndexReady = false
    private closed = false

    constructor(id: string, type: 'sqlite3', connectOpt: SQLiteOpt, errorHandle: Function = console.error) {
        this.id = id
        this.type = type
        this.errorHandle = errorHandle
        this.targetPromise = this.worker
            .createTarget('sql', [id, type, connectOpt], {}, (name, payload) => this.handleEvent(name, payload))
            .catch((error) => {
                this.errorHandle(error)
                return null
            })
    }

    isMessageSearchIndexReady(): boolean {
        return this.searchIndexReady
    }

    async validateMessageSearchIndex(): Promise<void> {
        await this.call<void>('validateMessageSearchIndex')
    }

    async connect(): Promise<void> {
        await this.call<void>('connect')
    }

    async addRoom(room: Room): Promise<any> {
        return this.call('addRoom', [room])
    }

    async updateRoom(roomId: number, room: Partial<Room>): Promise<any> {
        return this.call('updateRoom', [roomId, room])
    }

    async removeRoom(roomId: number): Promise<any> {
        return this.call('removeRoom', [roomId])
    }

    async getAllRooms(): Promise<Room[]> {
        return (await this.call<Room[]>('getAllRooms')) || []
    }

    async getRoom(roomId: number): Promise<Room> {
        return (await this.call<Room>('getRoom', [roomId])) || null
    }

    async addChatGroup(chatGroup: ChatGroup): Promise<any> {
        return this.call('addChatGroup', [chatGroup])
    }

    async updateChatGroup(name: string, chatGroup: Partial<ChatGroup>): Promise<any> {
        return this.call('updateChatGroup', [name, chatGroup])
    }

    async removeChatGroup(name: string): Promise<any> {
        return this.call('removeChatGroup', [name])
    }

    async getAllChatGroups(): Promise<ChatGroup[]> {
        return (await this.call<ChatGroup[]>('getAllChatGroups')) || []
    }

    async getUnreadCount(priority: number): Promise<number> {
        return (await this.call<number>('getUnreadCount', [priority])) || 0
    }

    async getFirstUnreadRoom(priority: number): Promise<Room> {
        return (await this.call<Room>('getFirstUnreadRoom', [priority])) || null
    }

    async getIgnoredChats(): Promise<IgnoreChatInfo[]> {
        return (await this.call<IgnoreChatInfo[]>('getIgnoredChats')) || []
    }

    async isChatIgnored(id: number): Promise<boolean> {
        return (await this.call<boolean>('isChatIgnored', [id])) || false
    }

    async addIgnoredChat(info: IgnoreChatInfo): Promise<any> {
        return this.call('addIgnoredChat', [info])
    }

    async removeIgnoredChat(roomId: number): Promise<any> {
        return this.call('removeIgnoredChat', [roomId])
    }

    async addMessage(roomId: number, message: Message): Promise<any> {
        return this.call('addMessage', [roomId, message])
    }

    async updateMessage(roomId: number, messageId: string | number, message: Partial<Message>): Promise<any> {
        return this.call('updateMessage', [roomId, messageId, message])
    }

    async replaceMessage(roomId: number, messageId: string | number, message: Message): Promise<any> {
        return this.call('replaceMessage', [roomId, messageId, message])
    }

    async fetchMessages(roomId: number, options: MessagePageOptions, limit: number): Promise<Message[]> {
        return (await this.call<Message[]>('fetchMessages', [roomId, options, limit])) || []
    }

    async fetchMessagesBySender(roomId: number, senderId: string, skip: number, limit: number): Promise<Message[]> {
        return (await this.call<Message[]>('fetchMessagesBySender', [roomId, senderId, skip, limit])) || []
    }

    async searchMessages(
        roomId: number,
        keyword: string,
        skip: number,
        limit: number,
        senderId?: string,
    ): Promise<Message[]> {
        return (await this.call<Message[]>('searchMessages', [roomId, keyword, skip, limit, senderId])) || []
    }

    async fetchImageMessages(roomId: number, skip: number, limit: number, endTime?: number): Promise<Message[]> {
        return (await this.call<Message[]>('fetchImageMessages', [roomId, skip, limit, endTime])) || []
    }

    async getMessage(roomId: number, messageId: string): Promise<Message> {
        return (await this.call<Message>('getMessage', [roomId, messageId])) || null
    }

    async fetchMessagesAround(roomId: number, messageId: string, before: number, after: number): Promise<Message[]> {
        return (await this.call<Message[]>('fetchMessagesAround', [roomId, messageId, before, after])) || []
    }

    async resolveUnreadTargetMessageId(roomId: number, unreadCount: number): Promise<string | null> {
        return (await this.call<string | null>('resolveUnreadTargetMessageId', [roomId, unreadCount])) || null
    }

    async addMessages(roomId: number, messages: Message[]): Promise<any> {
        return this.call('addMessages', [roomId, messages])
    }

    async close(): Promise<void> {
        if (this.closed) return
        this.closed = true
        this.searchIndexReady = false
        const targetId = await this.targetPromise
        if (!targetId) return
        try {
            await this.worker.disposeTarget(targetId)
        } catch (error) {
            this.errorHandle(error)
        }
    }

    private async call<T>(method: string, args: unknown[] = []): Promise<T | undefined> {
        if (this.closed) return undefined
        const targetId = await this.targetPromise
        if (!targetId) return undefined
        try {
            return await this.worker.callTarget<T>(targetId, method, args)
        } catch (error) {
            this.errorHandle(error)
            return undefined
        }
    }

    private handleEvent(name: string, payload: unknown): void {
        if (name === 'upgradeProgress') {
            try {
                this.onUpgradeProgress?.(payload as DatabaseUpgradeProgress)
            } catch (error) {
                this.errorHandle(error)
            }
            return
        }
        if (name === 'messageSearchStatus') {
            this.searchIndexReady = Boolean((payload as any)?.ready)
            return
        }
        if (name === 'error') this.errorHandle(deserializeDBWorkerError(payload as SerializedDBWorkerError))
    }
}
