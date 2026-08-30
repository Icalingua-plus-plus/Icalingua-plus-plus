import IgnoreChatInfo from '@icalingua/types/IgnoreChatInfo'
import Message from '@icalingua/types/Message'
import Room from '@icalingua/types/Room'
import ChatGroup from '@icalingua/types/ChatGroup'
import DatabaseUpgradeProgress from '@icalingua/types/DatabaseUpgradeProgress'
import MessagePageOptions, { MessageCursor } from '@icalingua/types/MessagePage'
import StorageProvider from '@icalingua/types/StorageProvider'
import { Db, MongoClient } from 'mongodb'
import path from 'path'
import {
    legacyAtMetadataName,
    legacyAtMigrationVersion,
    runLegacyAtMigration,
    tryMigrateLegacyAtMessage,
} from './LegacyAtMigration'
import { normalizeSearchText } from './MessageSearchIndex'
import { messageIdTime, messageIdsEquivalent } from './MessageId'
import SQLiteMessageSearchIndexWorker, {
    SQLiteSearchMessage,
    SQLiteSearchTimeCount,
} from './SQLiteMessageSearchIndexWorker'

const mongoSearchReadConcurrency = 8
const mongoSearchIndexConcurrency = 2
const mongoSearchTimePageSize = 512
const mongoSearchMetadataCollection = '__icalingua_storage_metadata'
const mongoSearchTimeIndexMetadataId = 'message-search-time-index'
const mongoSearchTimeIndexVersion = 1

interface MongoRoomTimeScanState {
    roomId: number
    cursorTime: number
    bufferedTimes: number[]
    exhausted: boolean
}

interface MongoTimeScanState {
    lastReturnedTime: number
    rooms: MongoRoomTimeScanState[]
}

interface MongoRoomTimeCountScanState {
    roomId: number
    cursorTime: number
    bufferedCounts: SQLiteSearchTimeCount[]
    exhausted: boolean
}

interface MongoTimeCountScanState {
    lastReturnedTime: number
    rooms: MongoRoomTimeCountScanState[]
}

interface MongoTimeHeapEntry {
    time: number
    roomIndex: number
    bufferIndex: number
}

const mapWithConcurrency = async <T, R>(
    values: T[],
    concurrency: number,
    callback: (value: T, index: number) => Promise<R>,
): Promise<R[]> => {
    if (!values.length) return []
    const results = new Array<R>(values.length)
    let nextIndex = 0
    const workers = Array.from({ length: Math.min(values.length, Math.max(1, Math.trunc(concurrency))) }, async () => {
        while (true) {
            const index = nextIndex++
            if (index >= values.length) return
            results[index] = await callback(values[index], index)
        }
    })
    await Promise.all(workers)
    return results
}

const mapWithConcurrencyAndYield = async <T, R>(
    values: T[],
    concurrency: number,
    callback: (value: T, index: number) => Promise<R>,
): Promise<R[]> => {
    const results: R[] = []
    const batchSize = Math.max(1, Math.trunc(concurrency))
    for (let offset = 0; offset < values.length; offset += batchSize) {
        results.push(
            ...(await Promise.all(
                values.slice(offset, offset + batchSize).map((value, index) => callback(value, offset + index)),
            )),
        )
        if (offset + batchSize < values.length) await new Promise<void>((resolve) => setImmediate(resolve))
    }
    return results
}

const pushTimeHeap = (heap: MongoTimeHeapEntry[], entry: MongoTimeHeapEntry): void => {
    heap.push(entry)
    let index = heap.length - 1
    while (index > 0) {
        const parent = Math.floor((index - 1) / 2)
        if (heap[parent].time <= entry.time) break
        heap[index] = heap[parent]
        index = parent
    }
    heap[index] = entry
}

const popTimeHeap = (heap: MongoTimeHeapEntry[]): MongoTimeHeapEntry | undefined => {
    if (!heap.length) return undefined
    const first = heap[0]
    const last = heap.pop()
    if (!heap.length || !last) return first
    let index = 0
    while (true) {
        const left = index * 2 + 1
        if (left >= heap.length) break
        const right = left + 1
        const smaller = right < heap.length && heap[right].time < heap[left].time ? right : left
        if (heap[smaller].time >= last.time) break
        heap[index] = heap[smaller]
        index = smaller
    }
    heap[index] = last
    return first
}

export default class MongoStorageProvider implements StorageProvider {
    id: string | number
    connStr: string
    mdb: Db
    private mongoClient: MongoClient
    private searchIndex: SQLiteMessageSearchIndexWorker
    private searchRoomsCache: Room[] | null = null
    private searchTimeScan: MongoTimeScanState | null = null
    private searchTimeCountScan: MongoTimeCountScanState | null = null
    private searchBatchRoomsByTime: Map<number, number[]> | null = null
    private legacyAtMigrationPromise: Promise<void> | null = null
    private closed = false
    onUpgradeProgress?: (progress: DatabaseUpgradeProgress) => void

    constructor(connStr: string, id: string | number, searchDataPath = path.join(process.cwd(), 'data')) {
        this.id = id
        this.connStr = connStr
        this.searchIndex = new SQLiteMessageSearchIndexWorker(
            path.join(searchDataPath, 'databases', `eqq${id}_search.db`),
            {
                loadTimes: (afterTime, limit) => this.loadSearchTimes(afterTime, limit),
                loadMessagesByTimes: (times) => this.loadSearchMessagesByTimes(times),
                loadMessageTimeCounts: (afterTime, limit) => this.loadSearchTimeCounts(afterTime, limit),
                countMessages: () => this.countSearchMessages(),
                reportProgress: (progress) => this.reportUpgradeProgress(progress),
            },
        )
    }

