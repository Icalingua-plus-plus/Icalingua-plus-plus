import fs from 'fs'
import knex, { Knex } from 'knex'
import lodash from 'lodash'
import path from 'path'
import IgnoreChatInfo from '@icalingua/types/IgnoreChatInfo'
import Message from '@icalingua/types/Message'
import Room from '@icalingua/types/Room'
import ChatGroup from '@icalingua/types/ChatGroup'
import { DBVersion, MessageInSQLDB } from '@icalingua/types/SQLTableTypes'
import DatabaseUpgradeProgress from '@icalingua/types/DatabaseUpgradeProgress'
import MessagePageOptions, { MessageCursor } from '@icalingua/types/MessagePage'
import StorageProvider from '@icalingua/types/StorageProvider'
import { escapeSearchLikePattern, normalizeSearchText } from './MessageSearchIndex'
import { messageIdTime, messageIdsEquivalent } from './MessageId'
import SQLiteMessageSearchIndexWorker from './SQLiteMessageSearchIndexWorker'
import SQLStorageProviderWorker from './SQLStorageProviderWorker'
import {
    createSQLiteMessageSearchSourceCallbacks,
    type SQLiteMessageSearchSourceRequest,
    type SQLiteMessageSearchSourceResult,
} from './SQLiteMessageSearchSource'
import type {
    SQLiteMessageSearchIndexCallbacks,
    SQLiteMessageSearchTimesOptions,
    SQLiteSearchMessage,
    SQLiteSearchTimeCount,
} from './SQLiteMessageSearchIndex'
import upg0to1 from './SQLUpgradeScript/0to1'
import upg1to2 from './SQLUpgradeScript/1to2'
import upg2to3 from './SQLUpgradeScript/2to3'
import upg3to4 from './SQLUpgradeScript/3to4'
import upg4to5 from './SQLUpgradeScript/4to5'
import upg5to6 from './SQLUpgradeScript/5to6'
import upg6to7 from './SQLUpgradeScript/6to7'
import upg7to8 from './SQLUpgradeScript/7to8'
import upg8to9 from './SQLUpgradeScript/8to9'
import upg9to10 from './SQLUpgradeScript/9to10'
import upg10to11 from './SQLUpgradeScript/10to11'
import upg11to12 from './SQLUpgradeScript/11to12'
import upg12to13 from './SQLUpgradeScript/12to13'
import upg13to14 from './SQLUpgradeScript/13to14'
import upg14to15 from './SQLUpgradeScript/14to15'
import upg15to16 from './SQLUpgradeScript/15to16'
import upg16to17 from './SQLUpgradeScript/16to17'
import upg17to18 from './SQLUpgradeScript/17to18'
import upg18to19 from './SQLUpgradeScript/18to19'
import upg19to20 from './SQLUpgradeScript/19to20'
import upg20to21 from './SQLUpgradeScript/20to21'
import upg21to22 from './SQLUpgradeScript/21to22'
import upg22to23 from './SQLUpgradeScript/22to23'
import upg23to24 from './SQLUpgradeScript/23to24'
import upg24to25 from './SQLUpgradeScript/24to25'

const dbVersionLatest = 25

const normalizeRoomId = (roomId: unknown): string => {
    const value = String(roomId || 0) || '0'
    return /^-?\d+\.0$/.test(value) ? value.slice(0, -2) : value
}

/** PostgreSQL 和 MySQL/MariaDB 连接需要的信息的类型定义 */
interface PgMyOpt {
    host: string
    user: string
    password: string
    database: string
    dataPath?: never
    searchDataPath?: string
}

/** SQLite 存放 DB 文件需要的信息的类型定义 */
interface SQLiteOpt {
    dataPath: string
    searchDataPath?: string
    host?: never
    user?: never
    password?: never
    database?: never
}

interface MessageSearchIndex {
    readonly isReady: boolean
    open(): Promise<void>
    close(): Promise<void>
    validate(): Promise<void>
    syncMessages(messages: SQLiteSearchMessage[]): Promise<void>
    requestRebuild(times?: number | number[]): Promise<void>
    searchTimes(keyword: string, options: SQLiteMessageSearchTimesOptions): Promise<number[] | null>
}

export type MessageSearchIndexFactory = (
    filePath: string,
    callbacks: SQLiteMessageSearchIndexCallbacks,
    errorHandle: (error: unknown) => void,
) => MessageSearchIndex

const createMessageSearchIndexWorker: MessageSearchIndexFactory = (filePath, callbacks, errorHandle) =>
    new SQLiteMessageSearchIndexWorker(filePath, callbacks, errorHandle)

// Move larger pages across the Worker boundary, then split the source lookup
// below the conservative 900-parameter budget used by WHERE IN. FTS writes are
// still independently chunked by SQLiteMessageSearchIndex.
const sqlSearchReadBatchSize = 800
const sqlSearchBuildBatchSize = 4000
const sqlSearchValidationBatchSize = 4000

export default class SQLStorageProvider implements StorageProvider {
    id: string
    type: 'pg' | 'mysql' | 'sqlite3'
    db: Knex
    errorHandle: Function
    /** 数据库升级进度回调，参数：(当前步骤, 总步骤, 描述) */
    onUpgradeProgress?: (progress: DatabaseUpgradeProgress) => void
    private qid: string
    private searchIndex: MessageSearchIndex

