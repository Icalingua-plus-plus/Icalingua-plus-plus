import fs from 'fs'
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
}

const searchIndexFormat = 'time-v4'
const searchBatchSize = 200
const gramSeparator = '\uE000'
const messageSeparator = '\uE001'

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
 * The contentless FTS5 rowid is deliberately the message timestamp. It is not
 * a local message identifier or a mapping table: all messages sharing a
 * timestamp are merged into one FTS document and the timestamp is the only
 * value returned to the storage provider. The provider then reads the actual
 * messages from its primary database and performs the exact substring check.
 */
export default class SQLiteMessageSearchIndex {
    private readonly filePath: string
    private readonly callbacks: SQLiteMessageSearchIndexCallbacks
    private readonly errorHandle: (error: unknown) => void
    private db: Knex | null = null
    private buildPromise: Promise<void> | null = null
    private requestGeneration = 0
    private buildRestartRequested = false
    private pendingWork = false
    private validationPromise: Promise<void> | null = null
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

    get isAvailable() {
        return this.available
    }

    get isReady() {
        return this.available && this.ready
    }

    get isRebuilding() {
        return this.rebuilding
    }

    async validate(): Promise<void> {
        if (this.validationPromise) return this.validationPromise
        if (this.closing || !this.db || !this.available || !this.ready || this.rebuilding) return
        this.startValidation()
        if (this.validationPromise) await this.validationPromise
    }