    private reportUpgradeProgress(progress: DatabaseUpgradeProgress): void {
        try {
            this.onUpgradeProgress?.(progress)
        } catch (error) {
            console.error(error)
        }
    }

    removeIgnoredChat(id: number): Promise<any> {
        return this.mdb.collection('ignoredChats').deleteOne({ id })
    }

    async getAllRooms(): Promise<Room[]> {
        try {
            return await this.mdb
                .collection<Room>('rooms')
                .find({}, { sort: [['utime', -1]] })
                .toArray()
        } catch (e) {
            return []
        }
    }

    async getAllChatGroups(): Promise<ChatGroup[]> {
        try {
            return await this.mdb
                .collection<ChatGroup>('chatGroups')
                .find({}, { sort: [['index', 1]] })
                .toArray()
        } catch (e) {
            return []
        }
    }

    async connect(): Promise<void> {
        this.closed = false
        this.searchRoomsCache = null
        this.searchTimeScan = null
        this.searchBatchRoomsByTime = null
        this.mongoClient = await MongoClient.connect(this.connStr)
        this.mdb = this.mongoClient.db('eqq' + this.id)
        await this.mdb.collection('rooms').createIndex('roomId', {
            background: true,
            unique: true,
        })
        await this.mdb.collection('rooms').createIndex(
            { utime: -1 },
            {
                background: true,
            },
        )
        const rooms = await this.getAllRooms()
        await this.ensureSearchTimeIndexes(rooms)
        await this.repairRoomAtMessageIds(rooms)
        await this.mdb.collection('ignoredChats').createIndex('id', {
            background: true,
            unique: true,
        })
        await this.mdb.collection('chatGroups').createIndex('name', {
            background: true,
            unique: true,
        })
        this.searchRoomsCache = rooms.slice().sort((left, right) => Number(left.roomId) - Number(right.roomId))
        await this.searchIndex.open()
    }

    private async repairRoomAtMessageIds(rooms: Room[]): Promise<void> {
        for (const room of rooms) {
            if (!room.at || room.atMessageId) continue
            try {
                const atMessageId = await this.resolveRecentMessageId(room.roomId, room.unreadCount, true)
                const update: Partial<Room> = atMessageId ? { atMessageId } : { at: false, atMessageId: null }
                Object.assign(room, update)
                await this.updateRoom(room.roomId, update)
            } catch (error) {
                console.error('Failed to repair room atMessageId', room.roomId, error)
            }
        }
    }

    async close(): Promise<void> {
        this.closed = true
        if (this.legacyAtMigrationPromise) await this.legacyAtMigrationPromise
        await this.searchIndex.close()
        await this.closeSearchTimeCountScan()
        this.searchTimeScan = null
        this.searchBatchRoomsByTime = null
        this.searchRoomsCache = null
        if (this.mongoClient) {
            await this.mongoClient.close()
        }
    }

    isMessageSearchIndexReady(): boolean {
        return this.searchIndex?.isReady === true
    }

    async validateMessageSearchIndex(): Promise<void> {
        await this.searchIndex?.validate()
    }

    private async getSearchRooms(): Promise<Room[]> {
        if (this.searchRoomsCache) return this.searchRoomsCache
        const rooms = (await this.getAllRooms())
            .slice()
            .sort((left, right) => Number(left.roomId) - Number(right.roomId))
        this.searchRoomsCache = rooms
        return rooms
    }

    private async ensureRoomSearchTimeIndex(roomId: number): Promise<void> {
        // FTS rebuilds scan every room by time only. Keep this narrow index and
        // avoid making all-room cursor-index creation part of search startup.
        await this.mdb.collection('msg' + Number(roomId)).createIndex(
            { time: -1 },
            {
                background: true,
            },
        )
    }

    private async ensureSearchTimeIndexes(rooms: Room[]): Promise<void> {
        const metadata = this.mdb.collection<any>(mongoSearchMetadataCollection)
        const state = await metadata.findOne({ _id: mongoSearchTimeIndexMetadataId })
        if (Number(state?.version || 0) >= mongoSearchTimeIndexVersion) return
        await mapWithConcurrency(rooms, mongoSearchIndexConcurrency, async (room) => {
            await this.ensureRoomSearchTimeIndex(Number(room.roomId))
        })
        await metadata.updateOne(
            { _id: mongoSearchTimeIndexMetadataId },
            {
                $set: {
                    version: mongoSearchTimeIndexVersion,
                    updatedAt: new Date(),
                },
            },
            { upsert: true },
        )
    }

    private resetSearchTimeScan(): void {
        this.searchTimeScan = null
        this.searchBatchRoomsByTime = null
    }

    private async getSearchTimeScan(afterTime: number): Promise<MongoTimeScanState> {
        const normalizedAfterTime = Math.max(0, Math.trunc(Number(afterTime || 0)))
        if (this.searchTimeScan?.lastReturnedTime === normalizedAfterTime) return this.searchTimeScan
        const rooms = await this.getSearchRooms()
        this.searchBatchRoomsByTime = null
        this.searchTimeScan = {
            lastReturnedTime: normalizedAfterTime,
            rooms: rooms.map((room) => ({
                roomId: Number(room.roomId),
                cursorTime: normalizedAfterTime,
                bufferedTimes: [],
                exhausted: false,
            })),
        }
        return this.searchTimeScan
    }