    /** `constructor` 方法。这里会判断数据库类型并建立连接。 */
    constructor(
        id: string,
        type: 'pg' | 'mysql' | 'sqlite3',
        connectOpt: PgMyOpt | SQLiteOpt,
        errorHandle: Function = console.error,
        searchIndexFactory?: MessageSearchIndexFactory,
        sqliteReadOnly = false,
    ) {
        if (type === 'sqlite3' && !searchIndexFactory) {
            return new SQLStorageProviderWorker(
                id,
                type,
                connectOpt as SQLiteOpt,
                errorHandle,
            ) as unknown as SQLStorageProvider
        }
        this.id = id
        this.qid = `eqq${id}`
        this.type = type
        this.errorHandle = errorHandle
        let connectOption = { ...connectOpt }
        if (connectOption.host && connectOption.host.includes(':')) {
            const [host, port] = connectOption.host.split(':')
            connectOption.host = host
            connectOption['port'] = Number(port)
        }
        switch (type) {
            case 'sqlite3':
                const dbPath = path.join(connectOpt.dataPath, 'databases')
                if (!fs.existsSync(dbPath)) {
                    fs.mkdirSync(dbPath, {
                        recursive: true,
                    })
                }
                this.db = knex({
                    client: 'better-sqlite3',
                    connection: {
                        filename: `${path.join(dbPath, this.qid)}.db`,
                        charset: 'utf8mb4',
                    },
                    useNullAsDefault: true,
                    pool: {
                        min: 1,
                        max: 1,
                        afterCreate: (conn: any, done: any) => {
                            try {
                                const pragmas = [
                                    ...(sqliteReadOnly ? [] : ['PRAGMA journal_mode = WAL']), // 读写并发，不阻塞
                                    'PRAGMA busy_timeout = 5000', // 写入遇锁等待 5 秒
                                    'PRAGMA synchronous = NORMAL', // WAL 下 NORMAL 就够安全，比 FULL 快一倍写入
                                    'PRAGMA cache_size = -16384', // 16MB 页缓存，加速大量消息的查询
                                    'PRAGMA mmap_size = 67108864', // 64MB 内存映射，减少磁盘 I/O
                                    ...(sqliteReadOnly ? ['PRAGMA query_only = ON'] : []),
                                ]
                                conn.exec(pragmas.join('; '))
                                done(null, conn)
                            } catch (error) {
                                done(error, conn)
                            }
                        },
                    },
                })
                break
            case 'mysql':
                this.db = knex({
                    client: 'mysql',
                    connection: { ...connectOption, charset: 'utf8mb4' },
                    useNullAsDefault: true,
                    pool: { min: 2, max: 2 },
                })
                break
            case 'pg':
                this.db = knex({
                    client: 'pg',
                    connection: { ...connectOption, charset: 'utf8mb4' },
                    useNullAsDefault: true,
                    searchPath: [this.qid, 'public'],
                    pool: { min: 2, max: 2 },
                })
                break
            default:
                break
        }
        const searchDataPath =
            (connectOpt as any).searchDataPath || (connectOpt as any).dataPath || path.join(process.cwd(), 'data')
        const searchDbPath = path.join(searchDataPath, 'databases', `${this.qid}_search.db`)
        this.searchIndex = (searchIndexFactory || createMessageSearchIndexWorker)(
            searchDbPath,
            {
                ...createSQLiteMessageSearchSourceCallbacks((request) => this.readMessageSearchSource(request)),
                reportProgress: (progress) => this.reportUpgradeProgress(progress),
                buildBatchSize: sqlSearchBuildBatchSize,
                validationBatchSize: sqlSearchValidationBatchSize,
            },
            this.errorHandle as (error: unknown) => void,
        )
    }

    /** 私有方法，将 icalingua 的 room 转换成适合放在数据库里的格式 */
    private roomConToDB(room: Partial<Room>): Record<string, any> {
        try {
            if (room) {
                const converted: Record<string, any> = {
                    ...room,
                    users: JSON.stringify(room.users),
                    lastMessage: JSON.stringify(room.lastMessage),
                    at: JSON.stringify(room.at),
                }
                if (room.roomId !== undefined && room.roomId !== null) {
                    const roomId = normalizeRoomId(room.roomId)
                    if (roomId === '0') return null
                    converted.roomId = roomId
                }
                return converted
            }
            return null
        } catch (e) {
            this.errorHandle(e)
        }
    }

    /** 私有方法，将 room 从数据库内格式转换成 icalingua 使用的格式 */
    private roomConFromDB(room: Record<string, any>): Room {
        try {
            if (room)
                return {
                    ...room,
                    roomId: Number(room.roomId),
                    utime: Number(room.utime),
                    users: JSON.parse(room.users),
                    lastMessage: JSON.parse(room.lastMessage),
                    downloadPath: room.downloadPath ? room.downloadPath : '',
                    at: JSON.parse(room.at),
                } as Room
            return null
        } catch (e) {
            this.errorHandle(e)
        }
    }

    /** 私有方法，将 icalingua 的 message 转换成适合放在数据库里的格式 */
    private msgConToDB(message: Partial<Message>, roomId?: number): Record<string, any> {
        try {
            if (message) {
                const converted: Record<string, any> = { ...message }
                if (message.senderId !== undefined && message.senderId !== null) {
                    converted.senderId = `${message.senderId}`
                }
                if (message._id !== undefined && message._id !== null) converted._id = `${message._id}`
                for (const field of ['file', 'files', 'replyMessage', 'at', 'mirai', 'button_rows'] as const) {
                    if (!Object.prototype.hasOwnProperty.call(message, field)) continue
                    if (message[field] === undefined) delete converted[field]
                    else converted[field] = JSON.stringify(message[field])
                }
                if (roomId !== undefined) converted.roomId = roomId
                return converted
            }
            return null
        } catch (e) {
            this.errorHandle(e)
        }
    }

