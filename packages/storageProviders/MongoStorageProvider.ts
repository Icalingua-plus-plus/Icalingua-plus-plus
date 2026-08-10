import IgnoreChatInfo from '@icalingua/types/IgnoreChatInfo'
import Message from '@icalingua/types/Message'
import Room from '@icalingua/types/Room'
import ChatGroup from '@icalingua/types/ChatGroup'
import DatabaseUpgradeProgress from '@icalingua/types/DatabaseUpgradeProgress'
import StorageProvider from '@icalingua/types/StorageProvider'
import { Db, MongoClient } from 'mongodb'
import path from 'path'
import { normalizeSearchText } from './MessageSearchIndex'
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

    async close(): Promise<void> {
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

    private async loadSearchMessagesByTimes(times: number[]): Promise<SQLiteSearchMessage[]> {
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
        return (
            await mapWithConcurrency(entries, mongoSearchReadConcurrency, async ([roomId, roomSearchTimes]) =>
                this.mdb
                    .collection<any>('msg' + roomId)
                    .find({ time: { $in: roomSearchTimes } }, { projection: { _id: 0, time: 1, content: 1 } })
                    .toArray(),
            )
        ).flat()
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
            } else await this.syncSearchIndex([merged])
            return result
        } catch (error) {}
    }

    async replaceMessage(roomId: number, messageId: string | number, message: Message): Promise<any> {
        return await this.updateMessage(roomId, messageId, message)
    }

    async fetchMessages(roomId: number, skip: number, limit: number): Promise<Message[]> {
        const arr = await this.mdb
            .collection<any>('msg' + roomId)
            .find(
                {},
                {
                    sort: [['time', -1]],
                    skip,
                    limit,
                },
            )
            .toArray()
        return arr.reverse()
    }

    /** 按发送者查询消息记录。
     * @param roomId 房间 ID，为 0 时查询所有群（roomId < 0）
     * @param senderId 发送者 ID（字符串）
     */
    async fetchMessagesBySender(roomId: number, senderId: string, skip: number, limit: number): Promise<Message[]> {
        try {
            if (roomId === 0) {
                // 所有群模式：遍历所有群集合
                const rooms = await this.getAllRooms()
                const groupRooms = rooms.filter((r) => r.roomId < 0)
                const roomMessages = await mapWithConcurrency(groupRooms, mongoSearchReadConcurrency, async (room) => {
                    const msgs = await this.mdb
                        .collection<any>('msg' + room.roomId)
                        .find({ senderId: Number(senderId) })
                        .toArray()
                    for (const msg of msgs) {
                        msg.roomId = room.roomId
                    }
                    return msgs as Message[]
                })
                const allMessages = roomMessages.flat()
                allMessages.sort((a, b) => b.time - a.time)
                return allMessages.slice(skip, skip + limit).reverse()
            } else {
                const arr = await this.mdb
                    .collection<any>('msg' + roomId)
                    .find(
                        { senderId: Number(senderId) },
                        {
                            sort: [['time', -1]],
                            skip,
                            limit,
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
    ): Promise<Message[] | null> {
        if (!this.searchIndex.isReady) return null
        const normalized = normalizeSearchText(keyword)
        if (!normalized) return null
        try {
            const result: Message[] = []
            let skipped = 0
            let maxTime: number | undefined
            const roomIds = roomId === 0 ? (await this.getSearchRooms()).map((room) => Number(room.roomId)) : [roomId]
            const escapedKeyword = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            while (result.length < limit) {
                const times = await this.searchIndex.searchTimes(normalized, { maxTime, limit: 256 })
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
    ): Promise<Message[]> {
        try {
            const normalized = normalizeSearchText(keyword)
            if (normalized) {
                const indexed = await this.searchMessagesFromSearchIndex(roomId, normalized, skip, limit, senderId)
                if (indexed !== null) return indexed
            }
            const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const query = {
                content: { $regex: escapedKeyword, $options: 'i' },
                ...(senderId === undefined ? {} : { senderId: Number(senderId) }),
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

    getMessage(roomId: number, messageId: string): Promise<Message> {
        return this.mdb.collection<any>('msg' + roomId).findOne({ _id: messageId })
    }

    async fetchMessagesAround(roomId: number, messageId: string, before: number, after: number): Promise<Message[]> {
        // 先获取目标消息的时间
        const targetMsg = await this.mdb.collection<any>('msg' + roomId).findOne({ _id: messageId })
        if (!targetMsg) return []

        const targetTime = targetMsg.time

        // 获取目标消息之前的消息
        const beforeMessages = await this.mdb
            .collection<any>('msg' + roomId)
            .find({ time: { $lt: targetTime } }, { sort: [['time', -1]], limit: before })
            .toArray()

        // 获取目标消息及之后的消息
        const afterMessages = await this.mdb
            .collection<any>('msg' + roomId)
            .find({ time: { $gte: targetTime } }, { sort: [['time', 1]], limit: after + 1 })
            .toArray()

        // 合并并按时间排序
        return [...beforeMessages.reverse(), ...afterMessages]
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
