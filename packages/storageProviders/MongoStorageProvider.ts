import IgnoreChatInfo from '@icalingua/types/IgnoreChatInfo'
import Message from '@icalingua/types/Message'
import MessagePageOptions from '@icalingua/types/MessagePage'
import Room from '@icalingua/types/Room'
import ChatGroup from '@icalingua/types/ChatGroup'
import StorageProvider from '@icalingua/types/StorageProvider'
import DatabaseUpgradeProgress from '@icalingua/types/DatabaseUpgradeProgress'
import { Db, MongoClient } from 'mongodb'
import path from 'path'
import {
    buildSearchGrams,
    compareMessageDesc,
    isBeforeCursor,
    messageMatchesKeyword,
    normalizeSearchText,
} from './MessageSearchIndex'
import SQLiteMessageSearchIndex, { SQLiteSearchCursor, SQLiteSearchMessage } from './SQLiteMessageSearchIndex'

export default class MongoStorageProvider implements StorageProvider {
    id: string | number
    connStr: string
    mdb: Db
    private mongoClient: MongoClient
    private searchIndex: SQLiteMessageSearchIndex
    private readonly searchIndexVersion = 1
    onUpgradeProgress?: (progress: DatabaseUpgradeProgress) => void

    constructor(connStr: string, id: string | number, searchDataPath = path.join(process.cwd(), 'data')) {
        this.id = id
        this.connStr = connStr
        this.searchIndex = new SQLiteMessageSearchIndex(path.join(searchDataPath, 'databases', `eqq${id}_search.db`), {
            loadBatch: (cursor, limit) => this.loadSearchBatch(cursor, limit),
            loadMessagesByTimes: (times) => this.loadSearchMessagesByTimes(times),
            loadMessageTimeCounts: (afterTime, limit) => this.loadSearchTimeCounts(afterTime, limit),
            countMessages: () => this.countSearchMessages(),
            reportProgress: (progress) => this.reportUpgradeProgress(progress),
        })
    }

    private reportUpgradeProgress(progress: DatabaseUpgradeProgress) {
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
        this.mongoClient = await MongoClient.connect(this.connStr)
        this.mdb = this.mongoClient.db('eqq' + this.id)
        await this.mdb.collection('rooms').createIndex('roomId', { background: true, unique: true })
        await this.mdb.collection('rooms').createIndex({ utime: -1 }, { background: true })
        const rooms = await this.getAllRooms()
        for (const room of rooms) await this.ensureMessageCollectionIndexes(room.roomId)
        await this.mdb.collection('ignoredChats').createIndex('id', { background: true, unique: true })
        await this.mdb.collection('chatGroups').createIndex('name', { background: true, unique: true })
        await this.searchIndex.open()
        if ((await this.searchIndex.getState('legacyMongoSearchRemoved')) !== '1') {
            try {
                await this.mdb.dropCollection('messageSearch')
            } catch {}
            try {
                await this.mdb.dropCollection('messageSearchMeta')
            } catch {}
            await this.searchIndex.setState('legacyMongoSearchRemoved', '1')
        }
    }

    async close(): Promise<void> {
        await this.searchIndex.close()
        if (this.mongoClient) await this.mongoClient.close()
    }

    isMessageSearchIndexReady(): boolean {
        return this.searchIndex?.isReady === true
    }

    async validateMessageSearchIndex(): Promise<void> {
        await this.searchIndex?.validate()
    }

    private searchDocument(roomId: number, message: Message) {
        return {
            roomId,
            messageId: String(message._id),
            senderId: Number(message.senderId),
            time: Number(message.time || 0),
            content: message.content || '',
            grams: buildSearchGrams(message.content),
        }
    }

    private async syncSearchDocuments(roomId: number, messages: Message[]) {
        if (!messages.length) return
        await this.mdb.collection('messageSearch').bulkWrite(
            messages.map((message) => ({
                updateOne: {
                    filter: { roomId, messageId: String(message._id) },
                    update: { $set: this.searchDocument(roomId, message) },
                    upsert: true,
                },
            })),
            { ordered: false },
        )
    }