    private async filterNewMessages(
        messages: Message[],
        database: Knex | Knex.Transaction = this.db,
    ): Promise<Message[]> {
        const uniqueMessages = new Map<string, Message>()
        for (const message of messages) {
            const id = String(message?._id)
            if (!uniqueMessages.has(id)) uniqueMessages.set(id, message)
        }
        const existingIds = new Set<string>()
        for (const ids of lodash.chunk(Array.from(uniqueMessages.keys()), 200)) {
            if (!ids.length) continue
            const rows = await database<MessageInSQLDB>('messages').whereIn('_id', ids).select('_id')
            for (const row of rows) existingIds.add(String(row._id))
        }
        return Array.from(uniqueMessages, ([id, message]) => ({ id, message }))
            .filter(({ id }) => !existingIds.has(id))
            .map(({ message }) => message)
    }

    /** 私有方法，将 message 从数据库内格式转换成 icalingua 使用的格式 */
    private msgConFromDB(message: Record<string, any>): Message {
        try {
            if (message) {
                delete message.roomId
                return {
                    ...message,
                    senderId: Number(message.senderId),
                    time: Number(message.time),
                    file: JSON.parse(message.file),
                    files: JSON.parse(message.files),
                    replyMessage: JSON.parse(message.replyMessage),
                    at: JSON.parse(message.at),
                    mirai: JSON.parse(message.mirai),
                    button_rows: JSON.parse(message.button_rows),
                    markdown: !!message.markdown,
                } as Message
            }
            return null
        } catch (e) {
            this.errorHandle(e)
        }
    }

    /** 私有方法，将 icalingua 的 chatGroup 转换成适合放在数据库里的格式 */
    private chatGroupConToDB(chatGroup: Partial<ChatGroup>): Record<string, any> {
        try {
            if (chatGroup)
                return {
                    ...chatGroup,
                    rooms: JSON.stringify(chatGroup.rooms),
                }
            return null
        } catch (e) {
            this.errorHandle(e)
        }
    }

    /** 私有方法，将 chatGroup 从数据库内格式转换成 icalingua 使用的格式 */
    private chatGroupConFromDB(chatGroup: Record<string, any>): ChatGroup {
        try {
            if (chatGroup) {
                return {
                    ...chatGroup,
                    rooms: JSON.parse(chatGroup.rooms),
                    includeAllPersonal: !!chatGroup.includeAllPersonal,
                } as ChatGroup
            }
            return null
        } catch (e) {
            this.errorHandle(e)
        }
    }

    private reportUpgradeProgress(progress: DatabaseUpgradeProgress) {
        if (!this.onUpgradeProgress) return
        try {
            this.onUpgradeProgress(progress)
        } catch (e) {
            this.errorHandle(e)
        }
    }

    /** 私有方法，用来根据当前数据库版本对数据库进行升级，从而在 Icalingua 使用的数据类型发生改变时，数据库可以存放下它们 */
    private async updateDB(dbVersion: number) {
        console.log('info', '正在升级数据库')
        const total = dbVersionLatest - dbVersion
        let step = 0
        const report = (msg: string) => {
            step++
            this.reportUpgradeProgress({ active: true, step, total, message: msg })
        }
        // 这个 switch 居然不用 break，好耶！
        try {
            switch (dbVersion) {
                case 0:
                    report('升级数据库 v0 → v1')
                    await upg0to1(this.db)
                case 1:
                    report('升级数据库 v1 → v2')
                    await upg1to2(this.db)
                case 2:
                    report('升级数据库 v2 → v3')
                    await upg2to3(this.db)
                case 3:
                    report('升级数据库 v3 → v4')
                    await upg3to4(this.db)
                case 4:
                    report('升级数据库 v4 → v5')
                    await upg4to5(this.db)
                case 5:
                    report('升级数据库 v5 → v6')
                    await upg5to6(this.db)
                case 6:
                    report('升级数据库 v6 → v7')
                    await upg6to7(this.db, this.type)
                case 7:
                    report('升级数据库 v7 → v8')
                    await upg7to8(this.db)
                case 8:
                    report('升级数据库 v8 → v9')
                    if (dbVersion >= 7) {
                        await upg8to9(this.db)
                    }
                case 9:
                    report('升级数据库 v9 → v10')
                    if (dbVersion >= 7) {
                        await upg9to10(this.db)
                    }
                case 10:
                    report('升级数据库 v10 → v11')
                    if (dbVersion >= 7) {
                        await upg10to11(this.db)
                    }
                case 11:
                    report('升级数据库 v11 → v12')
                    if (dbVersion >= 7) {
                        await upg11to12(this.db)
                    }
                case 12:
                    report('升级数据库 v12 → v13')
                    if (dbVersion >= 7) {
                        await upg12to13(this.db)
                    }
                case 13:
                    report('升级数据库 v13 → v14')
                //await upg13to14(this.db)
                case 14:
                    report('升级数据库 v14 → v15')
                    if (dbVersion >= 7) {
                        await upg14to15(this.db)
                    }
                case 15:
                    report('升级数据库 v15 → v16')
                    if (dbVersion >= 7) {
                        await upg15to16(this.db)
                    }
                case 16:
                    report('升级数据库 v16 → v17')
                    await upg16to17(this.db)
                case 17:
                    report('升级数据库 v17 → v18')
                    await upg17to18(this.db)
                case 18:
                    report('升级数据库 v18 → v19')
                    await upg18to19(this.db)
                case 19:
                    report('升级数据库 v19 → v20')
                    await upg19to20(this.db)
                case 20:
                    report('升级数据库 v20 → v21')
                    await upg20to21(this.db)
                case 21:
                    report('升级数据库 v21 → v22')
                    await upg21to22(this.db)
                case 22:
                    report('升级数据库 v22 → v23')
                    await upg22to23(this.db)
                case 23:
                    report('升级数据库 v23 → v24')
                    await upg23to24(this.db)
                case 24:
                    report('升级数据库 v24 → v25')
                    await upg24to25(this.db)
                default:
                    break
            }
            return true
        } catch (e) {
            this.errorHandle(e)
        }
    }

