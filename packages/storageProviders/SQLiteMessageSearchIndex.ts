import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import knex, { Knex } from 'knex'
import DatabaseUpgradeProgress from '@icalingua/types/DatabaseUpgradeProgress'
import { normalizeSearchText } from './MessageSearchIndex'

export interface SQLiteSearchCursor {
    time: number
    id: string
}

export interface SQLiteSearchMessage {
    _id?: string | number
    id?: string | number
    time?: number
    content?: unknown
}

export interface SQLiteSearchTimeCount {
    time: number
    messageCount: number
}

export interface SQLiteMessageSearchIndexCallbacks {
    loadBatch: (cursor: SQLiteSearchCursor | undefined, limit: number) => Promise<SQLiteSearchMessage[]>
    loadMessagesByTimes: (times: number[]) => Promise<SQLiteSearchMessage[]>
    loadMessageTimeCounts?: (afterTime: number, limit: number) => Promise<SQLiteSearchTimeCount[]>
    countMessages?: () => Promise<number>
    reportProgress?: (progress: DatabaseUpgradeProgress) => void
}

export interface SQLiteMessageSearchTimesOptions {
    maxTime?: number
    minTime?: number
    limit: number
}

interface PendingSearchTime {
    time: number
    queueVersion: string | null
    needsRebuild?: number
}

const searchIndexFormat = 'unicode61-1gram-full-contentless-v2'
const searchBatchSize = 200
const messageSeparator = ' messageboundary '
const searchFtsColumns = "content, content='', detail=full, columnsize=0, tokenize='unicode61'"
const createSearchFtsSql = `CREATE VIRTUAL TABLE search_fts USING fts5(${searchFtsColumns})`
const createSearchFtsIfNotExistsSql = `CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(${searchFtsColumns})`

const encodeSearchText = (value: unknown): string =>
    Array.from(normalizeSearchText(value))
        .map((character) => `g${character.codePointAt(0)!.toString(16)}`)
        .join(' ')

const sqliteAfterCreate = (conn: any, done: any) => {
    conn.exec(
        [
            'PRAGMA journal_mode = WAL',
            'PRAGMA busy_timeout = 5000',
            'PRAGMA synchronous = NORMAL',
            'PRAGMA cache_size = -16384',
            'PRAGMA mmap_size = 67108864',
        ].join('; '),
        (err: any) => done(err, conn),
    )
}

const messageId = (message: SQLiteSearchMessage): string => String(message.id ?? message._id ?? '')

const messageTime = (message: SQLiteSearchMessage): number => Math.trunc(Number(message.time || 0))

/**
 * A disposable per-account FTS database.
 *
 * The contentless FTS5 rowid is deliberately the message timestamp. Messages
 * sharing one timestamp are kept in one document and exact matching is still
 * performed against the primary database after FTS has selected candidates.
 */
export default class SQLiteMessageSearchIndex {
    private readonly filePath: string
    private readonly callbacks: SQLiteMessageSearchIndexCallbacks
    private readonly errorHandle: (error: unknown) => void
    private db: Knex | null = null
    private buildPromise: Promise<void> | null = null
    private syncPromise: Promise<void> | null = null
    private validationPromise: Promise<void> | null = null
    private requestGeneration = 0
    private buildRestartRequested = false
    private pendingWork = false
    private closing = false
    private available = false
    private ready = false
    private rebuilding = false

    constructor(
        filePath: string,
        callbacks: SQLiteMessageSearchIndexCallbacks,
        errorHandle: (error: unknown) => void = console.error,
    ) {
        this.filePath = filePath
        this.callbacks = callbacks
        this.errorHandle = errorHandle
    }

    get isAvailable(): boolean {
        return this.available
    }

    get isReady(): boolean {
        return this.available && this.ready
    }

    get isRebuilding(): boolean {
        return this.rebuilding
    }

    async open(): Promise<void> {
        if (this.db) return
        this.closing = false
        try {
            fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
            this.db = knex({
                client: 'sqlite3',
                connection: { filename: this.filePath, charset: 'utf8mb4' },
                useNullAsDefault: true,
                pool: { min: 1, max: 1, afterCreate: sqliteAfterCreate },
            })
            await this.ensureSchema()
            this.available = true
            this.ready = (await this.getState('ready')) === '1'
            this.rebuilding = !this.ready
            this.startBuild()
        } catch (error) {
            this.available = false
            this.ready = false
            this.rebuilding = false
            this.db = null
            if (!this.closing) this.errorHandle(error)
        }
    }

