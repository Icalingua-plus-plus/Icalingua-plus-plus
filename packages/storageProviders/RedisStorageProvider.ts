import Redis from 'ioredis'
import path from 'path'
import { compact } from 'lodash'
import IgnoreChatInfo from '@icalingua/types/IgnoreChatInfo'
import Message from '@icalingua/types/Message'
import Room from '@icalingua/types/Room'
import ChatGroup from '@icalingua/types/ChatGroup'
import DatabaseUpgradeProgress from '@icalingua/types/DatabaseUpgradeProgress'
import MessagePageOptions, { MessageCursor } from '@icalingua/types/MessagePage'
import StorageProvider from '@icalingua/types/StorageProvider'
import {
    legacyAtMetadataName,
    legacyAtMigrationVersion,
    runLegacyAtMigration,
    tryMigrateLegacyAtMessage,
} from './LegacyAtMigration'
import { messageMatchesKeyword, normalizeSearchText } from './MessageSearchIndex'
import { messageIdTime, messageIdsEquivalent } from './MessageId'
import SQLiteMessageSearchIndexWorker, { SQLiteSearchMessage } from './SQLiteMessageSearchIndexWorker'

const insertMessageScript = [
    "if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 then return 0 end",
    "redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])",
    "redis.call('ZADD', KEYS[2], ARGV[3], ARGV[1])",
    'return 1',
].join('\n')

const redisMessageReadBatchSize = 1000
const redisMigrationRoomConcurrency = 8

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

export default class RedisStorageProvider implements StorageProvider {
    qid: string
    connStr: string
    redis: Redis.Redis
    private searchIndex: SQLiteMessageSearchIndexWorker
    private legacyAtMigrationStarted = false
    private legacyAtMigrationPromise: Promise<void> | null = null
    private closed = false
    onUpgradeProgress?: (progress: DatabaseUpgradeProgress) => void

    /** `constructor` 方法。 */
    constructor(connStr: string, id: string, searchDataPath = path.join(process.cwd(), 'data')) {
        this.connStr = connStr
        this.qid = `eqq:${id}`
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
        this.searchIndex.onReady = () => this.scheduleLegacyAtMigration()
    }

    private reportUpgradeProgress(progress: DatabaseUpgradeProgress): void {
        try {
            this.onUpgradeProgress?.(progress)
        } catch (error) {
            console.error(error)
        }
    }

    /** `connect` 方法。在这里与数据库建立连接。 */
    async connect(): Promise<void> {
        this.closed = false
        this.redis = new Redis(this.connStr)
        await this.repairRoomAtMessageIds()
        await this.searchIndex.open()
    }

    private async repairRoomAtMessageIds(): Promise<void> {
        const rooms = await this.getAllRooms()
        for (const room of rooms) {
            if (!room.at || room.atMessageId) continue
            try {
                const atMessageId = await this.resolveRecentMessageId(room.roomId, room.unreadCount, true)
                await this.updateRoom(room.roomId, atMessageId ? { atMessageId } : { at: false, atMessageId: null })
            } catch (error) {
                console.error('Failed to repair room atMessageId', room.roomId, error)
            }
        }
    }

    async close(): Promise<void> {
        this.closed = true
        if (this.legacyAtMigrationPromise) await this.legacyAtMigrationPromise
        await this.searchIndex.close()
        if (this.redis) {
            await this.redis.quit()
        }
    }

    isMessageSearchIndexReady(): boolean {
        return this.searchIndex?.isReady === true
    }

    async validateMessageSearchIndex(): Promise<void> {
        await this.searchIndex?.validate()
    }

    private roomMessageKey(roomId: number): string {
        return `${this.qid}:msg${roomId}:messages`
    }

    private roomMessageListKey(roomId: number): string {
        return `${this.qid}:msg${roomId}:msgIdList`
    }

    private async getSearchRooms(): Promise<Room[]> {
        return (await this.getAllRooms()).slice().sort((left, right) => Number(left.roomId) - Number(right.roomId))
    }