    private async fillSearchTimeBuffer(state: MongoRoomTimeScanState, targetSize: number): Promise<void> {
        const collection = this.mdb.collection<any>('msg' + state.roomId)
        while (!state.exhausted && state.bufferedTimes.length < targetSize) {
            const needed = Math.max(1, targetSize - state.bufferedTimes.length)
            const pageSize = Math.min(mongoSearchTimePageSize, Math.max(64, needed * 2))
            const rows = await collection
                .find({ time: { $gt: state.cursorTime } }, { projection: { _id: 0, time: 1 } })
                .sort({ time: 1 })
                .limit(pageSize)
                .toArray()
            if (!rows.length) {
                state.exhausted = true
                return
            }

            let lastTime = state.cursorTime
            for (const row of rows) {
                const time = Math.trunc(Number(row.time))
                if (!Number.isFinite(time) || time <= state.cursorTime) continue
                lastTime = time
                if (state.bufferedTimes[state.bufferedTimes.length - 1] !== time) state.bufferedTimes.push(time)
            }
            if (lastTime <= state.cursorTime) {
                state.exhausted = true
                return
            }
            state.cursorTime = lastTime
            if (rows.length < pageSize) state.exhausted = true
        }
    }

    private async loadSearchTimes(afterTime: number, limit: number): Promise<number[]> {
        const batchSize = Math.max(1, Math.trunc(limit))
        const scan = await this.getSearchTimeScan(afterTime)
        await mapWithConcurrency(scan.rooms, mongoSearchReadConcurrency, async (room) => {
            await this.fillSearchTimeBuffer(room, batchSize)
        })

        const heap: MongoTimeHeapEntry[] = []
        for (let roomIndex = 0; roomIndex < scan.rooms.length; roomIndex++) {
            const time = scan.rooms[roomIndex].bufferedTimes[0]
            if (time > 0) pushTimeHeap(heap, { time, roomIndex, bufferIndex: 0 })
        }
        const times: number[] = []
        const roomsByTime = new Map<number, number[]>()
        while (heap.length) {
            const entry = popTimeHeap(heap) as MongoTimeHeapEntry
            const lastTime = times[times.length - 1]
            if (times.length >= batchSize && entry.time > lastTime) break
            if (entry.time !== lastTime) times.push(entry.time)
            const roomId = scan.rooms[entry.roomIndex].roomId
            const roomIds = roomsByTime.get(entry.time) || []
            roomIds.push(roomId)
            roomsByTime.set(entry.time, roomIds)
            const nextBufferIndex = entry.bufferIndex + 1
            const nextTime = scan.rooms[entry.roomIndex].bufferedTimes[nextBufferIndex]
            if (nextTime > 0) {
                pushTimeHeap(heap, { time: nextTime, roomIndex: entry.roomIndex, bufferIndex: nextBufferIndex })
            }
        }
        if (!times.length) {
            this.resetSearchTimeScan()
            return []
        }
        const lastTime = times[times.length - 1]
        for (const room of scan.rooms) {
            let consumed = 0
            while (consumed < room.bufferedTimes.length && room.bufferedTimes[consumed] <= lastTime) consumed++
            if (consumed) room.bufferedTimes = room.bufferedTimes.slice(consumed)
        }
        scan.lastReturnedTime = lastTime
        this.searchBatchRoomsByTime = roomsByTime
        return times
    }

    private async loadSearchMessageGroupsByTimes(
        times: number[],
        includeMedia = false,
    ): Promise<Array<{ roomId: number; messages: any[] }>> {
        const normalizedTimes = Array.from(
            new Set(times.map((time) => Math.trunc(Number(time))).filter((time) => time > 0)),
        )
        if (!normalizedTimes.length) return []
        const batchRoomsByTime = this.searchBatchRoomsByTime
        this.searchBatchRoomsByTime = null
        const roomTimes = new Map<number, number[]>()
        if (batchRoomsByTime && normalizedTimes.every((time) => batchRoomsByTime.has(time))) {
            for (const time of normalizedTimes) {
                for (const roomId of batchRoomsByTime.get(time) || []) {
                    const values = roomTimes.get(roomId) || []
                    values.push(time)
                    roomTimes.set(roomId, values)
                }
            }
        } else {
            const rooms = await this.getSearchRooms()
            for (const room of rooms) roomTimes.set(Number(room.roomId), normalizedTimes)
        }
        const entries = Array.from(roomTimes)
        return mapWithConcurrencyAndYield(entries, mongoSearchReadConcurrency, async ([roomId, roomSearchTimes]) => ({
            roomId,
            messages: await this.mdb
                .collection<any>('msg' + roomId)
                .find(
                    { time: { $in: roomSearchTimes } },
                    {
                        projection: {
                            _id: 1,
                            time: 1,
                            content: 1,
                            senderId: 1,
                            ...(includeMedia ? { file: 1, files: 1 } : {}),
                        },
                    },
                )
                .toArray(),
        }))
    }