    private messageIdCandidates(messageId: string | number): Array<string | number> {
        const candidates: Array<string | number> = [messageId, String(messageId)]
        const numericId = Number(messageId)
        if (Number.isFinite(numericId)) candidates.push(numericId)
        return Array.from(new Set(candidates))
    }

    private messageIdQuery(messageId: string | number) {
        return { _id: { $in: this.messageIdCandidates(messageId) } }
    }

    private async loadSearchBatch(
        cursor: SQLiteSearchCursor | undefined,
        limit: number,
    ): Promise<SQLiteSearchMessage[]> {
        const rooms = await this.getAllRooms()
        let roomIndex = 0
        let time = 0
        let id: any = undefined
        if (cursor) {
            try {
                const value = JSON.parse(cursor.id)
                roomIndex = Math.max(0, Number(value.roomIndex || 0))
                id = value.value
                time = Number(cursor.time || 0)
            } catch {
                return []
            }
        }

        while (roomIndex < rooms.length) {
            const roomId = Number(rooms[roomIndex].roomId)
            const conditions: any[] = [{ time: { $gt: time } }]
            if (id !== undefined) conditions.push({ time, _id: { $gt: id } })
            const messages = await this.mdb
                .collection<any>('msg' + roomId)
                .find({ $or: conditions }, { projection: { _id: 1, time: 1, content: 1 } })
                .sort({ time: 1, _id: 1 })
                .limit(limit)
                .toArray()
            if (messages.length) {
                return messages.map((message) => ({
                    ...message,
                    id: JSON.stringify({ roomIndex, value: message._id }),
                }))
            }
            roomIndex++
            time = 0
            id = undefined
        }
        return []
    }

    private async loadSearchMessagesByTimes(times: number[]): Promise<SQLiteSearchMessage[]> {
        if (!times.length) return []
        const rooms = await this.getAllRooms()
        return (
            await Promise.all(
                rooms.map((room) =>
                    this.mdb
                        .collection<any>('msg' + Number(room.roomId))
                        .find({ time: { $in: times } }, { projection: { _id: 1, time: 1, content: 1 } })
                        .toArray(),
                ),
            )
        ).flat()
    }

    private async loadSearchTimeCounts(afterTime: number, limit: number) {
        const rooms = await this.getAllRooms()
        const roomCounts = await Promise.all(
            rooms.map((room) =>
                this.mdb
                    .collection<any>('msg' + Number(room.roomId))
                    .aggregate([
                        { $match: { time: { $gt: Math.trunc(afterTime || 0) } } },
                        { $group: { _id: '$time', messageCount: { $sum: 1 } } },
                        { $sort: { _id: 1 } },
                        { $limit: Math.max(1, Math.trunc(limit)) },
                    ])
                    .toArray(),
            ),
        )
        const counts = new Map<number, number>()
        for (const rows of roomCounts) {
            for (const row of rows) {
                const time = Math.trunc(Number(row._id))
                if (time <= 0) continue
                counts.set(time, (counts.get(time) || 0) + Math.max(0, Number(row.messageCount || 0)))
            }
        }
        return Array.from(counts, ([time, messageCount]) => ({ time, messageCount }))
            .sort((left, right) => left.time - right.time)
            .slice(0, Math.max(1, Math.trunc(limit)))
    }

    private async countSearchMessages(): Promise<number> {
        const rooms = await this.getAllRooms()
        const counts = await Promise.all(
            rooms.map((room) =>
                this.mdb.collection<any>('msg' + Number(room.roomId)).countDocuments({ time: { $gt: 0 } }),
            ),
        )
        return counts.reduce((total, count) => total + Number(count || 0), 0)
    }

    private async queueSearchMessages(messages: Message[], needsRebuild = false) {
        await this.searchIndex.queueMessages(messages, needsRebuild)
    }

    private async syncSearchIndex(messages: Message[]) {
        await this.searchIndex.syncMessages(messages)
    }

    private async ensureMessageCollectionIndexes(roomId: number) {
        await this.mdb.collection('msg' + roomId).createIndex({ time: -1, _id: -1 }, { background: true })
        await this.mdb.collection('msg' + roomId).createIndex({ senderId: 1, time: -1, _id: -1 }, { background: true })
    }