    async open(): Promise<void> {
        if (this.db) return
        try {
            fs.mkdirSync(require('path').dirname(this.filePath), { recursive: true })
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
        if (db) {
            try {
                await db.destroy()
            } catch (error) {
                if (!this.closing) this.errorHandle(error)
            }
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
                // SQLite compiles large multi-row inserts into a compound SELECT.
                // Keep each statement below SQLITE_MAX_COMPOUND_SELECT so large
                // history pulls do not fail while queuing the sidecar index.
                for (let offset = 0; offset < times.length; offset += searchBatchSize) {
                    const pending = transaction('search_pending_times').insert(
                        times
                            .slice(offset, offset + searchBatchSize)
                            .map((time) => ({ time, queueVersion, needsRebuild: needsRebuild ? 1 : 0 })),
                    )
                    if (needsRebuild) await pending.onConflict('time').merge({ queueVersion, needsRebuild: 1 })
                    else await pending.onConflict('time').merge({ queueVersion })
                }
            })
            this.pendingWork = true
            if (!this.ready || this.rebuilding) this.startBuild()
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
                if (time !== undefined && time > 0) {
                    const queueVersion = randomUUID()
                    await transaction('search_pending_times')
                        .insert({ time: Math.trunc(time), queueVersion, needsRebuild: 1 })
                        .onConflict('time')
                        .merge({ queueVersion, needsRebuild: 1 })
                }
            })
            if (time !== undefined && time > 0) this.pendingWork = true
            this.ready = false
            this.rebuilding = true
            this.startBuild()
        } catch (error) {
            if (!this.closing) this.errorHandle(error)
        }
    }

    async syncMessages(messages: SQLiteSearchMessage[]): Promise<void> {
        if (!messages.length || !this.db || !this.available) return
        if (!this.ready || this.rebuilding) {
            await this.queueMessages(messages)
            return
        }
        try {
            await this.insertMessages(messages)
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
            if (options.maxTime !== undefined) {
                query = query.where('rowid', '<=', Math.trunc(options.maxTime))
            }
            if (options.minTime !== undefined) {
                query = query.where('rowid', '>=', Math.trunc(options.minTime))
            }
            const values = await query.orderBy('rowid', 'desc').limit(Math.max(1, Math.trunc(options.limit)))
            return (values || []).map((row: any) => Number(row.rowid)).filter((time: number) => Number.isFinite(time))
        } catch (error) {
            // The sidecar is disposable. A failed MATCH simply makes the
            // caller use its exact primary-database fallback for this request.
            if (!this.closing) this.errorHandle(error)
            return null
        }
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
        await db.raw(
            "CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(content, content='', detail=none, columnsize=0, tokenize='trigram')",
        )
        if ((await this.getState('format')) === searchIndexFormat) return

        await db.transaction(async (transaction) => {
            // Remove both the previous localRowId sidecar format and the old
            // disposable gram sidecars. Neither format is queried anymore.
            await transaction.schema.dropTableIfExists('search_fts')
            await transaction.raw(
                "CREATE VIRTUAL TABLE search_fts USING fts5(content, content='', detail=none, columnsize=0, tokenize='trigram')",
            )
            await transaction.schema.dropTableIfExists('search_metadata')
            await transaction.schema.dropTableIfExists('search_pending')
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
                    this.buildRestartRequested = false
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
            const mismatches = counts.filter((item) => {
                const time = Math.trunc(Number(item.time))
                const messageCount = Math.max(0, Math.trunc(Number(item.messageCount || 0)))
                const indexedCount = indexedCounts.get(time)
                return indexedCount === undefined || indexedCount < messageCount
            })
            if (mismatches.length) await this.queueMessages(mismatches)
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
        if (this.pendingWork) await this.flushPendingTimes()
        if (!this.pendingWork) this.buildRestartRequested = false
    }

    private async runBuild(): Promise<void> {
        const db = this.db
        if (!db) return
        while (!this.closing) {
            const generation = this.requestGeneration
            const pendingRebuild = await db('search_pending_times').where('needsRebuild', 1).first()
            let cursor = this.parseCursor(await this.getState('buildCursor'))
            const ready = (await this.getState('ready')) === '1'

            if (!ready && !cursor) {
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
                if (this.closing) return
                await this.insertMessages(batch)
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
            if (generation !== this.requestGeneration) continue
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
            await transaction.raw(
                "CREATE VIRTUAL TABLE search_fts USING fts5(content, content='', detail=none, columnsize=0, tokenize='trigram')",
            )
            await transaction('search_state').whereIn('key', ['ready', 'buildCursor']).delete()
            await transaction('search_time_state').delete()
        })
    }

    private async flushPendingTimes(): Promise<void> {
        const db = this.db
        if (!db || !this.callbacks.loadMessagesByTimes) return
        while (!this.closing) {
            const pending = (await db('search_pending_times')
                .select('time', 'queueVersion')
                .orderBy('time', 'asc')
                .limit(searchBatchSize)) as PendingSearchTime[]
            if (!pending.length) {
                this.pendingWork = false
                return
            }
            const times = pending.map((row: any) => Number(row.time)).filter((time: number) => time > 0)
            if (!times.length) return
            const messages = await this.callbacks.loadMessagesByTimes(times)
            if (messages.length) await this.insertMessages(messages)
            const foundTimes = new Set(messages.map(messageTime).filter((time) => time > 0))
            if (!foundTimes.size) return
            await this.removeProcessedPendingTimes(pending, foundTimes)
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
                if (content) await transaction('search_fts').insert({ rowid: time, content })
            }
        })
    }

    private indexContent(value: unknown): string {
        const normalized = normalizeSearchText(value).replace(/\u0000/g, ' ')
        if (!normalized) return ''
        const chars = Array.from(normalized)
        const shortTerms = new Set<string>()
        for (const char of chars) shortTerms.add(`${char}${gramSeparator}${gramSeparator}`)
        for (let index = 0; index + 1 < chars.length; index++) {
            shortTerms.add(`${chars[index]}${chars[index + 1]}${gramSeparator}`)
        }
        return [normalized, ...shortTerms].join(messageSeparator)
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

    private report(progress: DatabaseUpgradeProgress) {
        try {
            this.callbacks.reportProgress?.(progress)
        } catch (error) {
            if (!this.closing) this.errorHandle(error)
        }
    }

    private buildMatchQuery(value: unknown): string | null {
        const chars = Array.from(normalizeSearchText(value))
        if (!chars.length || chars.join('').includes('\u0000')) return null
        const quote = (term: string) => `"${term.replace(/"/g, '""')}"`
        if (chars.length === 1) return quote(`${chars[0]}${gramSeparator}${gramSeparator}`)
        if (chars.length === 2) return quote(`${chars[0]}${chars[1]}${gramSeparator}`)
        if (chars.length < 3) return null
        // detail=none does not support phrase queries, so query each trigram separately.
        const trigrams = new Set<string>()
        for (let index = 0; index + 2 < chars.length; index++) trigrams.add(chars.slice(index, index + 3).join(''))
        return Array.from(trigrams).map(quote).join(' AND ')
    }
}