    private async loadSearchMessagesByTimes(times: number[]): Promise<SQLiteSearchMessage[]> {
        return (await this.loadSearchMessageGroupsByTimes(times)).flatMap(({ roomId, messages }) =>
            messages.map((message) => ({
                time: message.time,
                content: message.content,
                roomId,
                senderId: message.senderId,
            })),
        )
    }

    private async closeSearchTimeCountScan(): Promise<void> {
        this.searchTimeCountScan = null
    }

    private async getSearchTimeCountScan(afterTime: number): Promise<MongoTimeCountScanState> {
        const normalizedAfterTime = Math.max(0, Math.trunc(Number(afterTime || 0)))
        if (this.searchTimeCountScan?.lastReturnedTime === normalizedAfterTime) return this.searchTimeCountScan
        await this.closeSearchTimeCountScan()
        const rooms = await this.getSearchRooms()
        this.searchTimeCountScan = {
            lastReturnedTime: normalizedAfterTime,
            rooms: rooms.map((room) => ({
                roomId: Number(room.roomId),
                cursorTime: normalizedAfterTime,
                bufferedCounts: [],
                exhausted: false,
            })),
        }
        return this.searchTimeCountScan
    }

    private async fillSearchTimeCountBuffer(state: MongoRoomTimeCountScanState, targetSize: number): Promise<void> {
        while (!state.exhausted && state.bufferedCounts.length < targetSize) {
            const cursor = this.mdb
                .collection<any>('msg' + state.roomId)
                .find({ time: { $gt: state.cursorTime } }, { projection: { _id: 0, time: 1 } })
                .sort({ time: 1 })
                .batchSize(mongoSearchTimePageSize)
            let currentTime: number | null = null
            let currentCount = 0
            try {
                while (state.bufferedCounts.length < targetSize) {
                    const row = await cursor.next()
                    if (!row) {
                        if (currentTime !== null) {
                            state.bufferedCounts.push({ time: currentTime, messageCount: currentCount })
                            state.cursorTime = currentTime
                        }
                        state.exhausted = true
                        break
                    }
                    const time = Math.trunc(Number(row.time))
                    if (!Number.isFinite(time) || time <= state.cursorTime) continue
                    if (currentTime === null) {
                        currentTime = time
                        currentCount = 1
                    } else if (currentTime === time) {
                        currentCount++
                    } else {
                        state.bufferedCounts.push({ time: currentTime, messageCount: currentCount })
                        state.cursorTime = currentTime
                        if (state.bufferedCounts.length >= targetSize) break
                        currentTime = time
                        currentCount = 1
                    }
                }
            } finally {
                await cursor.close().catch(() => undefined)
            }
        }
    }

    private async loadSearchTimeCounts(afterTime: number, limit: number): Promise<SQLiteSearchTimeCount[]> {
        const batchSize = Math.max(1, Math.trunc(limit))
        const scan = await this.getSearchTimeCountScan(afterTime)
        await mapWithConcurrency(scan.rooms, mongoSearchReadConcurrency, async (room) => {
            await this.fillSearchTimeCountBuffer(room, batchSize)
        })

        const heap: MongoTimeHeapEntry[] = []
        for (let roomIndex = 0; roomIndex < scan.rooms.length; roomIndex++) {
            const time = scan.rooms[roomIndex].bufferedCounts[0]?.time
            if (time > 0) pushTimeHeap(heap, { time, roomIndex, bufferIndex: 0 })
        }
        const counts: SQLiteSearchTimeCount[] = []
        while (heap.length) {
            const entry = popTimeHeap(heap) as MongoTimeHeapEntry
            const last = counts[counts.length - 1]
            if (counts.length >= batchSize && entry.time > last.time) break
            const roomCount = scan.rooms[entry.roomIndex].bufferedCounts[entry.bufferIndex]
            if (last?.time === entry.time) last.messageCount += roomCount.messageCount
            else counts.push({ time: entry.time, messageCount: roomCount.messageCount })
            const nextBufferIndex = entry.bufferIndex + 1
            const nextTime = scan.rooms[entry.roomIndex].bufferedCounts[nextBufferIndex]?.time
            if (nextTime > 0) {
                pushTimeHeap(heap, { time: nextTime, roomIndex: entry.roomIndex, bufferIndex: nextBufferIndex })
            }
        }
        if (!counts.length) {
            await this.closeSearchTimeCountScan()
            return []
        }
        const lastTime = counts[counts.length - 1].time
        for (const room of scan.rooms) {
            let consumed = 0
            while (consumed < room.bufferedCounts.length && room.bufferedCounts[consumed].time <= lastTime) consumed++
            if (consumed) room.bufferedCounts = room.bufferedCounts.slice(consumed)
        }
        scan.lastReturnedTime = lastTime
        return counts
    }

    private async countSearchMessages(): Promise<number> {
        const rooms = await this.getSearchRooms()
        // This value is used only as a progress denominator. An exact filtered
        // count scans every time index before the real build even starts.
        const counts = await mapWithConcurrency(rooms, mongoSearchReadConcurrency, async (room) =>
            this.mdb.collection<any>('msg' + Number(room.roomId)).estimatedDocumentCount(),
        )
        return counts.reduce((total, count) => total + Number(count || 0), 0)
    }

    private async syncSearchIndex(messages: Message[]): Promise<void> {
        await this.searchIndex.syncMessages(messages)
    }

