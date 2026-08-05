import Redis from 'ioredis'
import path from 'path'
import { compact } from 'lodash'
import IgnoreChatInfo from '@icalingua/types/IgnoreChatInfo'
import Message from '@icalingua/types/Message'
import MessagePageOptions from '@icalingua/types/MessagePage'
import Room from '@icalingua/types/Room'
import ChatGroup from '@icalingua/types/ChatGroup'
import StorageProvider from '@icalingua/types/StorageProvider'
import DatabaseUpgradeProgress from '@icalingua/types/DatabaseUpgradeProgress'
import { compareMessageDesc, isBeforeCursor, messageMatchesKeyword, normalizeSearchText } from './MessageSearchIndex'
import SQLiteMessageSearchIndex, { SQLiteSearchCursor, SQLiteSearchMessage } from './SQLiteMessageSearchIndex'

export default class RedisStorageProvider implements StorageProvider {
    qid: string
    connStr: string
    redis: Redis.Redis
    private searchIndex: SQLiteMessageSearchIndex
    onUpgradeProgress?: (progress: DatabaseUpgradeProgress) => void

    /** `constructor` 方法。 */
    constructor(connStr: string, id: string, searchDataPath = path.join(process.cwd(), 'data')) {
        this.connStr = connStr
        this.qid = `eqq:${id}`
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

    /** `connect` 方法。在这里与数据库建立连接。 */
    async connect(): Promise<void> {
        this.redis = new Redis(this.connStr)
        const cleanupMarker = `${this.qid}:search:sqlite-sidecar-v1`
        if ((await this.redis.get(cleanupMarker)) !== '1') {
            await this.clearLegacyTextSearchIndex()
            await this.redis.set(cleanupMarker, '1')
        }
        const imageCleanupMarker = `${this.qid}:search:image-zset-removed-v1`
        if ((await this.redis.get(imageCleanupMarker)) !== '1') {
            await this.clearLegacyImageSearchIndex()
            await this.redis.set(imageCleanupMarker, '1')
        }
        await this.searchIndex.open()
    }

    async close(): Promise<void> {
        await this.searchIndex.close()
        if (this.redis) await this.redis.quit()
    }

    isMessageSearchIndexReady(): boolean {
        return this.searchIndex?.isReady === true
    }

    async validateMessageSearchIndex(): Promise<void> {
        await this.searchIndex?.validate()
    }

    private roomMessageKey(roomId: number) {
        return `${this.qid}:msg${roomId}:messages`
    }

    private roomMessageListKey(roomId: number) {
        return `${this.qid}:msg${roomId}:msgIdList`
    }

    private gramPart(gram: string) {
        return encodeURIComponent(gram)
    }

    private roomGramKey(roomId: number, gram: string) {
        return `${this.qid}:search:room:${roomId}:gram:${this.gramPart(gram)}`
    }

    private globalGramKey(gram: string) {
        return `${this.qid}:search:global:gram:${this.gramPart(gram)}`
    }

    private roomSenderKey(roomId: number, senderId: string | number) {
        return `${this.qid}:search:room:${roomId}:sender:${senderId}`
    }

    private globalSenderKey(senderId: string | number) {
        return `${this.qid}:search:global:sender:${senderId}`
    }

    private globalMember(roomId: number, messageId: string | number) {
        return `${roomId}:${messageId}`
    }

    private parseGlobalMember(member: string) {
        const separator = member.indexOf(':')
        return { roomId: Number(member.slice(0, separator)), messageId: member.slice(separator + 1) }
    }

    private async syncMessageIndexes(roomId: number, message: Message, oldMessage?: Message) {
        const member = this.globalMember(roomId, message._id)
        const pipeline = this.redis.pipeline()
        if (oldMessage) {
            const oldMember = this.globalMember(roomId, oldMessage._id)
            pipeline.zrem(this.roomMessageListKey(roomId), String(oldMessage._id))
            pipeline.zrem(this.roomSenderKey(roomId, oldMessage.senderId), String(oldMessage._id))
            pipeline.zrem(this.globalSenderKey(oldMessage.senderId), oldMember)
        }
        const score = Number(message.time || 0)
        pipeline.zadd(this.roomMessageListKey(roomId), score, String(message._id))
        pipeline.zadd(this.roomSenderKey(roomId, message.senderId), score, String(message._id))
        pipeline.zadd(this.globalSenderKey(message.senderId), score, member)
        await pipeline.exec()
    }

    private async loadSearchBatch(
        cursor: SQLiteSearchCursor | undefined,
        limit: number,
    ): Promise<SQLiteSearchMessage[]> {
        const rooms = await this.getAllRooms()
        let roomIndex = 0
        let offset = 0
        if (cursor) {
            try {
                const value = JSON.parse(cursor.id)
                roomIndex = Math.max(0, Number(value.roomIndex || 0))
                offset = Math.max(0, Number(value.offset || 0))
            } catch {
                return []
            }
        }
        while (roomIndex < rooms.length) {
            const roomId = Number(rooms[roomIndex].roomId)
            const ids = await this.redis.zrange(this.roomMessageListKey(roomId), offset, offset + limit - 1)
            if (!ids.length) {
                roomIndex++
                offset = 0
                continue
            }
            const messages = await this.getMessages(roomId, ids)
            const byId = new Map(messages.map((message) => [String(message._id), message]))
            const result: SQLiteSearchMessage[] = []
            ids.forEach((id, index) => {
                const message = byId.get(String(id))
                if (!message) return
                result.push({
                    ...message,
                    id: JSON.stringify({ roomIndex, offset: offset + index + 1 }),
                })
            })
            if (result.length) return result
            offset += ids.length
        }
        return []
    }

    private async loadSearchMessagesByTimes(times: number[]): Promise<SQLiteSearchMessage[]> {
        if (!times.length) return []
        const minTime = Math.min(...times)
        const maxTime = Math.max(...times)
        const wanted = new Set(times.map((time) => Number(time)))
        const rooms = await this.getAllRooms()
        const values = await Promise.all(
            rooms.map(async (room) => {
                const roomId = Number(room.roomId)
                const ids = await this.redis.zrangebyscore(this.roomMessageListKey(roomId), minTime, maxTime)
                const messages = await this.getMessages(roomId, ids)
                return messages.filter((message) => wanted.has(Number(message.time || 0)))
            }),
        )
        return values.flat()
    }

    private async loadSearchTimeCounts(afterTime: number, limit: number) {
        const rooms = await this.getAllRooms()
        const roomCounts = await Promise.all(
            rooms.map(async (room) => {
                const key = this.roomMessageListKey(Number(room.roomId))
                const counts = new Map<number, number>()
                let lowerTime = Math.trunc(afterTime || 0)
                while (counts.size < Math.max(1, Math.trunc(limit))) {
                    const minScore = lowerTime > 0 ? `(${lowerTime}` : '-inf'
                    const values = await (this.redis.zrangebyscore as any)(
                        key,
                        minScore,
                        '+inf',
                        'WITHSCORES',
                        'LIMIT',
                        0,
                        Math.max(1, Math.trunc(limit)),
                    )
                    if (!values.length) break
                    const scores = Array.from(
                        new Set<number>(
                            values
                                .filter((_: unknown, index: number) => index % 2 === 1)
                                .map((value: unknown) => Math.trunc(Number(value)))
                                .filter((time: number) => time > 0),
                        ),
                    )
                    if (!scores.length) break
                    const pipeline = this.redis.pipeline()
                    scores.forEach((time) => pipeline.zcount(key, String(time), String(time)))
                    const result = await pipeline.exec()
                    scores.forEach((time, index) => {
                        counts.set(time, Math.max(0, Number(result?.[index]?.[1] || 0)))
                    })
                    const nextTime = Math.max(...scores)
                    if (nextTime <= lowerTime) break
                    lowerTime = nextTime
                }
                return counts
            }),
        )
        const counts = new Map<number, number>()
        for (const roomCountsForRoom of roomCounts) {
            for (const [time, messageCount] of roomCountsForRoom) {
                counts.set(time, (counts.get(time) || 0) + messageCount)
            }
        }
        return Array.from(counts, ([time, messageCount]) => ({ time, messageCount }))
            .sort((left, right) => left.time - right.time)
            .slice(0, Math.max(1, Math.trunc(limit)))
    }

    private async countSearchMessages(): Promise<number> {
        const rooms = await this.getAllRooms()
        const counts = await Promise.all(
            rooms.map((room) => this.redis.zcard(this.roomMessageListKey(Number(room.roomId)))),
        )
        return counts.reduce((total, count) => total + Number(count || 0), 0)
    }

    private async queueSearchMessages(messages: Message[], needsRebuild = false) {
        await this.searchIndex.queueMessages(messages, needsRebuild)
    }

    private async syncSearchIndex(messages: Message[]) {
        await this.searchIndex.syncMessages(messages)
    }

    private async ensureMessageSearchIndex() {
        await this.searchIndex.open()
    }

    private async clearLegacyTextSearchIndex() {
        let cursor = '0'
        do {
            const [nextCursor, keys] = await (this.redis.scan as any)(
                cursor,
                'MATCH',
                `${this.qid}:search:*gram:*`,
                'COUNT',
                500,
            )
            if (keys.length) await this.redis.del(...keys)
            cursor = nextCursor
        } while (cursor !== '0')
    }

    private async clearLegacyImageSearchIndex() {
        let cursor = '0'
        do {
            const [nextCursor, keys] = await (this.redis.scan as any)(
                cursor,
                'MATCH',
                `${this.qid}:search:room:*:image`,
                'COUNT',
                500,
            )
            if (keys.length) await this.redis.del(...keys)
            cursor = nextCursor
        } while (cursor !== '0')
    }

    private async clearMessageSearchIndex() {
        let cursor = '0'
        do {
            const [nextCursor, keys] = await (this.redis.scan as any)(
                cursor,
                'MATCH',
                `${this.qid}:search:*`,
                'COUNT',
                500,
            )
            if (keys.length) await this.redis.del(...keys)
            cursor = nextCursor
        } while (cursor !== '0')
    }

    private async getMessages(roomId: number, ids: string[], includeRoomId = false): Promise<Message[]> {
        if (!ids.length) return []
        const messages = await Promise.all(
            ids.map(async (id) => {
                const raw = await this.redis.hget(this.roomMessageKey(roomId), id)
                if (!raw) return null
                const message = JSON.parse(raw) as Message
                if (includeRoomId) message.roomId = roomId
                return message
            }),
        )
        return messages.filter(Boolean) as Message[]
    }

    private async getGlobalMessages(members: string[]): Promise<Message[]> {
        if (!members.length) return []
        const messages = await Promise.all(
            members.map(async (member) => {
                const { roomId, messageId } = this.parseGlobalMember(member)
                const raw = await this.redis.hget(this.roomMessageKey(roomId), messageId)
                if (!raw) return null
                return { ...(JSON.parse(raw) as Message), roomId }
            }),
        )
        return messages.filter(Boolean) as Message[]
    }

    private async getRoomPageIds(roomId: number, options: MessagePageOptions, limit: number, key?: string) {
        const indexKey = key || this.roomMessageListKey(roomId)
        const cursor = options?.before
        const maxScore = options?.endTime === undefined ? '+inf' : String(options.endTime)
        if (!cursor) return this.redis.zrevrangebyscore(indexKey, maxScore, '-inf', 'LIMIT', 0, limit)
        const sameTime = (await this.redis.zrevrangebyscore(indexKey, cursor.time, cursor.time)).filter(
            (id) => String(id) < cursor.id,
        )
        if (sameTime.length >= limit) return sameTime.slice(0, limit)
        const older = await this.redis.zrevrangebyscore(
            indexKey,
            `(${cursor.time}`,
            '-inf',
            'LIMIT',
            0,
            limit - sameTime.length,
        )
        return [...sameTime, ...older]
    }

    private sortAscending(messages: Message[]) {
        return messages.sort((left, right) => compareMessageDesc(right, left))
    }

    /** 实现 {@link StorageProvider} 类的 `getIgnoredChats` 方法，
     * 是对 `ignoredChats` 的“查所有”操作。
     *
     * 在用户查询忽略聊天列表时被调用。
     */
    async getIgnoredChats(): Promise<IgnoreChatInfo[]> {
        const values = await this.redis.hvals(`${this.qid}:rooms:ignored`)
        return values.map((value) => JSON.parse(value))
    }

    /** 实现 {@link StorageProvider} 类的 `isChatIgnored` 方法，
     * 是对 `ignoredChats` 的自定义查询操作。返回一个**布尔**值。
     *
     * 在收到消息时被调用。
     */
    async isChatIgnored(id: number): Promise<boolean> {
        return (await this.redis.hexists(`${this.qid}:rooms:ignored`, String(id))) === 1
    }

    /** 实现 {@link StorageProvider} 类的 `addIgnoredChat` 方法，
     * 是对 `ignoredChats` 的“增”操作。
     *
     * 在忽略聊天时被调用。
     */
    async addIgnoredChat(info: IgnoreChatInfo): Promise<any> {
        return this.redis.hset(`${this.qid}:rooms:ignored`, String(info.id), JSON.stringify(info))
    }

    /** 实现 {@link StorageProvider} 类的 `removeIgnoredChat` 方法，
     * 是对 `ignoredChats` 的“删”操作。
     *
     * 在取消忽略聊天时被调用。
     */
    async removeIgnoredChat(roomId: number): Promise<any> {
        return this.redis.hdel(`${this.qid}:rooms:ignored`, String(roomId))
    }

    /** 实现 {@link StorageProvider} 类的 `getRoom` 方法，
     * 对应 room 的“查单个”操作。
     *
     * 在进入房间后被调用。
     */
    async getRoom(roomId: number): Promise<Room> {
        const raw = await this.redis.hget(`${this.qid}:rooms:rooms`, String(roomId))
        if (!raw) return null
        const room = JSON.parse(raw) as Room
        return { ...room, roomId: Number(room.roomId) }
    }

    /** 实现 {@link StorageProvider} 类的 `updateRoom` 方法，
     * 对应 room 的“改”操作。
     *
     * 在“收到新消息”等引起房间信息变化的事件时调用。
     */
    async updateRoom(roomId: number, room: Partial<Room>): Promise<void> {
        const current = await this.getRoom(roomId)
        const updated = { ...current, ...room }
        await this.redis.hset(`${this.qid}:rooms:rooms`, String(roomId), JSON.stringify(updated))
        await this.redis.zadd(`${this.qid}:rooms:keyList`, updated.utime, String(roomId))
        await this.redis.zadd(`${this.qid}:rooms:priority`, updated.priority, String(roomId))
    }

    /** 实现 {@link StorageProvider} 类的 `addRoom` 方法，
     * 对应 room 的“增”操作。
     *
     * 在“新房间收到新消息”等需要新增房间的事件时被调用。
     */
    async addRoom(room: Room): Promise<void> {
        await this.redis.hset(`${this.qid}:rooms:rooms`, String(room.roomId), JSON.stringify(room))
        if (room.utime) await this.redis.zadd(`${this.qid}:rooms:keyList`, room.utime, String(room.roomId))
        if (room.priority) await this.redis.zadd(`${this.qid}:rooms:priority`, room.priority, String(room.roomId))
    }

    async removeRoom(roomId: number): Promise<void> {
        await this.redis.hdel(`${this.qid}:rooms:rooms`, String(roomId))
        await this.redis.zrem(`${this.qid}:rooms:keyList`, String(roomId))
        await this.redis.zrem(`${this.qid}:rooms:priority`, String(roomId))
    }

    /** 实现 {@link StorageProvider} 类的 `getAllRooms` 方法，
     * 对应 room 的“查所有”操作。
     *
     * 在登录成功后调用。
     */
    async getAllRooms(): Promise<Room[]> {
        const ids = await this.redis.zrevrange(`${this.qid}:rooms:keyList`, 0, -1)
        const rooms = await Promise.all(ids.map((id) => this.getRoom(Number(id))))
        return rooms.filter(Boolean)
    }

    /** 实现 {@link StorageProvider} 类的 `updateChatGroup` 方法，
     * 对应 chatGroup 的“改”操作。
     *
     * 在“编辑分组”等改变聊天分组时调用。
     */
    async updateChatGroup(name: string, chatGroup: Partial<ChatGroup>): Promise<void> {
        const raw = await this.redis.hget(`${this.qid}:chatGroups:rooms`, name)
        const updated = { ...(raw ? JSON.parse(raw) : {}), ...chatGroup }
        await this.redis.hset(`${this.qid}:chatGroups:rooms`, name, JSON.stringify(updated))
        await this.redis.zadd(`${this.qid}:chatGroups:keyList`, updated.index, name)
    }

    /** 实现 {@link StorageProvider} 类的 `addChatGroup` 方法，
     * 对应 chatGroup 的“增”操作。
     *
     * 在“编辑分组”等需要新增聊天分组时被调用。
     */
    async addChatGroup(chatGroup: ChatGroup): Promise<void> {
        await this.redis.hset(`${this.qid}:chatGroups:rooms`, chatGroup.name, JSON.stringify(chatGroup))
        if (chatGroup.index) await this.redis.zadd(`${this.qid}:chatGroups:keyList`, chatGroup.index, chatGroup.name)
    }

    /** 实现 {@link StorageProvider} 类的 `removeChatGroup` 方法，
     * 对应 chatGroup 的“删”操作。
     *
     * 在删除聊天分组时调用。
     */
    async removeChatGroup(name: string): Promise<void> {
        await this.redis.hdel(`${this.qid}:chatGroups:rooms`, name)
        await this.redis.zrem(`${this.qid}:chatGroups:keyList`, name)
    }

    /** 实现 {@link StorageProvider} 类的 `getAllChatGroups` 方法，
     * 对应 chatGroup 的“查所有”操作。
     *
     * 在登录成功后调用。
     */
    async getAllChatGroups(): Promise<ChatGroup[]> {
        const names = await this.redis.zrevrange(`${this.qid}:chatGroups:keyList`, 0, -1)
        const groups = await Promise.all(
            names.map(async (name) => JSON.parse(await this.redis.hget(`${this.qid}:chatGroups:rooms`, name))),
        )
        return groups.filter(Boolean)
    }

    /** 实现 {@link StorageProvider} 类的 `addMessage` 方法，
     * 是对 `msg${roomId}` 的“增”操作。
     *
     * 在收到消息时被调用。
     */
    async addMessage(roomId: number, message: Message): Promise<void> {
        const oldRaw = await this.redis.hget(this.roomMessageKey(roomId), String(message._id))
        const storedMessage = message
        await this.queueSearchMessages([storedMessage])
        await this.redis.hset(this.roomMessageKey(roomId), String(message._id), JSON.stringify(storedMessage))
        await this.syncMessageIndexes(roomId, storedMessage, oldRaw ? JSON.parse(oldRaw) : undefined)
        await this.syncSearchIndex([storedMessage])
    }

    /** 实现 {@link StorageProvider} 类的 `updateMessage` 方法，
     * 是对 `msg${roomId}` 的“改”操作。
     *
     * 在“用户撤回消息”等需要改动消息内容的事件中被调用。
     */
    async updateMessage(roomId: number, messageId: string | number, message: Partial<Message>): Promise<any> {
        const raw = await this.redis.hget(this.roomMessageKey(roomId), String(messageId))
        if (!raw) return
        const oldMessage = JSON.parse(raw) as Message
        const updated = {
            ...oldMessage,
            ...message,
            _id: oldMessage._id,
        } as Message
        const searchContentChanged =
            String(oldMessage.content || '') !== String(updated.content || '') ||
            Number(oldMessage.time || 0) !== Number(updated.time || 0)
        await this.queueSearchMessages([updated], searchContentChanged)
        await this.redis.hset(this.roomMessageKey(roomId), String(messageId), JSON.stringify(updated))
        await this.syncMessageIndexes(roomId, updated, oldMessage)
        if (searchContentChanged) await this.searchIndex.requestRebuild(Number(updated.time || oldMessage.time || 0))
        else await this.syncSearchIndex([updated])
    }

    /** 实现 {@link StorageProvider} 类的 `replaceMessage` 方法，
     * 是对 `msg${roomId}` 的“改”操作。
     *
     * 在“重新获取消息内容”等需要改动消息内容的事件中被调用。
     */
    async replaceMessage(roomId: number, messageId: string | number, message: Message): Promise<any> {
        return this.updateMessage(roomId, messageId, message)
    }

    /** 实现 {@link StorageProvider} 类的 `fetchMessage` 方法，
     * 是对 `msg${roomId}` 的"查多个"操作。
     *
     * 在进入房间时，该方法被调用。
     */
    async fetchMessages(roomId: number, options: MessagePageOptions, limit: number): Promise<Message[]> {
        const ids = await this.getRoomPageIds(roomId, options, limit)
        return this.sortAscending(await this.getMessages(roomId, ids))
    }

    async fetchMessagesInTimeRange(
        roomId: number,
        startTime?: number,
        endTime?: number,
        limit?: number,
    ): Promise<Message[]> {
        const args: any[] = [
            this.roomMessageListKey(roomId),
            endTime === undefined ? '+inf' : String(endTime),
            startTime === undefined ? '-inf' : String(startTime),
        ]
        if (limit !== undefined) args.push('LIMIT', 0, limit)
        const ids = await (this.redis.zrevrangebyscore as any)(...args)
        return this.sortAscending(await this.getMessages(roomId, ids))
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
        if (roomId !== 0) {
            const ids = await this.getRoomPageIds(roomId, options, limit, this.roomSenderKey(roomId, senderId))
            return this.sortAscending(await this.getMessages(roomId, ids))
        }
        const members = await this.redis.zrevrangebyscore(this.globalSenderKey(senderId), '+inf', '-inf')
        const messages = (await this.getGlobalMessages(members)).filter(
            (message) =>
                (options?.endTime === undefined || Number(message.time || 0) <= options.endTime) &&
                Number(message.senderId) === Number(senderId) &&
                isBeforeCursor(message, options?.before),
        )
        messages.sort(compareMessageDesc)
        return this.sortAscending(messages.slice(0, limit))
    }

    private async getMessagesBySearchTimes(roomId: number, times: number[]): Promise<Message[]> {
        if (!times.length) return []
        const key = this.roomMessageListKey(roomId)
        const pipeline = this.redis.pipeline()
        for (const time of times) pipeline.zrangebyscore(key, time, time)
        const replies = await pipeline.exec()
        const ids = Array.from(
            new Set((replies || []).flatMap((reply: any) => (Array.isArray(reply?.[1]) ? (reply[1] as string[]) : []))),
        )
        return this.getMessages(roomId, ids)
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
                    roomIds.map(async (rid) => {
                        const values = await this.getMessagesBySearchTimes(rid, times)
                        return values.map((message) => (roomId === 0 ? { ...message, roomId: rid } : message))
                    }),
                )
            ).flat()
            const filtered = messages.filter(
                (message) =>
                    (options?.endTime === undefined || Number(message.time || 0) <= options.endTime) &&
                    isBeforeCursor(message, options?.before) &&
                    messageMatchesKeyword(message, normalized),
            )
            filtered.sort(compareMessageDesc)
            result.push(...filtered.slice(0, limit - result.length))
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
        const normalizedKeyword = normalizeSearchText(keyword)
        if (normalizedKeyword) {
            const indexed = await this.searchMessagesFromSearchTimes(roomId, keyword, options, limit)
            if (indexed !== null) return indexed
        }
        const roomIds = roomId === 0 ? (await this.getAllRooms()).map((room) => Number(room.roomId)) : [roomId]
        const candidates = (
            await Promise.all(
                roomIds.map(async (rid) => {
                    const ids = await this.redis.zrevrangebyscore(this.roomMessageListKey(rid), '+inf', '-inf')
                    return (await this.getMessages(rid, ids)).map((message) =>
                        roomId === 0 ? { ...message, roomId: rid } : message,
                    )
                }),
            )
        ).flat()
        candidates.sort(compareMessageDesc)
        return candidates
            .filter(
                (message) =>
                    (options?.endTime === undefined || Number(message.time || 0) <= options.endTime) &&
                    isBeforeCursor(message, options?.before) &&
                    (!normalizedKeyword || messageMatchesKeyword(message, normalizedKeyword)),
            )
            .slice(0, limit)
    }

    /** 实现 {@link StorageProvider} 类的 `fetchImageMessages` 方法，
     * 是对 `msg${roomId}` 的"查多个"操作，只返回包含图片的消息。
     *
     * 在浏览聊天图片时，该方法被调用。
     * @param endTime 可选，只返回时间小于等于此值的消息（用于从指定月份开始加载）
     */
    async fetchImageMessages(roomId: number, options: MessagePageOptions, limit: number): Promise<Message[]> {
        const ids = await this.redis.zrevrange(this.roomMessageListKey(roomId), 0, -1)
        const imageMessages: Message[] = []
        for (const id of ids) {
            const message = (await this.getMessages(roomId, [id]))[0]
            if (!message) continue
            if (options?.endTime !== undefined && Number(message.time || 0) > options.endTime) continue
            if (!isBeforeCursor(message, options?.before)) continue
            if (!message.files?.some((file) => file.type?.startsWith('image/'))) continue
            imageMessages.push(message)
            if (imageMessages.length >= limit) break
        }
        return imageMessages
    }

    /** 实现 {@link StorageProvider} 类的 `getMessage` 方法，
     * 是对 `msg${roomId}` 的"查"操作。
     *
     * 在获取聊天历史消息时，该方法被调用。
     */
    async getMessage(roomId: number, messageId: string): Promise<Message> {
        const raw = await this.redis.hget(this.roomMessageKey(roomId), String(messageId))
        return raw ? JSON.parse(raw) : null
    }

    /** 实现 {@link StorageProvider} 类的 `fetchMessagesAround` 方法，
     * 获取指定消息前后的消息。
     *
     * 在定位到指定消息时，该方法被调用。
     */
    async fetchMessagesAround(roomId: number, messageId: string, before: number, after: number): Promise<Message[]> {
        const target = await this.getMessage(roomId, messageId)
        if (!target) return []
        const ids = await this.redis.zrangebyscore(this.roomMessageListKey(roomId), '-inf', '+inf')
        const targetIndex = ids.findIndex((id) => id === messageId)
        if (targetIndex < 0) return []
        const selected = ids.slice(Math.max(0, targetIndex - before), targetIndex + after + 1)
        return this.sortAscending(await this.getMessages(roomId, selected))
    }

    /** 实现 {@link StorageProvider} 类的 `addMessages` 方法，
     * 是对 `msg${roomId}` 的自定义增操作。用于向数据库内增加多条消息。
     *
     * 在获取聊天历史消息时，该方法被调用。
     */
    async addMessages(roomId: number, messages: Message[]): Promise<any> {
        for (const message of messages) await this.addMessage(roomId, message)
    }

    /** 实现 {@link StorageProvider} 类的 `getUnreadCount` 方法，
     * 是对 room 的自定义查询方法。查询有未读消息的大于指定通知优先级的房间数。
     *
     * 在登录成功与每次收到消息后调用。
     */
    async getUnreadCount(priority: number): Promise<number> {
        const ids = await this.redis.zrangebyscore(`${this.qid}:rooms:priority`, priority, priority)
        const values = await Promise.all(
            ids.map(async (id) => {
                const room = await this.getRoom(Number(id))
                return room?.unreadCount
            }),
        )
        return compact(values).length
    }

    /** 实现 {@link StorageProvider} 类的 `getFirstUnreadRoom` 方法，
     * 是对 room 的自定义查询方法。
     *
     * 调用情况未知。
     */
    async getFirstUnreadRoom(priority: number): Promise<Room> {
        const ids = await this.redis.zrangebyscore(`${this.qid}:rooms:priority`, priority, priority)
        return ids.length ? this.getRoom(Number(ids[0])) : undefined
    }
}