    private async loadSearchTimes(afterTime: number, limit: number): Promise<number[]> {
        const rows = await this.db<MessageInSQLDB>('messages')
            .distinct('time')
            .where('time', '>', Math.trunc(afterTime || 0))
            .orderBy('time', 'asc')
            .limit(Math.max(1, Math.trunc(limit)))
        return rows.map((row: any) => Math.trunc(Number(row.time))).filter((time) => time > 0)
    }

    private async loadSearchMessagesByTimes(times: number[]): Promise<SQLiteSearchMessage[]> {
        if (!times.length) return []
        const messages: SQLiteSearchMessage[] = []
        for (const batchTimes of lodash.chunk(times, sqlSearchReadBatchSize)) {
            messages.push(
                ...(await this.db<MessageInSQLDB>('messages')
                    .select('time', 'content', 'roomId', 'senderId')
                    .whereIn('time', batchTimes)
                    .where('time', '>', 0)),
            )
        }
        return messages
    }

    private async loadSearchTimeCounts(afterTime: number, limit: number): Promise<SQLiteSearchTimeCount[]> {
        const rows = await this.db('messages')
            .select('time')
            .count({ messageCount: '*' })
            .where('time', '>', Math.trunc(afterTime || 0))
            .groupBy('time')
            .orderBy('time', 'asc')
            .limit(Math.max(1, Math.trunc(limit)))
        return rows.map((row: any) => ({
            time: Math.trunc(Number(row.time)),
            messageCount: Math.max(0, Number(row.messageCount || 0)),
        }))
    }

    private async countSearchMessages(): Promise<number> {
        const result: any = await this.db('messages').where('time', '>', 0).count({ count: '*' }).first()
        return Number(result?.count || Object.values(result || {})[0] || 0)
    }

    /** Internal Worker RPC used only to feed the disposable SQLite FTS sidecar. */
    async readMessageSearchSource(request: SQLiteMessageSearchSourceRequest): Promise<SQLiteMessageSearchSourceResult> {
        switch (request.operation) {
            case 'loadTimes':
                return this.loadSearchTimes(request.afterTime, request.limit)
            case 'loadMessagesByTimes':
                return this.loadSearchMessagesByTimes(request.times)
            case 'loadMessageTimeCounts':
                return this.loadSearchTimeCounts(request.afterTime, request.limit)
            case 'countMessages':
                return this.countSearchMessages()
        }
    }

    private async ensureMessageSearchSchema(): Promise<void> {
        await this.searchIndex.open()
    }

    isMessageSearchIndexReady(): boolean {
        return this.searchIndex?.isReady === true
    }

    async validateMessageSearchIndex(): Promise<void> {
        await this.searchIndex?.validate()
    }

    async searchMessageTimes(keyword: string, options: SQLiteMessageSearchTimesOptions): Promise<number[] | null> {
        return (await this.searchIndex?.searchTimes(keyword, options)) ?? null
    }

    /** 实现 {@link StorageProvider} 类的 connect 方法。
     * 名字叫 connect ，实际上只有另外两个 `StorageProvider` 在这个方法下真正地干了连接数据库的活儿。
     *
     * 这个方法在这里主要干了这些事情：
     * 1. 如果是 PostgreSQL 数据库，那么根据 QQ 号建立一个 Schema，把这个 QQ 号产生的信息存在里面。
     * 2. 检验并建立 `dbVersion` 这个特有表 ，目的是存放与升级有关的信息。
     * 3. 检验并建立 `rooms`、`messages` 和 `ignoredChats` 这三个 Icalingua 需要的表。`rooms` 存放聊天房间，
     * `messages` 存放**所有房间的**聊天记录，`ignoredChats` 存放被忽略的聊天房间。
     * 4. 检查 `dbVersion` 中存放的数据库版本与最新版本是否一致，若不一致，则启动升级脚本 {@link updateDB}。
     */
    async connect(): Promise<void> {
        // PostgreSQL 特有功能，可用一个数据库存放所有用户的聊天数据
        try {
            if (this.type === 'pg') {
                await this.db.schema.createSchemaIfNotExists(this.qid)
            }

            // 建表存放数据库版本以便日后升级
            const hasVersionTable = await this.db.schema.hasTable(`dbVersion`)
            if (!hasVersionTable) {
                await this.db.schema.createTable(`dbVersion`, (table) => {
                    if (this.type === 'mysql') table.collate('utf8mb4_unicode_ci')
                    table.integer('dbVersion')
                    table.primary(['dbVersion'])
                })
                await this.db(`dbVersion`).insert({
                    dbVersion: dbVersionLatest,
                })
            }

            // 建表存放聊天房间
            const hasRoomTable = await this.db.schema.hasTable(`rooms`)
            if (!hasRoomTable) {
                await this.db.schema.createTable(`rooms`, (table) => {
                    if (this.type === 'mysql') table.collate('utf8mb4_unicode_ci')
                    table.string('roomId').unique().primary()
                    table.string('roomName')
                    table.integer('index')
                    table.integer('unreadCount')
                    table.integer('priority')
                    table.bigInteger('utime').index()
                    table.text('users')
                    table.text('lastMessage')
                    table.string('at').nullable()
                    table.string('atMessageId').nullable()
                    table.boolean('autoDownload').nullable()
                    table.string('downloadPath').nullable()
                    table.index(['unreadCount', 'priority', 'utime'])
                })
            }

            // 建表存放聊天记录
            const hasMessagesTable = await this.db.schema.hasTable(`messages`)
            if (!hasMessagesTable) {
                await this.db.schema.createTable(`messages`, (table) => {
                    if (this.type === 'mysql') table.collate('utf8mb4_unicode_ci')
                    table.string('_id').unique().primary()
                    table.string('senderId')
                    table.string('username')
                    table.text('content').nullable()
                    table.text('code').nullable()
                    table.string('timestamp')
                    table.string('date')
                    table.string('role')
                    table.text('file').nullable()
                    table.text('files').nullable()
                    table.bigInteger('time').index()
                    table.text('replyMessage').nullable()
                    table.string('at').nullable()
                    table.boolean('deleted').nullable()
                    table.boolean('system').nullable()
                    table.text('mirai').nullable()
                    table.boolean('reveal').nullable()
                    table.boolean('flash').nullable()
                    table.string('title', 24).nullable()
                    table.bigInteger('roomId').index()
                    table.string('anonymousId').nullable()
                    table.string('anonymousflag').nullable()
                    table.boolean('hide').nullable()
                    table.bigInteger('bubble_id').nullable()
                    table.bigInteger('subid').nullable()
                    table.string('recallInfo').nullable()
                    table.boolean('markdown').nullable()
                    table.text('button_rows').nullable()
                    table.index(['roomId', 'time'])
                    table.index(['senderId', 'roomId', 'time'])
                    //table.index(['subid', 'time'])
                })
            }

            // 建表存放忽略聊天房间
            const hasIgnoredTable = await this.db.schema.hasTable(`ignoredChats`)
            if (!hasIgnoredTable) {
                await this.db.schema.createTable(`ignoredChats`, (table) => {
                    if (this.type === 'mysql') table.collate('utf8mb4_unicode_ci')
                    table
                        .bigInteger('id') // 在 pgSQL 里会被返回成 string，不知有无 bug
                        .unique()
                        .primary()
                    table.string('name')
                })
            }

            // 建表存放聊天分组
            const hasChatGroupsTable = await this.db.schema.hasTable(`chatGroups`)
            if (!hasChatGroupsTable) {
                await this.db.schema.createTable(`chatGroups`, (table) => {
                    if (this.type === 'mysql') table.collate('utf8mb4_unicode_ci')
                    table.string('name').unique().primary()
                    table.bigInteger('index')
                    table.text('rooms')
                    table.boolean('includeAllPersonal').defaultTo(false)
                })
            }

            // 获取数据库版本
            const dbVersion = await this.db<DBVersion>(`dbVersion`).select('dbVersion')
            // 若版本低于当前版本则启动升级函数
            if (dbVersion[0].dbVersion < dbVersionLatest) {
                this.reportUpgradeProgress({
                    active: true,
                    step: 0,
                    total: dbVersionLatest - dbVersion[0].dbVersion,
                    message: '正在升级数据库...',
                })
                await this.updateDB(dbVersion[0].dbVersion)
            }

            await this.ensureMessageSearchSchema()

            // 删除异常的聊天房间
            await this.db(`rooms`).whereNull('roomId').delete()
            // 删除roomId为0的房间
            await this.db(`rooms`).where('roomId', '=', '0').delete()
        } catch (e) {
            this.errorHandle(e)
        }
    }