    private async migrateLegacyAtBatch(times: number[]): Promise<boolean> {
        const syncGeneration = await this.searchIndex.getSyncGeneration()
        const messageGroups = await this.loadSearchMessageGroupsByTimes(times, true)
        let completeTimeGroupsReliable = syncGeneration !== null
        await mapWithConcurrencyAndYield(messageGroups, mongoSearchReadConcurrency, async ({ roomId, messages }) => {
            const collection = this.mdb.collection<any>('msg' + roomId)
            const migratedMessages = new Map<string, ReturnType<typeof tryMigrateLegacyAtMessage>>()
            const operations = messages
                .map((message) => {
                    const migrated = tryMigrateLegacyAtMessage(message)
                    if (!message._id || !migrated || migrated.content === String(message.content ?? '')) return null
                    const messageId = String(message._id)
                    migratedMessages.set(messageId, migrated)
                    const update: Record<string, unknown> = { content: migrated.content }
                    if (migrated.mediaChanged) {
                        if (Object.prototype.hasOwnProperty.call(message, 'file')) update.file = migrated.file
                        if (Object.prototype.hasOwnProperty.call(message, 'files')) update.files = migrated.files
                    }
                    return {
                        updateOne: {
                            filter: { _id: message._id, content: message.content },
                            update: { $set: update },
                        },
                    }
                })
                .filter((operation): operation is NonNullable<typeof operation> => operation !== null)
            if (operations.length) {
                const result = await collection.bulkWrite(operations, { ordered: false })
                if (typeof result?.modifiedCount === 'number' && result.modifiedCount !== operations.length) {
                    completeTimeGroupsReliable = false
                }
            }
            if (completeTimeGroupsReliable) {
                for (const message of messages) {
                    const migrated = migratedMessages.get(String(message._id))
                    if (!migrated) continue
                    message.content = migrated.content
                    if (migrated.mediaChanged) {
                        if (Object.prototype.hasOwnProperty.call(message, 'file')) message.file = migrated.file
                        if (Object.prototype.hasOwnProperty.call(message, 'files')) message.files = migrated.files
                    }
                }
            }
        })
        if (completeTimeGroupsReliable && syncGeneration !== null) {
            const completeTimeGroups = messageGroups.flatMap(({ roomId, messages }) =>
                messages.map((message) => ({
                    time: message.time,
                    content: message.content,
                    roomId,
                    senderId: message.senderId,
                })),
            )
            await this.searchIndex.syncMessages(completeTimeGroups, syncGeneration)
            return true
        }
        return false
    }

    async migrateLegacyAtMessages(): Promise<void> {
        if (this.closed || !this.mdb || !this.searchIndex?.isReady) return
        if (this.legacyAtMigrationPromise) return this.legacyAtMigrationPromise

        let migrationPromise: Promise<void>
        migrationPromise = new Promise<void>((resolve) => setImmediate(resolve))
            .then(() => this.runLegacyAtMigration())
            .finally(() => {
                if (this.legacyAtMigrationPromise === migrationPromise) this.legacyAtMigrationPromise = null
            })
        this.legacyAtMigrationPromise = migrationPromise
        return migrationPromise
    }

    private async runLegacyAtMigration(): Promise<void> {
        if (this.closed || !this.mdb) return
        const metadata = this.mdb.collection<any>(mongoSearchMetadataCollection)
        await runLegacyAtMigration({
            searchIndex: this.searchIndex,
            isClosed: () => this.closed,
            hasCompleted: async () => {
                const state = await metadata.findOne({ _id: legacyAtMetadataName })
                return String(state?.value || '') === legacyAtMigrationVersion
            },
            migrateBatch: (times) => this.migrateLegacyAtBatch(times),
            markCompleted: async () => {
                await metadata.updateOne(
                    { _id: legacyAtMetadataName },
                    { $set: { value: legacyAtMigrationVersion, updatedAt: new Date() } },
                    { upsert: true },
                )
            },
            reportProgress: (progress) => this.reportUpgradeProgress(progress),
        })
    }

    async addMessage(roomId: number, message: Message): Promise<any> {
        try {
            const { _id, ...fields } = message as any
            const result = await this.mdb
                .collection('msg' + roomId)
                .updateOne({ _id: message._id }, { $setOnInsert: fields }, { upsert: true })
            if (!result.upsertedCount) return
            await this.syncSearchIndex([message])
            return result
        } catch (error) {}
    }

    async addRoom(room: Room): Promise<any> {
        try {
            const result = await this.mdb.collection('rooms').insertOne(room)
            this.searchRoomsCache = null
            this.resetSearchTimeScan()
            await this.ensureRoomSearchTimeIndex(Number(room.roomId)).catch((error) => console.error(error))
            return result
        } catch (e) {}
    }

    async addChatGroup(chatGroup: ChatGroup): Promise<any> {
        try {
            return await this.mdb.collection('chatGroups').insertOne(chatGroup)
        } catch (e) {}
    }

    async updateMessage(roomId: number, messageId: string | number, message: Partial<Message>): Promise<any> {
        try {
            const collection = this.mdb.collection<any>('msg' + roomId)
            const current = await collection.findOne({ _id: messageId })
            if (!current) return
            const merged = { ...current, ...message } as Message
            const searchContentChanged =
                String(current.content || '') !== String(merged.content || '') ||
                Number(current.time || 0) !== Number(merged.time || 0)
            const { _id, ...fields } = merged as any
            const result = await collection.updateOne({ _id: current._id }, { $set: fields })
            if (searchContentChanged) {
                await this.searchIndex.requestRebuild([Number(current.time || 0), Number(merged.time || 0)])
            }
            return result
        } catch (error) {}
    }