    async close(): Promise<void> {
        this.closing = true
        this.buildRestartRequested = false
        this.pendingWork = false
        this.available = false
        this.ready = false
        this.rebuilding = false
        const db = this.db
        this.db = null
        if (!db) return
        try {
            await db.destroy()
        } catch (error) {
            this.errorHandle(error)
        }
    }

    async getState(key: string): Promise<string | undefined> {
        if (!this.db) return undefined
        const row = await this.db('search_state').where('key', key).first()
        if (row?.value === undefined || row?.value === null) return undefined
        return String(row.value)
    }

    async setState(key: string, value: string): Promise<void> {
        if (!this.db) return
        await this.db('search_state').insert({ key, value }).onConflict('key').merge({ value })
    }

    async queueMessages(messages: SQLiteSearchMessage[], needsRebuild = false): Promise<void> {
        if (!messages.length || !this.db) return
        const times = Array.from(new Set(messages.map(messageTime).filter((time) => time > 0)))
        if (!times.length) return
        const queueVersion = randomUUID()
        try {
            await this.db.transaction(async (transaction) => {
                for (let offset = 0; offset < times.length; offset += searchBatchSize) {
                    const rows = times.slice(offset, offset + searchBatchSize).map((time) => ({
                        time,
                        queueVersion,
                        needsRebuild: needsRebuild ? 1 : 0,
                    }))
                    const pending = transaction('search_pending_times').insert(rows)
                    if (needsRebuild) await pending.onConflict('time').merge({ queueVersion, needsRebuild: 1 })
                    else await pending.onConflict('time').merge({ queueVersion })
                }
            })
            this.pendingWork = true
            this.startBuild()
        } catch (error) {
            if (!this.closing) this.errorHandle(error)
        }
    }

    async requestRebuild(time?: number): Promise<void> {
        if (!this.db) return
        try {
            this.requestGeneration++
            await this.db.transaction(async (transaction) => {
                await transaction('search_state').whereIn('key', ['ready', 'buildCursor']).delete()
                await transaction('search_pending_times').delete()
                if (time !== undefined && time > 0) {
                    await transaction('search_pending_times').insert({
                        time: Math.trunc(time),
                        queueVersion: randomUUID(),
                        needsRebuild: 1,
                    })
                }
            })
            this.pendingWork = time !== undefined && time > 0
            this.ready = false
            this.rebuilding = true
            this.startBuild()
        } catch (error) {
            if (!this.closing) this.errorHandle(error)
        }
    }

    async syncMessages(messages: SQLiteSearchMessage[]): Promise<void> {
        if (!messages.length || !this.db || !this.available) return
        const previous = this.syncPromise || Promise.resolve()
        const current = previous.catch(() => undefined).then(() => this.syncMessagesInternal(messages))
        this.syncPromise = current
        try {
            await current
        } finally {
            if (this.syncPromise === current) this.syncPromise = null
        }
    }

    private async syncMessagesInternal(messages: SQLiteSearchMessage[]): Promise<void> {
        if (!messages.length || !this.db || !this.available) return
        if (!this.ready || this.rebuilding) {
            await this.queueMessages(messages)
            return
        }
        const times = Array.from(new Set(messages.map(messageTime).filter((time) => time > 0)))
        if (!times.length) return
        try {
            const currentMessages = await this.callbacks.loadMessagesByTimes(times)
            await this.insertMessages(currentMessages.length ? currentMessages : messages)
            if (this.pendingWork) this.startBuild()
        } catch (error) {
            if (!this.closing) this.errorHandle(error)
        }
    }

    async searchTimes(keyword: string, options: SQLiteMessageSearchTimesOptions): Promise<number[] | null> {
        if (!this.db || !this.available || !this.ready) return null
        const match = this.buildMatchQuery(keyword)
        if (!match) return null
        try {
            let query = this.db('search_fts').select('rowid').whereRaw('search_fts MATCH ?', [match])
            if (options.maxTime !== undefined) query = query.where('rowid', '<=', Math.trunc(options.maxTime))
            if (options.minTime !== undefined) query = query.where('rowid', '>=', Math.trunc(options.minTime))
            const rows = await query.orderBy('rowid', 'desc').limit(Math.max(1, Math.trunc(options.limit)))
            return rows.map((row: any) => Number(row.rowid)).filter((time: number) => Number.isFinite(time))
        } catch (error) {
            if (!this.closing) this.errorHandle(error)
            return null
        }
    }