    /** 实现 {@link StorageProvider} 类的 `addRoom` 方法，
     * 对应 room 的“增”操作。
     *
     * 在“新房间收到新消息”等需要新增房间的事件时被调用。
     */
    async addRoom(room: Room): Promise<any> {
        try {
            return await this.db(`rooms`).insert(this.roomConToDB(room))
        } catch (e) {
            this.errorHandle(e)
        }
    }

    /** 实现 {@link StorageProvider} 类的 `updateRoom` 方法，
     * 对应 room 的“改”操作。
     *
     * 在“收到新消息”等引起房间信息变化的事件时调用。
     */
    async updateRoom(roomId: number, room: Partial<Room>): Promise<any> {
        try {
            await this.db(`rooms`).where('roomId', '=', normalizeRoomId(roomId)).update(this.roomConToDB(room))
        } catch (e) {
            this.errorHandle(e)
        }
    }

    /** 实现 {@link StorageProvider} 类的 `removeRoom` 方法，
     * 对应 room 的“删”操作。
     *
     * 在删除聊天时调用。
     */
    async removeRoom(roomId: number): Promise<any> {
        try {
            await this.db(`rooms`).where('roomId', '=', normalizeRoomId(roomId)).delete()
        } catch (e) {
            this.errorHandle(e)
        }
    }

    /** 实现 {@link StorageProvider} 类的 `getAllRooms` 方法，
     * 对应 room 的“查所有”操作。
     *
     * 在登录成功后调用。
     */
    async getAllRooms(): Promise<Room[]> {
        try {
            const rooms = await this.db<Room>(`rooms`).select('*').orderBy('utime', 'desc')
            return rooms.map((room) => this.roomConFromDB(room))
        } catch (e) {
            this.errorHandle(e)
            return []
        }
    }

    /** 实现 {@link StorageProvider} 类的 `getRoom` 方法，
     * 对应 room 的“查单个”操作。
     *
     * 在进入房间后被调用。
     */
    async getRoom(roomId: number): Promise<Room> {
        try {
            const room = await this.db<Room>(`rooms`).where('roomId', '=', normalizeRoomId(roomId)).first()
            return this.roomConFromDB(room)
        } catch (e) {
            this.errorHandle(e)
        }
    }

    /** 实现 {@link StorageProvider} 类的 `addChatGroup` 方法，
     * 对应 chatGroup 的“增”操作。
     *
     * 在“编辑分组”等需要新增聊天分组时被调用。
     */
    async addChatGroup(chatGroup: ChatGroup): Promise<any> {
        try {
            return await this.db(`chatGroups`).insert(this.chatGroupConToDB(chatGroup))
        } catch (e) {
            this.errorHandle(e)
        }
    }