    async replaceMessage(roomId: number, messageId: string | number, message: Message): Promise<any> {
        return await this.updateMessage(roomId, messageId, message)
    }

    private compareMessageOrder(left: Message, right: Message): number {
        const timeDifference = Number(left.time || 0) - Number(right.time || 0)
        if (timeDifference) return timeDifference
        const leftId = String(left._id)
        const rightId = String(right._id)
        return leftId < rightId ? -1 : leftId > rightId ? 1 : 0
    }

    private validateMessagePageOptions(options: MessagePageOptions): void {
        if (options?.before && options?.after) throw new Error('Message page cannot use before and after together')
    }

    private async fetchMessagePage(
        roomId: number,
        options: MessagePageOptions,
        limit: number,
        projection?: Record<string, 0 | 1>,
    ): Promise<Message[]> {
        this.validateMessagePageOptions(options)
        const pageSize = Math.max(1, Math.trunc(limit))
        const direction = options?.after ? 1 : -1
        const cursor = options?.before || options?.after
        const collection = this.mdb.collection<any>('msg' + roomId)
        const candidates: Message[] = []

        if (cursor) {
            const cursorId = String(cursor.id)
            const sameTime = (await collection
                .find({ time: cursor.time }, projection ? { projection } : undefined)
                .toArray()) as Message[]
            candidates.push(
                ...sameTime.filter((message) =>
                    options.after ? String(message._id) > cursorId : String(message._id) < cursorId,
                ),
            )
        }

        if (candidates.length < pageSize) {
            const timeQuery = cursor ? { time: { [options.after ? '$gt' : '$lt']: cursor.time } } : {}
            const timeRows = await collection
                .find(timeQuery, { projection: { _id: 0, time: 1 } })
                .sort({ time: direction })
                .limit(pageSize - candidates.length)
                .toArray()
            const times = Array.from(
                new Set(timeRows.map((message) => Number(message.time)).filter((time) => Number.isFinite(time))),
            )
            if (times.length) {
                candidates.push(
                    ...((await collection
                        .find({ time: { $in: times } }, projection ? { projection } : undefined)
                        .toArray()) as Message[]),
                )
            }
        }

        candidates.sort((left, right) => direction * this.compareMessageOrder(left, right))
        const page = candidates.slice(0, pageSize)
        return options?.after ? page : page.reverse()
    }

    async fetchMessages(roomId: number, options: MessagePageOptions, limit: number): Promise<Message[]> {
        return this.fetchMessagePage(roomId, options, limit)
    }

    private async resolveRecentMessageId(roomId: number, unreadCount: number, atOnly: boolean): Promise<string | null> {
        let remaining = Math.max(0, Math.trunc(Number(unreadCount) || 0))
        if (!remaining) return null

        const pageSize = 100
        let options: MessagePageOptions = {}
        while (remaining > 0) {
            const page = await this.fetchMessagePage(roomId, options, pageSize, {
                _id: 1,
                time: 1,
                system: 1,
                at: 1,
            })
            if (!page.length) return null

            for (let index = page.length - 1; index >= 0; index--) {
                const message = page[index]
                if (message.system) continue
                remaining--
                if ((!atOnly && remaining === 0) || (atOnly && message.at)) return String(message._id)
                if (remaining === 0) return null
            }

            if (page.length < pageSize) return null
            const firstMessage = page[0]
            options = { before: { time: Number(firstMessage.time || 0), id: firstMessage._id } }
        }
        return null
    }

    async countUnreadMessagesFrom(roomId: number, messageId: string | number): Promise<number> {
        const target = await this.getMessage(roomId, String(messageId))
        if (!target) return 0

        const targetTime = Number(target.time || 0)
        const targetId = String(target._id)
        const collection = this.mdb.collection<any>('msg' + roomId)
        const [newerCount, sameTimeMessages] = await Promise.all([
            collection.countDocuments({ system: { $ne: true }, time: { $gt: targetTime } }),
            collection
                .find(
                    { system: { $ne: true }, time: targetTime },
                    {
                        projection: {
                            _id: 1,
                        },
                    },
                )
                .toArray(),
        ])
        const sameTimeCount = sameTimeMessages.filter((message) => String(message._id) >= targetId).length
        return Number(newerCount || 0) + sameTimeCount
    }

    async resolveUnreadTargetMessageId(roomId: number, unreadCount: number): Promise<string | null> {
        return this.resolveRecentMessageId(roomId, unreadCount, false)
    }