    private async rebuildMessageSearchIndex() {
        await this.mdb.collection('messageSearch').deleteMany({})
        for (const room of await this.getAllRooms()) {
            const messages = await this.mdb
                .collection<any>('msg' + room.roomId)
                .find({}, { projection: { _id: 1, senderId: 1, time: 1, content: 1, files: 1, file: 1 } })
                .toArray()
            if (!messages.length) continue
            await this.syncSearchDocuments(room.roomId, messages as Message[])
        }
    }

    private applyCursor(query: any, options: MessagePageOptions, includeRoomId = false, idField = '_id') {
        const conditions: any[] = []
        if (options?.endTime !== undefined) conditions.push({ time: { $lte: options.endTime } })
        const cursor = options?.before
        if (cursor) {
            if (includeRoomId && cursor.roomId !== undefined) {
                conditions.push({
                    $or: [
                        { time: { $lt: cursor.time } },
                        { time: cursor.time, roomId: { $lt: cursor.roomId } },
                        { time: cursor.time, roomId: cursor.roomId, [idField]: { $lt: cursor.id } },
                    ],
                })
            } else {
                conditions.push({
                    $or: [{ time: { $lt: cursor.time } }, { time: cursor.time, [idField]: { $lt: cursor.id } }],
                })
            }
        }
        return conditions.length ? { $and: [query, ...conditions] } : query
    }

    private async hydrateSearchDocuments(documents: any[], includeRoomId: boolean): Promise<Message[]> {
        const grouped = new Map<number, string[]>()
        for (const document of documents) {
            const ids = grouped.get(Number(document.roomId)) || []
            ids.push(String(document.messageId))
            grouped.set(Number(document.roomId), ids)
        }
        const originals = new Map<string, Message>()
        await Promise.all(
            Array.from(grouped.entries()).map(async ([roomId, ids]) => {
                const candidates = Array.from(new Set(ids.flatMap((id) => this.messageIdCandidates(id))))
                const messages = await this.mdb
                    .collection<any>('msg' + roomId)
                    .find({ _id: { $in: candidates } })
                    .toArray()
                for (const message of messages) originals.set(`${roomId}:${String(message._id)}`, message as Message)
            }),
        )
        return documents
            .map((document) => {
                const message = originals.get(`${document.roomId}:${document.messageId}`)
                if (!message) return null
                return includeRoomId ? ({ ...message, roomId: Number(document.roomId) } as Message) : message
            })
            .filter(Boolean) as Message[]
    }

    async addMessage(roomId: number, message: Message): Promise<any> {
        const storedMessage = message
        let result
        await this.queueSearchMessages([storedMessage])
        try {
            result = await this.mdb.collection('msg' + roomId).insertOne(storedMessage as object)
        } catch (e) {}
        try {
            await this.syncSearchIndex([storedMessage])
        } catch (e) {}
        return result
    }

    async addRoom(room: Room): Promise<any> {
        try {
            const result = await this.mdb.collection('rooms').insertOne(room)
            await this.ensureMessageCollectionIndexes(room.roomId)
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
            const current = await this.mdb.collection<any>('msg' + roomId).findOne(this.messageIdQuery(messageId))
            if (!current) return
            const merged = {
                ...current,
                ...message,
                _id: current._id,
            }
            const searchContentChanged =
                String(current.content || '') !== String(merged.content || '') ||
                Number(current.time || 0) !== Number(merged.time || 0)
            await this.queueSearchMessages([merged], searchContentChanged)
            const { _id, ...fields } = merged
            const result = await this.mdb.collection('msg' + roomId).updateOne({ _id: current._id }, { $set: fields })
            if (searchContentChanged) await this.searchIndex.requestRebuild(Number(merged.time || current.time || 0))
            else await this.syncSearchIndex([merged])
            return result
        } catch (e) {}
    }

    async replaceMessage(roomId: number, messageId: string | number, message: Message): Promise<any> {
        return await this.updateMessage(roomId, messageId, message)
    }