    async validate(): Promise<void> {
        if (this.validationPromise) return this.validationPromise
        if (this.closing || !this.db || !this.available || !this.ready || this.rebuilding) return
        this.startValidation()
        if (this.validationPromise) await this.validationPromise
    }

    private async ensureSchema(): Promise<void> {
        const db = this.db
        if (!db) throw new Error('SQLite search database is unavailable')
        if (!(await db.schema.hasTable('search_state'))) {
            await db.schema.createTable('search_state', (table) => {
                table.string('key').primary()
                table.text('value').notNullable()
            })
        }
        if (!(await db.schema.hasTable('search_pending_times'))) {
            await db.schema.createTable('search_pending_times', (table) => {
                table.integer('time').primary()
                table.integer('needsRebuild').notNullable().defaultTo(0)
                table.string('queueVersion').nullable()
            })
        } else if (!(await db.schema.hasColumn('search_pending_times', 'queueVersion'))) {
            await db.schema.alterTable('search_pending_times', (table) => table.string('queueVersion').nullable())
        }
        if (!(await db.schema.hasTable('search_time_state'))) {
            await db.schema.createTable('search_time_state', (table) => {
                table.integer('time').primary()
                table.integer('messageCount').notNullable().defaultTo(0)
            })
        }
        await db.raw(createSearchFtsIfNotExistsSql)
        if ((await this.getState('format')) === searchIndexFormat) return

        await db.transaction(async (transaction) => {
            await transaction.schema.dropTableIfExists('search_fts')
            await transaction.raw(createSearchFtsSql)
            await transaction.schema.dropTableIfExists('search_metadata')
            await transaction.schema.dropTableIfExists('search_pending')
            await transaction.schema.dropTableIfExists('search_grams')
            await transaction('search_pending_times').delete()
            await transaction('search_time_state').delete()
            await transaction('search_state').delete()
            await transaction('search_state').insert({ key: 'format', value: searchIndexFormat })
        })
    }

    private startBuild(): void {
        if (this.closing || !this.db || !this.available) return
        if (this.validationPromise) {
            this.buildRestartRequested = true
            return
        }
        if (this.buildPromise) {
            this.buildRestartRequested = true
            return
        }
        this.buildRestartRequested = false
        this.buildPromise = this.runBuild()
            .catch((error) => {
                if (!this.closing) {
                    this.ready = false
                    this.rebuilding = true
                    this.errorHandle(error)
                    this.report({ active: true, step: 0, total: 0, message: '搜索索引将在下次启动时继续建立' })
                }
            })
            .finally(() => {
                this.buildPromise = null
                if (this.buildRestartRequested && !this.closing) {
                    this.buildRestartRequested = false
                    this.startBuild()
                }
            })
    }

    private startValidation(): void {
        if (this.validationPromise || this.closing || !this.db || !this.available || !this.ready || this.rebuilding)
            return
        this.ready = false
        this.rebuilding = true
        this.report({ active: true, step: 0, total: 0, message: '正在校验消息搜索索引...' })
        let failed = false
        this.validationPromise = this.validateMessageCounts()
            .catch((error) => {
                failed = true
                if (!this.closing) this.errorHandle(error)
            })
            .finally(() => {
                this.validationPromise = null
                if (this.closing) return
                if (failed) {
                    this.ready = false
                    this.rebuilding = true
                    this.report({
                        active: true,
                        step: 0,
                        total: 0,
                        message: '消息搜索索引校验失败，将在下次启动时重试',
                    })
                    return
                }
                if (this.pendingWork || this.buildRestartRequested) {
                    this.buildRestartRequested = false
                    this.startBuild()
                    return
                }
                this.ready = true
                this.rebuilding = false
                this.report({ active: false, step: 0, total: 0, message: '' })
            })
    }