    /** 实现 {@link StorageProvider} 类的 `updateChatGroup` 方法，
     * 对应 chatGroup 的“改”操作。
     *
     * 在“编辑分组”等改变聊天分组时调用。
     */
    async updateChatGroup(name: string, chatGroup: Partial<ChatGroup>): Promise<any> {
        try {
            await this.db(`chatGroups`).where('name', '=', name).update(this.chatGroupConToDB(chatGroup))
        } catch (e) {
            this.errorHandle(e)
        }
    }

    /** 实现 {@link StorageProvider} 类的 `removeChatGroup` 方法，
     * 对应 chatGroup 的“删”操作。
     *
     * 在删除聊天分组时调用。
     */
    async removeChatGroup(name: string): Promise<any> {
        try {
            await this.db(`chatGroups`).where('name', '=', name).delete()
        } catch (e) {
            this.errorHandle(e)
        }
    }

    /** 实现 {@link StorageProvider} 类的 `getAllChatGroups` 方法，
     * 对应 chatGroup 的“查所有”操作。
     *
     * 在登录成功后调用。
     */
    async getAllChatGroups(): Promise<ChatGroup[]> {
        try {
            const chatGroups = await this.db<Room>(`chatGroups`).select('*').orderBy('index', 'asc')
            return chatGroups.map((chatGroup) => this.chatGroupConFromDB(chatGroup))
        } catch (e) {
            this.errorHandle(e)
            return []
        }
    }

    /** 实现 {@link StorageProvider} 类的 `getUnreadCount` 方法，
     * 是对 room 的自定义查询方法。查询有未读消息的大于指定通知优先级的房间数。
     *
     * 在登录成功与每次收到消息后调用。
     */
    async getUnreadCount(priority: number): Promise<number> {
        try {
            const unreadRooms = await this.db<Room>(`rooms`)
                .where('unreadCount', '>', 0)
                .where('priority', '>=', priority)
                .count('roomId')
            return Number(unreadRooms[0]['count(`roomId`)'] || unreadRooms[0]['count'] || 0)
        } catch (e) {
            this.errorHandle(e)
        }
    }

    /** 实现 {@link StorageProvider} 类的 `getFirstUnreadRoom` 方法，
     * 是对 room 的自定义查询方法。
     *
     * 调用情况未知。
     */
    async getFirstUnreadRoom(priority: number): Promise<Room> {
        try {
            const unreadRooms = await this.db<Room>(`rooms`)
                .where('unreadCount', '>', 0)
                .where('priority', '>=', priority)
                .orderBy('utime', 'desc')
                .select('*')
            if (unreadRooms.length >= 1) return unreadRooms[0]
            return null
        } catch (e) {
            this.errorHandle(e)
        }
    }

    /** 实现 {@link StorageProvider} 类的 `getIgnoredChats` 方法，
     * 是对 `ignoredChats` 的“查所有”操作。
     *
     * 在用户查询忽略聊天列表时被调用。
     */
    async getIgnoredChats(): Promise<IgnoreChatInfo[]> {
        try {
            return await this.db<IgnoreChatInfo>(`ignoredChats`).select('*')
        } catch (e) {
            this.errorHandle(e)
        }
    }

    /** 实现 {@link StorageProvider} 类的 `isChatIgnored` 方法，
     * 是对 `ignoredChats` 的自定义查询操作。返回一个**布尔**值。
     *
     * 在收到消息时被调用。
     */
    async isChatIgnored(id: number): Promise<boolean> {
        try {
            const ignoredChats = await this.db<IgnoreChatInfo>(`ignoredChats`).where('id', '=', id)
            return ignoredChats.length !== 0
        } catch (e) {
            this.errorHandle(e)
        }
    }

    /** 实现 {@link StorageProvider} 类的 `addIgnoredChat` 方法，
     * 是对 `ignoredChats` 的“增”操作。
     *
     * 在忽略聊天时被调用。
     */
    async addIgnoredChat(info: IgnoreChatInfo): Promise<any> {
        try {
            await this.db<IgnoreChatInfo>(`ignoredChats`).insert(info)
        } catch (e) {
            this.errorHandle(e)
        }
    }

    /** 实现 {@link StorageProvider} 类的 `removeIgnoredChat` 方法，
     * 是对 `ignoredChats` 的“删”操作。
     *
     * 在取消忽略聊天时被调用。
     */
    async removeIgnoredChat(roomId: number): Promise<any> {
        try {
            await this.db<IgnoreChatInfo>(`ignoredChats`).where('id', '=', roomId).delete()
        } catch (e) {
            this.errorHandle(e)
        }
    }

    /** 实现 {@link StorageProvider} 类的 `addMessage` 方法，
     * 是对 `msg${roomId}` 的“增”操作。
     *
     * 在收到消息时被调用。
     */
    async addMessage(roomId: number, message: Message): Promise<any> {
        try {
            const newMessages = await this.filterNewMessages([message])
            if (!newMessages.length) return
            await this.db<Message>('messages').insert(this.msgConToDB(newMessages[0], roomId)).onConflict().ignore()
            await this.searchIndex.syncMessages(newMessages)
        } catch (e) {
            this.errorHandle(e)
        }
    }

    /** 实现 {@link StorageProvider} 类的 `updateMessage` 方法，
     * 是对 `msg${roomId}` 的“改”操作。
     *
     * 在“用户撤回消息”等需要改动消息内容的事件中被调用。
     */
    async updateMessage(roomId: number, messageId: string | number, message: Partial<Message>): Promise<any> {
        try {
            const current = await this.db<Message>('messages').where('_id', '=', `${messageId}`).first()
            await this.db<Message>('messages').where('_id', '=', `${messageId}`).update(this.msgConToDB(message))
            if (message.content !== undefined || message.time !== undefined) {
                await this.searchIndex.requestRebuild([
                    Number(current?.time || 0),
                    Number(message.time !== undefined ? message.time : current?.time || 0),
                ])
            }
        } catch (e) {
            this.errorHandle(e)
        }
    }