    /** 按发送者查询消息记录。
     * @param roomId 房间 ID，为 0 时查询所有群（roomId < 0）
     * @param senderId 发送者 ID（字符串）
     */
    async fetchMessagesBySender(roomId: number, senderId: string, skip: number, limit: number): Promise<Message[]> {
        const normalizedSkip = Number.isFinite(skip) ? Math.max(0, Math.trunc(skip)) : 0
        const normalizedLimit = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 0
        if (!normalizedLimit) return []

        try {
            if (roomId === 0) {
                // 所有群模式：每个群只读取当前全局分页所需的前置结果，避免拉取该发送者的全部历史
                const rooms = await this.getSearchRooms()
                const groupRooms = rooms.filter((r) => r.roomId < 0)
                const roomLimit = normalizedSkip + normalizedLimit
                if (!Number.isSafeInteger(roomLimit)) return []
                const roomMessages = await mapWithConcurrency(groupRooms, mongoSearchReadConcurrency, async (room) => {
                    const msgs = await this.mdb
                        .collection<any>('msg' + room.roomId)
                        .find(
                            { senderId: Number(senderId) },
                            {
                                sort: [['time', -1]],
                                limit: roomLimit,
                            },
                        )
                        .toArray()
                    for (const msg of msgs) {
                        msg.roomId = room.roomId
                    }
                    return msgs as Message[]
                })
                const allMessages = roomMessages.flat()
                allMessages.sort((a, b) => b.time - a.time)
                return allMessages.slice(normalizedSkip, normalizedSkip + normalizedLimit).reverse()
            } else {
                const arr = await this.mdb
                    .collection<any>('msg' + roomId)
                    .find(
                        { senderId: Number(senderId) },
                        {
                            sort: [['time', -1]],
                            skip: normalizedSkip,
                            limit: normalizedLimit,
                        },
                    )
                    .toArray()
                return arr.reverse()
            }
        } catch (e) {
            return []
        }
    }

    /** 按关键字搜索消息记录。
     * @param roomId 房间 ID，为 0 时搜索全部会话
     * @param keyword 搜索关键字
     */
    private async searchMessagesFromSearchIndex(
        roomId: number,
        keyword: string,
        skip: number,
        limit: number,
        senderId?: string,
        startTime?: number,
        endTime?: number,
    ): Promise<Message[] | null> {
        if (!this.searchIndex.isReady) return null
        const normalized = normalizeSearchText(keyword)
        if (!normalized) return null
        try {
            const result: Message[] = []
            let skipped = 0
            let maxTime: number | undefined = endTime
            const roomIds = roomId === 0 ? (await this.getSearchRooms()).map((room) => Number(room.roomId)) : [roomId]
            const escapedKeyword = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            while (result.length < limit) {
                const times = await this.searchIndex.searchTimes(normalized, {
                    maxTime,
                    minTime: startTime,
                    roomId: roomId === 0 ? undefined : roomId,
                    senderId,
                    limit: 256,
                })
                if (times === null) return null
                if (!times.length) break
                const messages = (
                    await mapWithConcurrency(roomIds, mongoSearchReadConcurrency, async (rid) =>
                        this.mdb
                            .collection<any>('msg' + rid)
                            .find({
                                time: { $in: times },
                                content: { $regex: escapedKeyword, $options: 'i' },
                                ...(senderId === undefined ? {} : { senderId: Number(senderId) }),
                            })
                            .toArray()
                            .then((values) =>
                                values.map((message) => (roomId === 0 ? { ...message, roomId: rid } : message)),
                            ),
                    )
                ).flat()
                messages.sort((left, right) => {
                    const timeDifference = Number(right.time || 0) - Number(left.time || 0)
                    if (timeDifference) return timeDifference
                    return String(right._id).localeCompare(String(left._id))
                })
                for (const message of messages) {
                    if (skipped < skip) {
                        skipped++
                        continue
                    }
                    result.push(message)
                    if (result.length >= limit) break
                }
                const lastTime = Number(times[times.length - 1])
                maxTime = lastTime - 1
                if (lastTime <= 0) break
            }
            return result
        } catch (error) {
            return null
        }
    }

    async searchMessages(
        roomId: number,
        keyword: string,
        skip: number,
        limit: number,
        senderId?: string,
        startTime?: number,
        endTime?: number,
    ): Promise<Message[]> {
        try {
            const normalized = normalizeSearchText(keyword)
            if (normalized) {
                const indexed = await this.searchMessagesFromSearchIndex(
                    roomId,
                    normalized,
                    skip,
                    limit,
                    senderId,
                    startTime,
                    endTime,
                )
                if (indexed !== null) return indexed
            }
            const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const query = {
                ...(normalized ? { content: { $regex: escapedKeyword, $options: 'i' } } : {}),
                ...(senderId === undefined ? {} : { senderId: Number(senderId) }),
                ...(startTime === undefined && endTime === undefined
                    ? {}
                    : {
                          time: {
                              ...(startTime === undefined ? {} : { $gte: startTime }),
                              ...(endTime === undefined ? {} : { $lte: endTime }),
                          },
                      }),
            }
            if (roomId !== 0) {
                return await this.mdb
                    .collection<any>('msg' + roomId)
                    .find(query, {
                        sort: [['time', -1]],
                        skip,
                        limit,
                    })
                    .toArray()
            }

            const rooms = await this.getAllRooms()
            const perRoomLimit = skip + limit
            const results = await mapWithConcurrency(rooms, mongoSearchReadConcurrency, async (room) => {
                const messages = await this.mdb
                    .collection<any>('msg' + room.roomId)
                    .find(query, {
                        sort: [['time', -1]],
                        limit: perRoomLimit,
                    })
                    .toArray()
                return messages.map((message) => ({ ...message, roomId: room.roomId })) as Message[]
            })
            return results
                .flat()
                .sort((a, b) => (b.time || 0) - (a.time || 0))
                .slice(skip, skip + limit)
        } catch (e) {
            return []
        }
    }