    private async validateMessageCounts(): Promise<void> {
        const db = this.db
        const loadMessageTimeCounts = this.callbacks.loadMessageTimeCounts
        if (!db || !loadMessageTimeCounts) return
        const total = await this.getTotal()
        const indexedTotalRow: any = await db('search_time_state').sum({ count: 'messageCount' }).first()
        const indexedTotal = Number(indexedTotalRow?.count || Object.values(indexedTotalRow || {})[0] || 0)
        let invalid = indexedTotal !== total
        let afterTime = 0
        let processed = 0
        while (!this.closing) {
            const counts = await loadMessageTimeCounts(afterTime, searchBatchSize)
            if (!counts.length) break
            const times = counts.map((item) => Math.trunc(Number(item.time))).filter((time) => time > 0)
            if (!times.length) break
            const indexedRows = await db('search_time_state').whereIn('time', times).select('time', 'messageCount')
            const indexedCounts = new Map(
                indexedRows.map((row: any) => [Number(row.time), Number(row.messageCount || 0)]),
            )
            for (const item of counts) {
                const time = Math.trunc(Number(item.time))
                const messageCount = Math.max(0, Math.trunc(Number(item.messageCount || 0)))
                if (indexedCounts.get(time) !== messageCount) invalid = true
            }
            processed += counts.reduce((sum, item) => sum + Math.max(0, Number(item.messageCount || 0)), 0)
            this.report({
                active: true,
                step: Math.min(processed, total || processed),
                total: total || processed,
                message: '正在校验消息搜索索引...',
            })
            const lastTime = times[times.length - 1]
            if (lastTime <= afterTime || counts.length < searchBatchSize) break
            afterTime = lastTime
        }
        if (invalid) await this.requestRebuild()
    }

    private async runBuild(): Promise<void> {
        const db = this.db
        if (!db) return
        while (!this.closing) {
            const generation = this.requestGeneration
            const pendingRebuild = await db('search_pending_times').where('needsRebuild', 1).first()
            const ready = (await this.getState('ready')) === '1'
            let cursor = this.parseCursor(await this.getState('buildCursor'))

            if (pendingRebuild || (!ready && !cursor)) {
                await this.resetFts()
                cursor = undefined
            }
            if (ready && !pendingRebuild && !cursor) {
                await this.flushPendingTimes()
                if (generation !== this.requestGeneration) continue
                this.rebuilding = false
                this.ready = true
                this.report({ active: false, step: 0, total: 0, message: '' })
                return
            }

            this.rebuilding = true
            this.ready = false
            const total = await this.getTotal()
            let processed = 0
            this.report({ active: true, step: processed, total, message: '正在建立消息搜索索引...' })
            while (!this.closing) {
                if (generation !== this.requestGeneration) break
                const batch = await this.callbacks.loadBatch(cursor, searchBatchSize)
                if (!batch.length) break
                await this.insertBuildBatch(batch)
                const last = batch[batch.length - 1]
                cursor = { time: messageTime(last), id: messageId(last) }
                await this.setState('buildCursor', JSON.stringify(cursor))
                processed += batch.length
                this.report({ active: true, step: processed, total, message: '正在建立消息搜索索引...' })
            }
            if (this.closing) return
            if (generation !== this.requestGeneration) continue
            await this.flushPendingTimes()
            if (generation !== this.requestGeneration) continue
            await this.optimize()
            if (generation !== this.requestGeneration) continue
            await db.transaction(async (transaction) => {
                await transaction('search_state').where('key', 'buildCursor').delete()
                await transaction('search_state')
                    .insert({ key: 'ready', value: '1' })
                    .onConflict('key')
                    .merge({ value: '1' })
            })
            this.ready = true
            this.rebuilding = false
            this.report({ active: false, step: 0, total: 0, message: '' })
            return
        }
    }

    private async resetFts(): Promise<void> {
        const db = this.db
        if (!db) return
        await db.transaction(async (transaction) => {
            await transaction.schema.dropTableIfExists('search_fts')
            await transaction.raw(createSearchFtsSql)
            await transaction('search_state').whereIn('key', ['ready', 'buildCursor']).delete()
            await transaction('search_time_state').delete()
            await transaction('search_pending_times').where('needsRebuild', 1).delete()
        })
    }