    /** 实现 {@link StorageProvider} 类的 `replaceMessage` 方法，
     * 是对 `msg${roomId}` 的“改”操作。
     *
     * 在“重新获取消息内容”等需要改动消息内容的事件中被调用。
     */
    async replaceMessage(roomId: number, messageId: string | number, message: Message): Promise<any> {
        try {
            const current = await this.db<Message>('messages').where('_id', '=', `${messageId}`).first()
            await this.db<Message>('messages')
                .where('_id', '=', `${messageId}`)
                .update(this.msgConToDB(message, roomId))
            if (message.content !== undefined || message.time !== undefined) {
                await this.searchIndex.requestRebuild([
                    Number(current?.time || 0),
                    Number(message.time !== undefined ? message.time : current?.time || 0),
                ])
            }
        } catch (e) {
            this.errorHandle(e)
        }
    }

    /** 实现 {@link StorageProvider} 类的 `fetchMessage` 方法，
     * 是对 `msg${roomId}` 的“查多个”操作。
     *
     * 在进入房间时，该方法被调用。
     */
    private applyMessageCursor(query: any, options: MessagePageOptions) {
        if (options?.before && options?.after) throw new Error('Message page cannot use before and after together')
        const cursor = options?.before || options?.after
        if (!cursor) return query
        const operator = options.after ? '>' : '<'
        return query.whereRaw(`(??, ??) ${operator} (?, ?)`, ['time', '_id', cursor.time, String(cursor.id)])
    }

    private orderMessagePage(query: any, options: MessagePageOptions) {
        const direction = options?.after ? 'asc' : 'desc'
        return query.orderBy('time', direction).orderBy('_id', direction)
    }

    async fetchMessages(roomId: number, options: MessagePageOptions, limit: number): Promise<Message[]> {
        try {
            let query = this.db<MessageInSQLDB>('messages').where('roomId', roomId)
            query = this.applyMessageCursor(query, options)
            const messages = await this.orderMessagePage(query, options).limit(limit).select('*')
            if (!options?.after) messages.reverse()
            return messages.map((message) => this.msgConFromDB(message))
        } catch (e) {
            this.errorHandle(e)
        }
    }

    async countUnreadMessagesFrom(roomId: number, messageId: string | number): Promise<number> {
        try {
            const target = await this.getMessage(roomId, String(messageId))
            if (!target) return 0

            const targetTime = Number(target.time || 0)
            const targetId = String(target._id)
            const result = await this.db<MessageInSQLDB>('messages')
                .where('roomId', roomId)
                .where((builder) => builder.whereNull('system').orWhere('system', false))
                .andWhereRaw('(??, ??) >= (?, ?)', ['time', '_id', targetTime, targetId])
                .count({ count: '*' })
                .first()
            return Number(result?.count || 0)
        } catch (e) {
            this.errorHandle(e)
            return 0
        }
    }

    async resolveUnreadTargetMessageId(roomId: number, unreadCount: number): Promise<string | null> {
        try {
            const count = Math.max(0, Math.trunc(Number(unreadCount) || 0))
            if (!count) return null

            let query = this.db<MessageInSQLDB>('messages')
                .where('roomId', roomId)
                .where((builder) => builder.whereNull('system').orWhere('system', false))
            query = this.orderMessagePage(query, {})

            const target = await query
                .offset(count - 1)
                .select('_id')
                .first()
            return target?._id === undefined || target?._id === null ? null : String(target._id)
        } catch (e) {
            this.errorHandle(e)
            return null
        }
    }

    /** 实现 {@link StorageProvider} 类的 `fetchMessagesBySender` 方法，
     * 按发送者查询消息记录。
     *
     * @param roomId 房间 ID，为 0 时查询所有群（roomId < 0）
     * @param senderId 发送者 ID（字符串）
     * @param skip 跳过条数
     * @param limit 返回条数
     */
    async fetchMessagesBySender(roomId: number, senderId: string, skip: number, limit: number): Promise<Message[]> {
        try {
            let query = this.db<MessageInSQLDB>('messages').where('senderId', senderId)
            if (roomId === 0) {
                // 所有群
                query = query.where('roomId', '<', 0)
            } else {
                query = query.where('roomId', roomId)
            }
            const messages = await query.orderBy('time', 'desc').limit(limit).offset(skip).select('*')
            if (roomId === 0) {
                // 所有群模式：保留 roomId 信息
                return messages.reverse().map((message) => {
                    const msgRoomId = message.roomId
                    const converted = this.msgConFromDB(message)
                    if (converted) (converted as any).roomId = msgRoomId
                    return converted
                })
            }
            return messages.reverse().map((message) => this.msgConFromDB(message))
        } catch (e) {
            this.errorHandle(e)
        }
    }

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

        const result: Message[] = []
        let skipped = 0
        let maxTime: number | undefined = endTime
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