    private async getMessages(roomId: number, ids: string[]): Promise<Message[]> {
        if (!ids.length) return []
        const messages: Message[] = []
        const key = this.roomMessageKey(roomId)
        for (let offset = 0; offset < ids.length; offset += redisMessageReadBatchSize) {
            const batchIds = ids.slice(offset, offset + redisMessageReadBatchSize)
            const rawMessages = await this.redis.hmget(key, ...batchIds.map((id) => String(id)))
            for (const raw of rawMessages) {
                if (!raw) continue
                messages.push(JSON.parse(raw) as Message)
            }
        }
        return messages
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

    private async loadSearchTimes(afterTime: number, limit: number): Promise<number[]> {
        const rooms = await this.getSearchRooms()
        const roomTimes = await Promise.all(
            rooms.map(async (room) => {
                const key = this.roomMessageListKey(Number(room.roomId))
                const times = new Set<number>()
                let lowerTime = Math.trunc(afterTime || 0)
                while (times.size < Math.max(1, Math.trunc(limit))) {
                    const minScore = lowerTime > 0 ? `(${lowerTime}` : '(0'
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
                    scores.forEach((time) => times.add(time))
                    const nextTime = Math.max(...scores)
                    if (nextTime <= lowerTime) break
                    lowerTime = nextTime
                }
                return times
            }),
        )
        const times = new Set<number>()
        for (const roomTimesForRoom of roomTimes) {
            for (const time of roomTimesForRoom) times.add(time)
        }
        return Array.from(times)
            .sort((left, right) => left - right)
            .slice(0, Math.max(1, Math.trunc(limit)))
    }

    private async loadSearchMessageGroupsByTimes(
        times: number[],
    ): Promise<Array<{ roomId: number; messages: Message[] }>> {
        if (!times.length) return []
        const rooms = await this.getSearchRooms()
        return mapWithConcurrencyAndYield(rooms, redisMigrationRoomConcurrency, async (room) => {
            const roomId = Number(room.roomId)
            return { roomId, messages: await this.getMessagesBySearchTimes(roomId, times) }
        })
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

    private async loadSearchTimeCounts(afterTime: number, limit: number) {
        const rooms = await this.getSearchRooms()
        const roomCounts = await Promise.all(
            rooms.map(async (room) => {
                const key = this.roomMessageListKey(Number(room.roomId))
                const counts = new Map<number, number>()
                let lowerTime = Math.trunc(afterTime || 0)
                while (counts.size < Math.max(1, Math.trunc(limit))) {
                    const minScore = lowerTime > 0 ? `(${lowerTime}` : '(0'
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
        const rooms = await this.getSearchRooms()
        const counts = await Promise.all(
            rooms.map((room) => this.redis.zcount(this.roomMessageListKey(Number(room.roomId)), '(0', '+inf')),
        )
        return counts.reduce((total, count) => total + Number(count || 0), 0)
    }

    private async syncSearchIndex(messages: Message[]): Promise<void> {
        await this.searchIndex.syncMessages(messages)
    }

    private async migrateLegacyAtBatch(times: number[]): Promise<boolean> {
        const syncGeneration = await this.searchIndex.getSyncGeneration()
        const roomMessages = await this.loadSearchMessageGroupsByTimes(times)
        const pipeline = this.redis.pipeline()
        let operationCount = 0
        for (const { roomId, messages } of roomMessages) {
            for (const message of messages) {
                const migrated = tryMigrateLegacyAtMessage(message)
                if (!migrated || migrated.content === String(message.content ?? '')) continue
                const migratedMessage = { ...message, content: migrated.content } as any
                const mutableMessage = message as any
                if (migrated.mediaChanged) {
                    if (Object.prototype.hasOwnProperty.call(message, 'file')) migratedMessage.file = migrated.file
                    if (Object.prototype.hasOwnProperty.call(message, 'files')) migratedMessage.files = migrated.files
                }
                pipeline.hset(this.roomMessageKey(roomId), String(message._id), JSON.stringify(migratedMessage))
                message.content = migrated.content
                if (migrated.mediaChanged) {
                    if (Object.prototype.hasOwnProperty.call(message, 'file')) mutableMessage.file = migrated.file
                    if (Object.prototype.hasOwnProperty.call(message, 'files')) mutableMessage.files = migrated.files
                }
                operationCount++
            }
        }
        if (operationCount) {
            const results = await pipeline.exec()
            const failed = results?.find(([error]) => Boolean(error))
            if (failed?.[0]) throw failed[0]
        }
        if (syncGeneration !== null) {
            const completeTimeGroups = roomMessages.flatMap(({ roomId, messages }) =>
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

    private metadataKey(): string {
        return `${this.qid}:metadata`
    }

    private scheduleLegacyAtMigration(): void {
        if (!this.redis || this.closed || this.legacyAtMigrationStarted) return
        this.legacyAtMigrationStarted = true
        this.legacyAtMigrationPromise = new Promise<void>((resolve) => setImmediate(resolve))
            .then(() => this.migrateLegacyAtMessages())
            .catch((error) => {
                if (this.closed) return
                console.error('Failed to migrate legacy At messages in Redis', error)
                this.reportUpgradeProgress({ active: false, step: 0, total: 0, message: '' })
            })
    }

    private async migrateLegacyAtMessages(): Promise<void> {
        if (this.closed || !this.redis) return
        await runLegacyAtMigration({
            searchIndex: this.searchIndex,
            isClosed: () => this.closed,
            hasCompleted: async () =>
                (await this.redis.hget(this.metadataKey(), legacyAtMetadataName)) === legacyAtMigrationVersion,
            migrateBatch: (times) => this.migrateLegacyAtBatch(times),
            markCompleted: async () => {
                await this.redis.hset(this.metadataKey(), legacyAtMetadataName, legacyAtMigrationVersion)
            },
            reportProgress: (progress) => this.reportUpgradeProgress(progress),
        })
    }

    private async insertMessages(roomId: number, messages: Message[]): Promise<Message[]> {
        if (!messages.length) return []
        const pipeline = this.redis.pipeline()
        for (const message of messages) {
            pipeline.eval(
                insertMessageScript,
                2,
                this.roomMessageKey(roomId),
                this.roomMessageListKey(roomId),
                String(message._id),
                JSON.stringify(message),
                String(Number(message.time || 0)),
            )
        }
        const results = await pipeline.exec()
        if (!results) throw new Error('Redis message insert pipeline did not return a result')
        const insertedMessages = messages.filter(
            (_message, index) => !results[index]?.[0] && Number(results[index]?.[1]) === 1,
        )
        await this.syncSearchIndex(insertedMessages)
        const failed = results.find(([error]) => Boolean(error))
        if (failed?.[0]) throw failed[0]
        return insertedMessages
    }

    /** 实现 {@link StorageProvider} 类的 `getIgnoredChats` 方法，
     * 是对 `ignoredChats` 的“查所有”操作。
     *
     * 在用户查询忽略聊天列表时被调用。
     */
    async getIgnoredChats(): Promise<IgnoreChatInfo[]> {
        const infoStrings = await this.redis.hvals(`${this.qid}:rooms:ignored`)
        return infoStrings.map((infoString) => JSON.parse(infoString))
    }

    /** 实现 {@link StorageProvider} 类的 `isChatIgnored` 方法，
     * 是对 `ignoredChats` 的自定义查询操作。返回一个**布尔**值。
     *
     * 在收到消息时被调用。
     */
    async isChatIgnored(id: number): Promise<boolean> {
        const existance = await this.redis.hexists(`${this.qid}:rooms:ignored`, `${id}`)
        return existance === 1
    }

    /** 实现 {@link StorageProvider} 类的 `addIgnoredChat` 方法，
     * 是对 `ignoredChats` 的“增”操作。
     *
     * 在忽略聊天时被调用。
     */
    async addIgnoredChat(info: IgnoreChatInfo): Promise<any> {
        await this.redis.hset(`${this.qid}:rooms:ignored`, `${info.id}`, JSON.stringify(info))
    }

    /** 实现 {@link StorageProvider} 类的 `removeIgnoredChat` 方法，
     * 是对 `ignoredChats` 的“删”操作。
     *
     * 在取消忽略聊天时被调用。
     */
    async removeIgnoredChat(roomId: number): Promise<any> {
        await this.redis.hdel(`${this.qid}:rooms:ignored`, `${roomId}`)
    }

    /** 实现 {@link StorageProvider} 类的 `getRoom` 方法，
     * 对应 room 的“查单个”操作。
     *
     * 在进入房间后被调用。
     */
    async getRoom(roomId: number): Promise<Room> {
        const room = await this.redis.hget(`${this.qid}:rooms:rooms`, `${roomId}`)
        const pRoom = JSON.parse(room) as Room
        if (!pRoom) {
            return null
        }
        return { ...pRoom, roomId: Number(pRoom.roomId) }
    }

    /** 实现 {@link StorageProvider} 类的 `updateRoom` 方法，
     * 对应 room 的“改”操作。
     *
     * 在“收到新消息”等引起房间信息变化的事件时调用。
     */
    async updateRoom(roomId: number, room: Partial<Room>): Promise<void> {
        const roomInDB = JSON.parse(await this.redis.hget(`${this.qid}:rooms:rooms`, `${roomId}`))
        const roomToUpdate = { ...roomInDB, ...room }
        await this.redis.hset(`${this.qid}:rooms:rooms`, `${roomId}`, JSON.stringify(roomToUpdate))
        await this.redis.zadd(`${this.qid}:rooms:keyList`, roomToUpdate.utime, `${roomId}`)
        await this.redis.zadd(`${this.qid}:rooms:priority`, roomToUpdate.priority, `${roomId}`)
    }

    /** 实现 {@link StorageProvider} 类的 `addRoom` 方法，
     * 对应 room 的“增”操作。
     *
     * 在“新房间收到新消息”等需要新增房间的事件时被调用。
     */
    async addRoom(room: Room): Promise<void> {
        await this.redis.hset(`${this.qid}:rooms:rooms`, `${room.roomId}`, JSON.stringify(room))
        if (room.utime) await this.redis.zadd(`${this.qid}:rooms:keyList`, room.utime, `${room.roomId}`)
        if (room.priority) {
            await this.redis.zadd(`${this.qid}:rooms:priority`, room.priority, `${room.roomId}`)
        }
    }

    /** 实现 {@link StorageProvider} 类的 `removeRoom` 方法，
     * 对应 room 的“删”操作。
     *
     * 在删除聊天时调用。
     */
    async removeRoom(roomId: number): Promise<void> {
        await this.redis.hdel(`${this.qid}:rooms:rooms`, `${roomId}`)
        await this.redis.zrem(`${this.qid}:rooms:keyList`, `${roomId}`)
        await this.redis.zrem(`${this.qid}:rooms:priority`, `${roomId}`)
    }

    /** 实现 {@link StorageProvider} 类的 `getAllRooms` 方法，
     * 对应 room 的“查所有”操作。
     *
     * 在登录成功后调用。
     */
    async getAllRooms(): Promise<Room[]> {
        const roomKeys = await this.redis.zrevrange(`${this.qid}:rooms:keyList`, 0, -1)
        const roomsPAry = roomKeys.map(async (key) => {
            const room = await this.redis.hget(`${this.qid}:rooms:rooms`, key)
            const pRoom = JSON.parse(room) as Room
            return { ...pRoom, roomId: Number(pRoom.roomId) }
        })
        const rooms = (await Promise.all(roomsPAry)) as Room[]
        return rooms
    }

    /** 实现 {@link StorageProvider} 类的 `updateChatGroup` 方法，
     * 对应 chatGroup 的“改”操作。
     *
     * 在“编辑分组”等改变聊天分组时调用。
     */
    async updateChatGroup(name: string, chatGroup: Partial<ChatGroup>): Promise<void> {
        const raw = await this.redis.hget(`${this.qid}:chatGroups:rooms`, `${name}`)
        const chatGroupInDB = raw ? (JSON.parse(raw) as ChatGroup) : {}
        const chatGroupToUpdate = { ...chatGroupInDB, ...chatGroup }
        await this.redis.hset(`${this.qid}:chatGroups:rooms`, `${name}`, JSON.stringify(chatGroupToUpdate))
        await this.redis.zadd(`${this.qid}:rooms:keyList`, Number(chatGroupToUpdate.index || 0), `${name}`)
    }

    /** 实现 {@link StorageProvider} 类的 `addChatGroup` 方法，
     * 对应 chatGroup 的“增”操作。
     *
     * 在“编辑分组”等需要新增聊天分组时被调用。
     */
    async addChatGroup(chatGroup: ChatGroup): Promise<void> {
        await this.redis.hset(`${this.qid}:chatGroups:rooms`, `${chatGroup.name}`, JSON.stringify(chatGroup))
        if (chatGroup.index)
            await this.redis.zadd(`${this.qid}:chatGroups:keyList`, chatGroup.index, `${chatGroup.name}`)
    }

    /** 实现 {@link StorageProvider} 类的 `removeChatGroup` 方法，
     * 对应 chatGroup 的“删”操作。
     *
     * 在删除聊天分组时调用。
     */
    async removeChatGroup(name: string): Promise<void> {
        await this.redis.hdel(`${this.qid}:chatGroups:rooms`, `${name}`)
        await this.redis.zrem(`${this.qid}:chatGroups:keyList`, `${name}`)
    }

    /** 实现 {@link StorageProvider} 类的 `getAllChatGroups` 方法，
     * 对应 chatGroup 的“查所有”操作。
     *
     * 在登录成功后调用。
     */
    async getAllChatGroups(): Promise<ChatGroup[]> {
        const chatGroupsKeys = await this.redis.zrevrange(`${this.qid}:chatGroups:keyList`, 0, -1)
        const chatGroupsPAry = chatGroupsKeys.map(async (key) => {
            const chatGroup = await this.redis.hget(`${this.qid}:chatGroups:rooms`, key)
            const pChatGroup = JSON.parse(chatGroup) as ChatGroup
            return pChatGroup
        })
        const chatGroups = (await Promise.all(chatGroupsPAry)) as ChatGroup[]
        return chatGroups
    }

    /** 实现 {@link StorageProvider} 类的 `addMessage` 方法，
     * 是对 `msg${roomId}` 的“增”操作。
     *
     * 在收到消息时被调用。
     */
    async addMessage(roomId: number, message: Message): Promise<void> {
        await this.insertMessages(roomId, [message])
    }

    /** 实现 {@link StorageProvider} 类的 `updateMessage` 方法，
     * 是对 `msg${roomId}` 的“改”操作。
     *
     * 在“用户撤回消息”等需要改动消息内容的事件中被调用。
     */
    async updateMessage(roomId: number, messageId: string | number, message: Partial<Message>): Promise<any> {
        const raw = await this.redis.hget(`${this.qid}:msg${roomId}:messages`, `${messageId}`)
        if (!raw) return
        const msgInDB = JSON.parse(raw) as Message
        const msgToUpdate = { ...msgInDB, ...message } as Message
        const searchContentChanged =
            String(msgInDB.content || '') !== String(msgToUpdate.content || '') ||
            Number(msgInDB.time || 0) !== Number(msgToUpdate.time || 0)
        const result = await this.redis.hset(
            `${this.qid}:msg${roomId}:messages`,
            `${messageId}`,
            JSON.stringify(msgToUpdate),
        )
        if (searchContentChanged) {
            await this.redis.zadd(`${this.qid}:msg${roomId}:msgIdList`, Number(msgToUpdate.time || 0), messageId)
            await this.searchIndex.requestRebuild([Number(msgInDB.time || 0), Number(msgToUpdate.time || 0)])
        } else {
            await this.syncSearchIndex([msgToUpdate])
        }
        return result
    }

    /** 实现 {@link StorageProvider} 类的 `replaceMessage` 方法，
     * 是对 `msg${roomId}` 的“改”操作。
     *
     * 在“重新获取消息内容”等需要改动消息内容的事件中被调用。
     */
    async replaceMessage(roomId: number, messageId: string | number, message: Message): Promise<any> {
        return await this.updateMessage(roomId, messageId, message)
    }

    /** 实现 {@link StorageProvider} 类的 `fetchMessage` 方法，
     * 是对 `msg${roomId}` 的"查多个"操作。
     *
     * 在进入房间时，该方法被调用。
     */
    private async getRoomPageIds(roomId: number, options: MessagePageOptions, limit: number): Promise<string[]> {
        if (options?.before && options?.after) throw new Error('Message page cannot use before and after together')
        const key = `${this.qid}:msg${roomId}:msgIdList`
        const cursor = options?.before || options?.after
        if (!cursor) return this.redis.zrevrangebyscore(key, '+inf', '-inf', 'LIMIT', 0, limit)

        const cursorId = String(cursor.id)
        if (options.after) {
            const sameTime = (await this.redis.zrangebyscore(key, cursor.time, cursor.time)).filter(
                (id) => String(id) > cursorId,
            )
            if (sameTime.length >= limit) return sameTime.slice(0, limit)
            const newer = await this.redis.zrangebyscore(
                key,
                `(${cursor.time}`,
                '+inf',
                'LIMIT',
                0,
                limit - sameTime.length,
            )
            return [...sameTime, ...newer]
        }

        const sameTime = (await this.redis.zrevrangebyscore(key, cursor.time, cursor.time)).filter(
            (id) => String(id) < cursorId,
        )
        if (sameTime.length >= limit) return sameTime.slice(0, limit)
        const older = await this.redis.zrevrangebyscore(
            key,
            `(${cursor.time}`,
            '-inf',
            'LIMIT',
            0,
            limit - sameTime.length,
        )
        return [...sameTime, ...older]
    }

    private sortMessagesAscending(messages: Message[]): Message[] {
        return messages.sort((left, right) => {
            const timeDifference = Number(left.time || 0) - Number(right.time || 0)
            if (timeDifference) return timeDifference
            const leftId = String(left._id)
            const rightId = String(right._id)
            return leftId < rightId ? -1 : leftId > rightId ? 1 : 0
        })
    }

    async fetchMessages(roomId: number, options: MessagePageOptions, limit: number): Promise<Message[]> {
        const msgKeys = await this.getRoomPageIds(roomId, options, limit)
        return this.sortMessagesAscending(await this.getMessages(roomId, msgKeys))
    }

    private async resolveRecentMessageId(roomId: number, unreadCount: number, atOnly: boolean): Promise<string | null> {
        let remaining = Math.max(0, Math.trunc(Number(unreadCount) || 0))
        if (!remaining) return null

        const listKey = this.roomMessageListKey(roomId)
        const messageKey = this.roomMessageKey(roomId)
        let offset = 0
        while (remaining > 0) {
            const batchSize = atOnly ? 100 : Math.min(redisMessageReadBatchSize, Math.max(100, remaining))
            const ids = await this.redis.zrevrange(listKey, offset, offset + batchSize - 1)
            if (!ids.length) return null
            const rawMessages = await this.redis.hmget(messageKey, ...ids)

            for (let index = 0; index < ids.length; index++) {
                const rawMessage = rawMessages[index]
                if (!rawMessage) continue
                const message = JSON.parse(rawMessage) as Message
                if (message.system) continue
                remaining--
                if ((!atOnly && remaining === 0) || (atOnly && message.at)) return String(ids[index])
                if (remaining === 0) return null
            }

            if (ids.length < batchSize) return null
            offset += ids.length
        }
        return null
    }

    async countUnreadMessagesFrom(roomId: number, messageId: string | number): Promise<number> {
        const target = await this.getMessage(roomId, String(messageId))
        if (!target) return 0

        const targetTime = Number(target.time || 0)
        const targetId = String(target._id)
        const listKey = this.roomMessageListKey(roomId)
        const [sameTimeIds, newerIds] = await Promise.all([
            this.redis.zrangebyscore(listKey, targetTime, targetTime),
            this.redis.zrangebyscore(listKey, `(${targetTime}`, '+inf'),
        ])
        const ids = [...sameTimeIds.filter((id) => String(id) >= targetId), ...newerIds]
        const messages = await this.getMessages(roomId, ids)
        return messages.filter((message) => !message.system).length
    }

    async resolveUnreadTargetMessageId(roomId: number, unreadCount: number): Promise<string | null> {
        return this.resolveRecentMessageId(roomId, unreadCount, false)
    }

    /** 按发送者查询消息记录。
     * @param roomId 房间 ID，为 0 时查询所有群（roomId < 0）
     * @param senderId 发送者 ID（字符串）
     */
    async fetchMessagesBySender(roomId: number, senderId: string, skip: number, limit: number): Promise<Message[]> {
        const senderIdNum = Number(senderId)
        const scanRoom = async (rid: number): Promise<Message[]> => {
            const allMsgKeys = await this.redis.zrevrange(`${this.qid}:msg${rid}:msgIdList`, 0, -1)
            const matched: Message[] = []
            for (const key of allMsgKeys) {
                const msg = await this.redis.hget(`${this.qid}:msg${rid}:messages`, key)
                if (!msg) continue
                const message = JSON.parse(msg) as Message
                if (message.senderId === senderIdNum) {
                    if (roomId === 0) (message as any).roomId = rid
                    matched.push(message)
                }
            }
            return matched
        }

        if (roomId === 0) {
            // 所有群模式
            const rooms = await this.getAllRooms()
            const groupRooms = rooms.filter((r) => r.roomId < 0)
            const allMessages: Message[] = []
            await Promise.all(
                groupRooms.map(async (room) => {
                    const msgs = await scanRoom(room.roomId)
                    allMessages.push(...msgs)
                }),
            )
            allMessages.sort((a, b) => b.time - a.time)
            return allMessages.slice(skip, skip + limit).reverse()
        } else {
            const allMatched = await scanRoom(roomId)
            allMatched.sort((a, b) => b.time - a.time)
            return allMatched.slice(skip, skip + limit).reverse()
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
                    await Promise.all(
                        roomIds.map(async (rid) => {
                            const values = await this.getMessagesBySearchTimes(rid, times)
                            return values.map((message) => (roomId === 0 ? { ...message, roomId: rid } : message))
                        }),
                    )
                )
                    .flat()
                    .filter(
                        (message) =>
                            messageMatchesKeyword(message, normalized) &&
                            (senderId === undefined || message.senderId === Number(senderId)) &&
                            (startTime === undefined || Number(message.time || 0) >= startTime) &&
                            (endTime === undefined || Number(message.time || 0) <= endTime),
                    )
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
        const lowerKeyword = normalizeSearchText(keyword)
        if (lowerKeyword) {
            const indexed = await this.searchMessagesFromSearchIndex(
                roomId,
                lowerKeyword,
                skip,
                limit,
                senderId,
                startTime,
                endTime,
            )
            if (indexed !== null) return indexed
        }

        const scanRoom = async (targetRoomId: number, includeRoomId: boolean): Promise<Message[]> => {
            const allMsgKeys = await this.redis.zrevrange(`${this.qid}:msg${targetRoomId}:msgIdList`, 0, -1)
            const messages = await this.getMessages(targetRoomId, allMsgKeys)
            return messages.filter((message) => {
                if (!messageMatchesKeyword(message, lowerKeyword)) return false
                if (senderId !== undefined && message.senderId !== Number(senderId)) return false
                if (startTime !== undefined && Number(message.time || 0) < startTime) return false
                if (endTime !== undefined && Number(message.time || 0) > endTime) return false
                if (includeRoomId) message.roomId = targetRoomId
                return true
            })
        }

        const matched =
            roomId === 0
                ? (await Promise.all((await this.getAllRooms()).map((room) => scanRoom(room.roomId, true)))).flat()
                : await scanRoom(roomId, false)
        matched.sort((a, b) => b.time - a.time)
        return matched.slice(skip, skip + limit)
    }

    /** 实现 {@link StorageProvider} 类的 `fetchImageMessages` 方法，
     * 是对 `msg${roomId}` 的"查多个"操作，只返回包含图片的消息。
     *
     * 在浏览聊天图片时，该方法被调用。
     * @param endTime 可选，只返回时间小于等于此值的消息（用于从指定月份开始加载）
     */
    async fetchImageMessages(roomId: number, skip: number, limit: number, endTime?: number): Promise<Message[]> {
        const allMsgKeys = await this.redis.zrevrange(`${this.qid}:msg${roomId}:msgIdList`, 0, -1)
        const imageMessages: Message[] = []
        let skipped = 0

        for (const key of allMsgKeys) {
            if (imageMessages.length >= limit) break
            const msg = await this.redis.hget(`${this.qid}:msg${roomId}:messages`, key)
            const message = JSON.parse(msg) as Message
            // 如果指定了 endTime，跳过时间大于 endTime 的消息
            if (endTime && message.time > endTime) continue
            // 检查 files 数组中是否有图片类型
            const hasImage = message.files?.some((file) => file.type?.startsWith('image/'))
            if (hasImage) {
                if (skipped < skip) {
                    skipped++
                } else {
                    imageMessages.push(message)
                }
            }
        }

        return imageMessages
    }

    /** 实现 {@link StorageProvider} 类的 `getMessage` 方法，
     * 是对 `msg${roomId}` 的"查"操作。
     *
     * 在获取聊天历史消息时，该方法被调用。
     */
    async getMessage(roomId: number, messageId: string): Promise<Message> {
        return this.findMessageRecord(roomId, messageId)
    }

    private async findMessageRecord(roomId: number, messageId: string): Promise<Message | null> {
        const key = this.roomMessageKey(roomId)
        const exactMessage = await this.redis.hget(key, `${messageId}`)
        if (exactMessage) return JSON.parse(exactMessage) as Message

        const time = messageIdTime(messageId)
        if (time === null) return null
        const targetTime = time * 1000
        const ids = await this.redis.zrangebyscore(
            this.roomMessageListKey(roomId),
            targetTime - 2000,
            targetTime + 2000,
        )
        const candidates = await this.getMessages(roomId, ids)
        return candidates.find((candidate) => messageIdsEquivalent(candidate._id, messageId)) || null
    }

    /** 实现 {@link StorageProvider} 类的 `fetchMessagesAround` 方法，
     * 获取指定消息前后的消息。
     *
     * 在定位到指定消息时，该方法被调用。
     */
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

    /** 实现 {@link StorageProvider} 类的 `addMessages` 方法，
     * 是对 `msg${roomId}` 的自定义增操作。用于向数据库内增加多条消息。
     *
     * 在获取聊天历史消息时，该方法被调用。
     */
    async addMessages(roomId: number, messages: Message[]): Promise<any> {
        await this.insertMessages(roomId, messages)
    }

    /** 实现 {@link StorageProvider} 类的 `getUnreadCount` 方法，
     * 是对 room 的自定义查询方法。查询有未读消息的大于指定通知优先级的房间数。
     *
     * 在登录成功与每次收到消息后调用。
     */
    async getUnreadCount(priority: number): Promise<number> {
        const keyAry = await this.redis.zrangebyscore(`${this.qid}:rooms:priority`, priority, priority)
        const roomsUnreadAry = await Promise.all(
            keyAry.map(async (key) => {
                const room = await this.redis.hget(`${this.qid}:rooms:rooms`, key)
                const pRoom = JSON.parse(room) as Room
                return pRoom.unreadCount
            }),
        )
        return compact(roomsUnreadAry).length
    }

    /** 实现 {@link StorageProvider} 类的 `getFirstUnreadRoom` 方法，
     * 是对 room 的自定义查询方法。
     *
     * 调用情况未知。
     */
    async getFirstUnreadRoom(priority: number): Promise<Room> {
        const keyAry = await this.redis.zrangebyscore(`${this.qid}:rooms:priority`, priority, priority)
        if (keyAry.length === 0) {
            return undefined
        }
        const room = await this.redis.hget(`${this.qid}:rooms:rooms`, keyAry[0])
        const pRoom = JSON.parse(room) as Room
        return pRoom
    }
}