    private async flushPendingTimes(): Promise<void> {
        const db = this.db
        if (!db || !this.callbacks.loadMessagesByTimes) return
        while (!this.closing) {
            const pending = (await db('search_pending_times')
                .select('time', 'queueVersion', 'needsRebuild')
                .orderBy('time', 'asc')
                .limit(searchBatchSize)) as PendingSearchTime[]
            if (!pending.length) {
                this.pendingWork = false
                return
            }
            const times = pending.map((row) => Number(row.time)).filter((time) => time > 0)
            const messages = times.length ? await this.callbacks.loadMessagesByTimes(times) : []
            await this.insertMessages(messages)
            const foundTimes = new Set(messages.map(messageTime).filter((time) => time > 0))
            await this.removeProcessedPendingTimes(pending, foundTimes.size ? foundTimes : new Set(times))
        }
    }

    private async removeProcessedPendingTimes(pending: PendingSearchTime[], foundTimes: Set<number>): Promise<void> {
        const db = this.db
        if (!db) return
        const grouped = new Map<string | null, number[]>()
        for (const row of pending) {
            const time = Number(row.time)
            if (!foundTimes.has(time)) continue
            const queueVersion = row.queueVersion == null ? null : String(row.queueVersion)
            const times = grouped.get(queueVersion) || []
            times.push(time)
            grouped.set(queueVersion, times)
        }
        for (const [queueVersion, times] of grouped) {
            let query = db('search_pending_times').whereIn('time', times)
            query = queueVersion === null ? query.whereNull('queueVersion') : query.where('queueVersion', queueVersion)
            await query.delete()
        }
    }

    private async optimize(): Promise<void> {
        const db = this.db
        if (!db) return
        try {
            await db.raw("INSERT INTO search_fts(search_fts) VALUES('optimize')")
            await db.raw('PRAGMA wal_checkpoint(TRUNCATE)')
        } catch (error) {
            if (!this.closing) this.errorHandle(error)
        }
    }

    private async insertMessages(messages: SQLiteSearchMessage[]): Promise<void> {
        const db = this.db
        if (!db || !messages.length) return
        const grouped = new Map<number, { contents: string[]; messageCount: number }>()
        for (const message of messages) {
            const time = messageTime(message)
            if (time <= 0) continue
            const values = grouped.get(time) || { contents: [], messageCount: 0 }
            values.messageCount++
            const content = this.indexContent(message.content)
            if (content) values.contents.push(content)
            grouped.set(time, values)
        }
        if (!grouped.size) return
        await db.transaction(async (transaction) => {
            for (const [time, value] of grouped) {
                await transaction('search_time_state')
                    .insert({ time, messageCount: value.messageCount })
                    .onConflict('time')
                    .merge({ messageCount: value.messageCount })
                const content = value.contents.filter(Boolean).join(messageSeparator)
                await transaction.raw('INSERT OR REPLACE INTO search_fts(rowid, content) VALUES (?, ?)', [
                    time,
                    content,
                ])
            }
        })
    }

    private async insertBuildBatch(messages: SQLiteSearchMessage[]): Promise<void> {
        const times = Array.from(new Set(messages.map(messageTime).filter((time) => time > 0)))
        if (!times.length) return
        const currentMessages = await this.callbacks.loadMessagesByTimes(times)
        await this.insertMessages(currentMessages.length ? currentMessages : messages)
    }

    private indexContent(value: unknown): string {
        return encodeSearchText(value)
    }

    private async getTotal(): Promise<number> {
        try {
            return Math.max(0, Number((await this.callbacks.countMessages?.()) || 0))
        } catch {
            return 0
        }
    }

    private parseCursor(value: string | undefined): SQLiteSearchCursor | undefined {
        if (!value) return undefined
        try {
            const cursor = JSON.parse(value)
            if (Number.isFinite(Number(cursor?.time)) && cursor?.id !== undefined)
                return { time: Number(cursor.time), id: String(cursor.id) }
        } catch {}
        return undefined
    }

    private report(progress: DatabaseUpgradeProgress): void {
        try {
            this.callbacks.reportProgress?.(progress)
        } catch (error) {
            if (!this.closing) this.errorHandle(error)
        }
    }

    private buildMatchQuery(value: unknown): string | null {
        const encoded = encodeSearchText(value)
        if (!encoded) return null
        return `"${encoded.replace(/"/g, '""')}"`
    }
}