    async fetchMessages(roomId: number, options: MessagePageOptions, limit: number): Promise<Message[]> {
        const query = this.applyCursor({}, options, false, '_id')
        const documents = await this.mdb
            .collection<any>('msg' + roomId)
            .find(query, {
                sort: [
                    ['time', -1],
                    ['_id', -1],
                ],
                limit,
            })
            .toArray()
        return documents.reverse()
    }

    async fetchMessagesInTimeRange(
        roomId: number,
        startTime?: number,
        endTime?: number,
        limit?: number,
    ): Promise<Message[]> {
        const query: any = {}
        if (startTime !== undefined || endTime !== undefined) query.time = {}
        if (startTime !== undefined) query.time.$gte = startTime
        if (endTime !== undefined) query.time.$lte = endTime
        const options: any = {
            sort: [
                ['time', -1],
                ['_id', -1],
            ],
        }
        if (limit !== undefined) options.limit = limit
        const documents = await this.mdb
            .collection<any>('msg' + roomId)
            .find(query, options)
            .toArray()
        return documents.reverse()
    }

    /** 按发送者查询消息记录。
     * @param roomId 房间 ID，为 0 时查询所有群（roomId < 0）
     * @param senderId 发送者 ID（字符串）
     */
    async fetchMessagesBySender(
        roomId: number,
        senderId: string,
        options: MessagePageOptions,
        limit: number,
    ): Promise<Message[]> {
        try {
            const roomIds =
                roomId === 0
                    ? (await this.getAllRooms()).filter((r) => r.roomId < 0).map((room) => Number(room.roomId))
                    : [roomId]
            const messages = (
                await Promise.all(
                    roomIds.map(async (rid) => {
                        const query = this.applyCursor({ senderId: Number(senderId) }, options, false, '_id')
                        const values = await this.mdb
                            .collection<any>('msg' + rid)
                            .find(query, {
                                sort: [
                                    ['time', -1],
                                    ['_id', -1],
                                ],
                                limit,
                            })
                            .toArray()
                        return values.map((message) => (roomId === 0 ? { ...message, roomId: rid } : message))
                    }),
                )
            ).flat()
            const filtered = messages.filter(
                (message) =>
                    (options?.endTime === undefined || Number(message.time || 0) <= options.endTime) &&
                    isBeforeCursor(message, options?.before),
            )
            filtered.sort(compareMessageDesc)
            return filtered.slice(0, limit).reverse()
        } catch (e) {
            return []
        }
    }

    private async searchMessagesFromSearchTimes(
        roomId: number,
        keyword: string,
        options: MessagePageOptions,
        limit: number,
    ): Promise<Message[] | null> {
        if (!this.searchIndex.isReady) return null
        const normalized = normalizeSearchText(keyword)
        if (!normalized) return null
        let upperTime = options?.endTime
        if (options?.before) {
            upperTime = upperTime === undefined ? options.before.time : Math.min(upperTime, options.before.time)
        }
        const result: Message[] = []
        while (result.length < limit && (upperTime === undefined || upperTime >= 0)) {
            const times = await this.searchIndex.searchTimes(normalized, { maxTime: upperTime, limit: 256 })
            if (times === null) return null
            if (!times.length) break
            const roomIds = roomId === 0 ? (await this.getAllRooms()).map((room) => Number(room.roomId)) : [roomId]
            const messages = (
                await Promise.all(
                    roomIds.map((rid) =>
                        this.mdb
                            .collection<any>('msg' + rid)
                            .find({ time: { $in: times } })
                            .toArray()
                            .then((values) => values.map((message) => ({ ...message, roomId: rid }))),
                    ),
                )
            )
                .flat()
                .filter(
                    (message) =>
                        (options?.endTime === undefined || Number(message.time || 0) <= options.endTime) &&
                        isBeforeCursor(message, options?.before) &&
                        messageMatchesKeyword(message, normalized),
                )
            messages.sort(compareMessageDesc)
            for (const message of messages) {
                if (roomId !== 0) delete (message as any).roomId
                result.push(message)
                if (result.length >= limit) break
            }
            upperTime = Number(times[times.length - 1]) - 1
        }
        return result.slice(0, limit)
    }

