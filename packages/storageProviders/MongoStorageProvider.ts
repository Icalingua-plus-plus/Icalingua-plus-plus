import IgnoreChatInfo from '@icalingua/types/IgnoreChatInfo'
import Message from '@icalingua/types/Message'
import Room from '@icalingua/types/Room'
import ChatGroup from '@icalingua/types/ChatGroup'
import DatabaseUpgradeProgress from '@icalingua/types/DatabaseUpgradeProgress'
import StorageProvider from '@icalingua/types/StorageProvider'
import { Db, MongoClient } from 'mongodb'
import path from 'path'
import { messageMatchesKeyword, normalizeSearchText } from './MessageSearchIndex'
import SQLiteMessageSearchIndexWorker, { SQLiteSearchMessage } from './SQLiteMessageSearchIndexWorker'

export default class MongoStorageProvider implements StorageProvider {
    id: string | number
    connStr: string
    mdb: Db
    private mongoClient: MongoClient
    private searchIndex: SQLiteMessageSearchIndexWorker
    private searchRoomsCache: Room[] | null = null
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
        for (const i of rooms) {
            await this.mdb.collection('msg' + i.roomId).createIndex(
                { time: -1 },
                {
                    background: true,
                },
            )
        }
        await this.mdb.collection('ignoredChats').createIndex('id', {
            background: true,
            unique: true,
        })
        await this.mdb.collection('chatGroups').createIndex('name', {
            background: true,
            unique: true,
        })
        if (rooms.length)
            this.searchRoomsCache = rooms.slice().sort((left, right) => Number(left.roomId) - Number(right.roomId))
        await this.searchIndex.open()
    }

    async close(): Promise<void> {
        await this.searchIndex.close()
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
        if (rooms.length) this.searchRoomsCache = rooms
        return rooms
    }

    private async loadSearchTimesFromRoom(room: Room, afterTime: number, limit: number): Promise<number[]> {
        // A $group before $limit must process the whole matching suffix. The
        // sorted time-only scan can stop as soon as enough distinct times are found.
        const roomLimit = Math.max(1, Math.trunc(limit))
        const pageSize = Math.min(512, Math.max(32, roomLimit * 2))
        const collection = this.mdb.collection<any>('msg' + Number(room.roomId))
        const times: number[] = []
        let cursorTime = Math.trunc(afterTime || 0)

        while (times.length < roomLimit) {
            const rows = await collection
                .find({ time: { $gt: cursorTime } }, { projection: { _id: 0, time: 1 } })
                .sort({ time: 1 })
                .limit(pageSize)
                .toArray()
            if (!rows.length) break

            let lastTime = cursorTime
            for (const row of rows) {
                const time = Math.trunc(Number(row.time))
                if (!Number.isFinite(time) || time <= cursorTime) continue
                lastTime = time
                if (times[times.length - 1] !== time) times.push(time)
                if (times.length >= roomLimit) break
            }
            if (lastTime <= cursorTime) break
            cursorTime = lastTime
            if (rows.length < pageSize) break
        }

        return times
    }

    private async loadSearchTimeCountsFromRoom(
        room: Room,
        afterTime: number,
        limit: number,
    ): Promise<Map<number, number>> {
        const roomLimit = Math.max(1, Math.trunc(limit))
        const cursor = this.mdb
            .collection<any>('msg' + Number(room.roomId))
            .find({ time: { $gt: Math.trunc(afterTime || 0) } }, { projection: { _id: 0, time: 1 } })
            .sort({ time: 1 })
            .batchSize(Math.min(512, Math.max(32, roomLimit * 2)))

        const counts = new Map<number, number>()
        try {
            while (await cursor.hasNext()) {
                const row = await cursor.next()
                const time = Math.trunc(Number(row?.time))
                if (!Number.isFinite(time) || time <= Math.trunc(afterTime || 0)) continue
                if (!counts.has(time)) {
                    if (counts.size >= roomLimit) break
                    counts.set(time, 0)
                }
                counts.set(time, (counts.get(time) || 0) + 1)
            }
        } finally {
            await cursor.close()
        }
        return counts
    }

    private async loadSearchTimes(afterTime: number, limit: number): Promise<number[]> {
        const rooms = await this.getSearchRooms()
        const roomTimes = await Promise.all(rooms.map((room) => this.loadSearchTimesFromRoom(room, afterTime, limit)))
        const times = new Set<number>()
        for (const rows of roomTimes) {
            for (const time of rows) if (time > 0) times.add(time)
        }
        return Array.from(times)
            .sort((left, right) => left - right)
            .slice(0, Math.max(1, Math.trunc(limit)))
    }

    private async loadSearchMessagesByTimes(times: number[]): Promise<SQLiteSearchMessage[]> {
        if (!times.length) return []
        const rooms = await this.getSearchRooms()
        return (
            await Promise.all(
                rooms.map((room) =>
                    this.mdb
                        .collection<any>('msg' + Number(room.roomId))
                        .find({ time: { $in: times } }, { projection: { _id: 0, time: 1, content: 1 } })
                        .toArray(),
                ),
            )
        ).flat()
    }

    private async loadSearchTimeCounts(afterTime: number, limit: number) {
        const rooms = await this.getSearchRooms()
        const roomCounts = await Promise.all(
            rooms.map((room) => this.loadSearchTimeCountsFromRoom(room, afterTime, limit)),
        )
        const counts = new Map<number, number>()
        for (const roomCount of roomCounts) {
            for (const [time, messageCount] of roomCount) {
                if (time <= 0) continue
                counts.set(time, (counts.get(time) || 0) + messageCount)
            }
        }
        return Array.from(counts, ([time, messageCount]) => ({ time, messageCount }))
            .sort((left, right) => left.time - right.time)
            .slice(0, Math.max(1, Math.trunc(limit)))
    }

    private async countSearchMessages(): Promise<number> {
        const rooms = await this.getSearchRooms()
        const counts = await Promise.all(
            rooms.map((room) =>
                this.mdb.collection<any>('msg' + Number(room.roomId)).countDocuments({ time: { $gt: 0 } }),
            ),
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
                const allMessages: Message[] = []
                await Promise.all(
                    groupRooms.map(async (room) => {
                        const msgs = await this.mdb
                            .collection<any>('msg' + room.roomId)
                            .find({ senderId: Number(senderId) })
                            .toArray()
                        for (const msg of msgs) {
                            msg.roomId = room.roomId
                        }
                        allMessages.push(...msgs)
                    }),
                )
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
    ): Promise<Message[] | null> {
        if (!this.searchIndex.isReady) return null
        const normalized = normalizeSearchText(keyword)
        if (!normalized) return null
        try {
            const result: Message[] = []
            let skipped = 0
            let maxTime: number | undefined
            while (result.length < limit) {
                const times = await this.searchIndex.searchTimes(normalized, { maxTime, limit: 256 })
                if (times === null) return null
                if (!times.length) break
                const roomIds =
                    roomId === 0 ? (await this.getSearchRooms()).map((room) => Number(room.roomId)) : [roomId]
                const messages = (
                    await Promise.all(
                        roomIds.map((rid) =>
                            this.mdb
                                .collection<any>('msg' + rid)
                                .find({ time: { $in: times } })
                                .toArray()
                                .then((values) =>
                                    values.map((message) => (roomId === 0 ? { ...message, roomId: rid } : message)),
                                ),
                        ),
                    )
                )
                    .flat()
                    .filter((message) => messageMatchesKeyword(message, normalized))
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

    async searchMessages(roomId: number, keyword: string, skip: number, limit: number): Promise<Message[]> {
        try {
            const normalized = normalizeSearchText(keyword)
            if (normalized) {
                const indexed = await this.searchMessagesFromSearchIndex(roomId, normalized, skip, limit)
                if (indexed !== null) return indexed
            }
            const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const query = { content: { $regex: escapedKeyword, $options: 'i' } }
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
            const results = await Promise.all(
                rooms.map(async (room) => {
                    const messages = await this.mdb
                        .collection<any>('msg' + room.roomId)
                        .find(query, {
                            sort: [['time', -1]],
                            limit: perRoomLimit,
                        })
                        .toArray()
                    return messages.map((message) => ({ ...message, roomId: room.roomId })) as Message[]
                }),
            )
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