    async fetchImageMessages(roomId: number, skip: number, limit: number, endTime?: number): Promise<Message[]> {
        const query: any = {
            'files.type': { $regex: /^image\// },
        }
        if (endTime) {
            query.time = { $lte: endTime }
        }
        const arr = await this.mdb
            .collection<any>('msg' + roomId)
            .find(query, {
                sort: [['time', -1]],
                skip,
                limit,
            })
            .toArray()
        return arr
    }

    async removeRoom(roomId: number): Promise<any> {
        try {
            const result = await this.mdb.collection('rooms').findOneAndDelete({ roomId: roomId })
            this.searchRoomsCache = null
            this.resetSearchTimeScan()
            return result
        } catch (e) {}
    }

    async updateRoom(roomId: number, room: Partial<Room>): Promise<any> {
        try {
            return await this.mdb.collection('rooms').updateOne({ roomId: roomId }, { $set: room })
        } catch (e) {}
    }

    async removeChatGroup(name: string): Promise<any> {
        try {
            return await this.mdb.collection('chatGroups').findOneAndDelete({ name: name })
        } catch (e) {}
    }

    async updateChatGroup(name: string, chatGroup: Partial<ChatGroup>): Promise<any> {
        try {
            return await this.mdb.collection('chatGroups').updateOne({ name: name }, { $set: chatGroup })
        } catch (e) {}
    }

    private messageIdQuery(messageId: string | number): any {
        const candidates: Array<string | number> = [messageId]
        const stringId = String(messageId)
        if (!candidates.includes(stringId)) candidates.push(stringId)
        const numericId = Number(stringId)
        if (Number.isSafeInteger(numericId) && String(numericId) === stringId && !candidates.includes(numericId)) {
            candidates.push(numericId)
        }
        return { _id: { $in: candidates } }
    }

    private async findMessageRecord(roomId: number, messageId: string): Promise<Message | null> {
        const collection = this.mdb.collection<any>('msg' + roomId)
        const exactMessage = await collection.findOne(this.messageIdQuery(messageId))
        if (exactMessage) return exactMessage

        const time = messageIdTime(messageId)
        if (time === null) return null
        const targetTime = time * 1000
        const candidates = await collection
            .find({ time: { $gte: targetTime - 2000, $lte: targetTime + 2000 } })
            .sort({ time: 1 })
            .toArray()
        return candidates.find((candidate) => messageIdsEquivalent(candidate._id, messageId)) || null
    }

    getMessage(roomId: number, messageId: string): Promise<Message> {
        return this.findMessageRecord(roomId, messageId)
    }

    async fetchMessagesAround(roomId: number, messageId: string, before: number, after: number): Promise<Message[]> {
        const targetMsg = await this.findMessageRecord(roomId, messageId)
        if (!targetMsg) return []

        const cursor: MessageCursor = { time: Number(targetMsg.time || 0), id: targetMsg._id }
        const [beforeMessages, afterMessages] = await Promise.all([
            before > 0 ? this.fetchMessages(roomId, { before: cursor }, before) : Promise.resolve([]),
            after > 0 ? this.fetchMessages(roomId, { after: cursor }, after) : Promise.resolve([]),
        ])
        return [...beforeMessages, targetMsg, ...afterMessages]
    }

    async addMessages(roomId: number, messages: Message[]): Promise<any> {
        const uniqueMessages = new Map<string, Message>()
        for (const message of messages) {
            const key = `${typeof message._id}:${String(message._id)}`
            if (!uniqueMessages.has(key)) uniqueMessages.set(key, message)
        }
        const messagesToInsert = Array.from(uniqueMessages.values())
        if (!messagesToInsert.length) return
        let result: any
        let writeError: any
        try {
            result = await this.mdb.collection('msg' + roomId).bulkWrite(
                messagesToInsert.map((message) => {
                    const { _id, ...fields } = message as any
                    return {
                        updateOne: {
                            filter: { _id: message._id },
                            update: { $setOnInsert: fields },
                            upsert: true,
                        },
                    }
                }),
                { ordered: false },
            )
        } catch (error) {
            writeError = error
            result = (error as any)?.result
        }
        const insertedMessages = Object.keys(result?.upsertedIds || {}).map((index) => messagesToInsert[Number(index)])
        await this.syncSearchIndex(insertedMessages.filter(Boolean))
        return writeError || result
    }

    getRoom(roomId: number): Promise<Room> {
        return this.mdb.collection<any>('rooms').findOne({ roomId })
    }

    getUnreadCount(priority: number): Promise<number> {
        const unreadRooms = this.mdb.collection('rooms').find({
            unreadCount: {
                $gt: 0,
            },
            priority: {
                $gte: priority,
            },
        })
        return unreadRooms.count()
    }

    getFirstUnreadRoom(priority: number): Promise<Room> {
        return this.mdb.collection<any>('rooms').findOne({
            unreadCount: {
                $gt: 0,
            },
            priority: {
                $gte: priority,
            },
        })
    }

    addIgnoredChat(info: IgnoreChatInfo): Promise<any> {
        return this.mdb.collection('ignoredChats').insertOne(info)
    }

    getIgnoredChats(): Promise<IgnoreChatInfo[]> {
        return this.mdb.collection<IgnoreChatInfo>('ignoredChats').find().toArray()
    }

    async isChatIgnored(id: number): Promise<boolean> {
        return !!(await this.mdb.collection('ignoredChats').findOne({ id }))
    }
}