            let query = this.db<MessageInSQLDB>('messages').whereIn('time', times)
            if (roomId !== 0) query = query.where('roomId', roomId)
            if (senderId !== undefined) query = query.where('senderId', senderId)
            if (startTime !== undefined) query = query.where('time', '>=', startTime)
            if (endTime !== undefined) query = query.where('time', '<=', endTime)
            const escapedKeyword = escapeSearchLikePattern(normalized)
            query = query.whereRaw("LOWER(COALESCE(content, '')) LIKE ? ESCAPE '!'", [`%${escapedKeyword}%`])
            const messages = await query.orderBy('time', 'desc').select('*')
            for (const message of messages) {
                if (skipped < skip) {
                    skipped++
                    continue
                }
                const messageRoomId = Number(message.roomId)
                const converted = this.msgConFromDB(message)
                if (roomId === 0 && converted) converted.roomId = messageRoomId
                if (converted) result.push(converted)
                if (result.length >= limit) break
            }
            const lastTime = Number(times[times.length - 1])
            maxTime = lastTime - 1
            if (lastTime <= 0) break
        }
        return result
    }

    /** 实现 {@link StorageProvider} 类的 `searchMessages` 方法，
     * 按关键字搜索消息记录。roomId 为 0 时搜索全部会话。
     *
     * @param roomId 房间 ID
     * @param keyword 搜索关键字
     * @param skip 跳过条数
     * @param limit 返回条数
     */
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

            let query = this.db<MessageInSQLDB>('messages')
            if (normalized) {
                const escapedKeyword = escapeSearchLikePattern(normalized)
                query = query.whereRaw("LOWER(COALESCE(content, '')) LIKE ? ESCAPE '!'", [`%${escapedKeyword}%`])
            }
            if (roomId !== 0) query = query.where('roomId', roomId)
            if (senderId !== undefined) query = query.where('senderId', senderId)
            if (startTime !== undefined) query = query.where('time', '>=', startTime)
            if (endTime !== undefined) query = query.where('time', '<=', endTime)
            const messages = await query.orderBy('time', 'desc').limit(limit).offset(skip).select('*')
            return messages.map((message) => {
                const messageRoomId = Number(message.roomId)
                const converted = this.msgConFromDB(message)
                if (roomId === 0 && converted) converted.roomId = messageRoomId
                return converted
            })
        } catch (e) {
            this.errorHandle(e)
        }
    }

    /** 实现 {@link StorageProvider} 类的 `fetchImageMessages` 方法，
     * 是对 `msg${roomId}` 的"查多个"操作，只返回包含图片的消息。
     *
     * 在浏览聊天图片时，该方法被调用。
     * @param endTime 可选，只返回时间小于等于此值的消息（用于从指定月份开始加载）
     */
    async fetchImageMessages(roomId: number, skip: number, limit: number, endTime?: number): Promise<Message[]> {
        try {
            let query = this.db<MessageInSQLDB>('messages')
                .where('roomId', roomId)
                .where('files', 'like', '%"type":"image/%')
            if (endTime) {
                query = query.where('time', '<=', endTime)
            }
            const messages = await query.orderBy('time', 'desc').limit(limit).offset(skip).select('*')
            return messages.map((message) => this.msgConFromDB(message))
        } catch (e) {
            this.errorHandle(e)
        }
    }

    /** 实现 {@link StorageProvider} 类的 `getMessage` 方法，
     * 是对 `msg${roomId}` 的"查"操作。
     *
     * 在获取聊天历史消息时，该方法被调用。
     */
    private async findMessageRecord(roomId: number, messageId: string): Promise<MessageInSQLDB> {
        const exactMessage = await this.db<MessageInSQLDB>('messages')
            .where('_id', messageId)
            .where('roomId', roomId)
            .select('*')
            .first()
        if (exactMessage) return exactMessage

        const time = messageIdTime(messageId)
        if (time === null) return null
        const targetTime = time * 1000
        const candidates = await this.db<MessageInSQLDB>('messages')
            .where('roomId', roomId)
            .whereBetween('time', [targetTime - 2000, targetTime + 2000])
            .select('*')
        return candidates.find((candidate) => messageIdsEquivalent(candidate._id, messageId)) || null
    }

    async getMessage(roomId: number, messageId: string): Promise<Message> {
        try {
            const message = await this.findMessageRecord(roomId, messageId)
            return message ? this.msgConFromDB(message) : null
        } catch (e) {
            this.errorHandle(e)
        }
    }

    /** 实现 {@link StorageProvider} 类的 `fetchMessagesAround` 方法，
     * 获取指定消息前后的消息。
     *
     * 在定位到指定消息时，该方法被调用。
     */
    async fetchMessagesAround(roomId: number, messageId: string, before: number, after: number): Promise<Message[]> {
        try {
            const targetMsg = await this.findMessageRecord(roomId, messageId)
            if (!targetMsg) return []

            const cursor: MessageCursor = { time: Number(targetMsg.time || 0), id: targetMsg._id }
            const [beforeMessages, afterMessages] = await Promise.all([
                before > 0 ? this.fetchMessages(roomId, { before: cursor }, before) : Promise.resolve([]),
                after > 0 ? this.fetchMessages(roomId, { after: cursor }, after) : Promise.resolve([]),
            ])
            return [...beforeMessages, this.msgConFromDB(targetMsg), ...afterMessages]
        } catch (e) {
            this.errorHandle(e)
        }
    }

    /** 实现 {@link StorageProvider} 类的 `addMessages` 方法，
     * 是对 `msg${roomId}` 的自定义增操作。用于向数据库内增加多条消息。
     *
     * 在获取聊天历史消息时，该方法被调用。
     */
    async addMessages(roomId: number, messages: Message[]): Promise<any> {
        try {
            const newMessages = await this.db.transaction(async (transaction) => {
                const candidates = await this.filterNewMessages(messages, transaction)
                const msgToInsert = candidates.map((message) => this.msgConToDB(message, roomId))
                for (const chunkedMessage of lodash.chunk(msgToInsert, 200)) {
                    await transaction<Message>('messages').insert(chunkedMessage).onConflict('_id').ignore()
                }
                return candidates
            })
            await this.searchIndex.syncMessages(newMessages)
        } catch (e) {
            return e
        }
    }

    /** 实现 {@link StorageProvider} 类的 `close` 方法，
     * 关闭数据库连接池，确保所有待写入数据 flush 到磁盘。
     * 应在进程退出前调用。
     */
    async close(): Promise<void> {
        try {
            if (this.searchIndex) await this.searchIndex.close()
            if (this.db) {
                await this.db.destroy()
            }
        } catch (e) {
            this.errorHandle(e)
        }
    }
}