    /** 按关键字搜索消息记录。
     * @param roomId 房间 ID，为 0 时搜索全部会话
     * @param keyword 搜索关键字
     */
    async searchMessages(
        roomId: number,
        keyword: string,
        options: MessagePageOptions,
        limit: number,
    ): Promise<Message[]> {
        try {
            const normalized = normalizeSearchText(keyword)
            if (normalized) {
                const indexed = await this.searchMessagesFromSearchTimes(roomId, keyword, options, limit)
                if (indexed !== null) return indexed
            }
            const roomIds = roomId === 0 ? (await this.getAllRooms()).map((room) => Number(room.roomId)) : [roomId]
            const messages = (
                await Promise.all(
                    roomIds.map((rid) =>
                        this.mdb
                            .collection<any>('msg' + rid)
                            .find({})
                            .sort({ time: -1, _id: -1 })
                            .limit(Math.max(limit * 4, limit))
                            .toArray()
                            .then((values) => values.map((message) => ({ ...message, roomId: rid }))),
                    ),
                )
            )
                .flat()
                .filter(
                    (message) =>
                        (options?.endTime === undefined || Number(message.time || 0) <= options.endTime) &&
                        isBeforeCursor(message, options?.before) &&
                        (!normalized || messageMatchesKeyword(message, normalized)),
                )
            messages.sort(compareMessageDesc)
            return messages.slice(0, limit).map((message) => {
                if (roomId !== 0) delete (message as any).roomId
                return message
            })
        } catch (e) {
            return []
        }
    }

    async fetchImageMessages(roomId: number, options: MessagePageOptions, limit: number): Promise<Message[]> {
        const query = this.applyCursor({ 'files.type': { $regex: /^image\// } }, options, false, '_id')
        const documents = await this.mdb
            .collection<any>('msg' + roomId)
            .find(query, {
                sort: [
                    ['time', -1],
                    ['_id', -1],
                ],
                limit,
            })
            .toArray()
        return documents
    }

    async removeRoom(roomId: number): Promise<any> {
        try {
            return await this.mdb.collection('rooms').findOneAndDelete({ roomId })
        } catch (e) {}
    }

    async updateRoom(roomId: number, room: Partial<Room>): Promise<any> {
        try {
            return await this.mdb.collection('rooms').updateOne({ roomId }, { $set: room })
        } catch (e) {}
    }

    async removeChatGroup(name: string): Promise<any> {
        try {
            return await this.mdb.collection('chatGroups').findOneAndDelete({ name })
        } catch (e) {}
    }

    async updateChatGroup(name: string, chatGroup: Partial<ChatGroup>): Promise<any> {
        try {
            return await this.mdb.collection('chatGroups').updateOne({ name }, { $set: chatGroup })
        } catch (e) {}
    }

    getMessage(roomId: number, messageId: string): Promise<Message> {
        return this.mdb.collection<any>('msg' + roomId).findOne(this.messageIdQuery(messageId))
    }

    async fetchMessagesAround(roomId: number, messageId: string, before: number, after: number): Promise<Message[]> {
        // 先获取目标消息的时间
        const targetMsg = await this.mdb.collection<any>('msg' + roomId).findOne(this.messageIdQuery(messageId))
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
        const storedMessages = messages
        let result
        await this.queueSearchMessages(storedMessages)
        try {
            if (storedMessages.length)
                result = await this.mdb
                    .collection('msg' + roomId)
                    .insertMany(storedMessages as object[], { ordered: false })
        } catch (e) {
            result = e
        }
        try {
            await this.syncSearchIndex(storedMessages)
        } catch (e) {
            if (!result) result = e
        }
        return result
    }

    getRoom(roomId: number): Promise<Room> {
        return this.mdb.collection<any>('rooms').findOne({ roomId })
    }

    getUnreadCount(priority: number): Promise<number> {
        return this.mdb
            .collection('rooms')
            .find({ unreadCount: { $gt: 0 }, priority: { $gte: priority } })
            .count()
    }

    getFirstUnreadRoom(priority: number): Promise<Room> {
        return this.mdb.collection<any>('rooms').findOne({ unreadCount: { $gt: 0 }, priority: { $gte: priority } })
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
