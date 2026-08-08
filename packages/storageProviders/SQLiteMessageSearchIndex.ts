import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import knex, { Knex } from 'knex'
import DatabaseUpgradeProgress from '@icalingua/types/DatabaseUpgradeProgress'
import { normalizeSearchText } from './MessageSearchIndex'

export interface SQLiteSearchMessage {
    time?: number
    content?: unknown
}

export interface SQLiteSearchTimeCount {
    time: number
    messageCount: number
}

export interface SQLiteMessageSearchIndexCallbacks {
    loadTimes: (afterTime: number, limit: number) => Promise<number[]>
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

const searchIndexFormat = 'trigram-interleaved-none-contentless-delete-v6'
const searchBatchSize = 200
const searchWriteYieldInterval = 50
const searchMergePages = 128
const interleavedSeparator = '\u0001'
const messageSeparator = '\u0003'
// detail=none omits token positions. Keep contentless_delete for row replacement;
// SQLite rejects columnsize=0 together with contentless_delete=1.
const searchFtsColumns = "content, content='', contentless_delete=1, detail=none, tokenize='trigram'"
const createSearchFtsSql = `CREATE VIRTUAL TABLE search_fts USING fts5(${searchFtsColumns})`
const createSearchFtsIfNotExistsSql = `CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(${searchFtsColumns})`
const legacyCursorRecoveryState = 'legacyCursorRecovery'

const searchCharacters = (value: unknown): string[] => Array.from(normalizeSearchText(value))

const encodeInterleavedOneGram = (character: string): string =>
    `${interleavedSeparator}${character}${interleavedSeparator}`

const encodeInterleavedTwoGram = (left: string, right: string): string => `${left}${interleavedSeparator}${right}`

const encodeSearchText = (value: unknown): string => {
    const characters = searchCharacters(value)
    if (!characters.length) return ''
    return `${interleavedSeparator}${characters.join(interleavedSeparator)}${interleavedSeparator}`
}

const encodeSearchQuery = (value: unknown): string | null => {
    const characters = searchCharacters(value)
    if (!characters.length) return null
    if (characters.length === 1) return quoteSearchToken(encodeInterleavedOneGram(characters[0]))

    const grams = new Set<string>()
    for (let index = 0; index + 1 < characters.length; index++) {
        grams.add(encodeInterleavedTwoGram(characters[index], characters[index + 1]))
    }
    return Array.from(grams, quoteSearchToken).join(' AND ')
}

const quoteSearchToken = (token: string): string => `"${token.replace(/"/g, '""')}"`

const sqliteAfterCreate = (conn: any, done: any) => {
    try {
        conn.exec(
            [
                'PRAGMA journal_mode = WAL',
                'PRAGMA busy_timeout = 5000',
                'PRAGMA synchronous = NORMAL',
                'PRAGMA cache_size = -16384',
                'PRAGMA mmap_size = 67108864',
            ].join('; '),
        )
        done(null, conn)
    } catch (error) {
        done(error, conn)
    }
}

const messageTime = (message: SQLiteSearchMessage): number => Math.trunc(Number(message.time || 0))

const yieldToWorkerEventLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

interface BuildCursor {
    time: number
    legacy: boolean
}

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
    private operationPromise: Promise<void> = Promise.resolve()
    private validationPromise: Promise<void> | null = null
    private requestGeneration = 0
    private buildRestartRequested = false
    private pendingWork = false
    private closing = false
    private available = false
    private ready = false
    private rebuilding = false
    private buildIndexedThroughTime = 0
    private buildScanActive = false
    private buildLoadingTimes = false
    private activeBuildThroughTime = 0

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
                client: 'better-sqlite3',
                connection: { filename: this.filePath, charset: 'utf8mb4' },
                useNullAsDefault: true,
                pool: { min: 1, max: 1, afterCreate: sqliteAfterCreate },
            })
            await this.ensureSchema()
            this.available = true
            const hasPending = Boolean(await this.db('search_pending_times').first())
            this.ready = (await this.getState('ready')) === '1' && !hasPending
            this.rebuilding = !this.ready
            this.pendingWork = hasPending
            this.startBuild()
        } catch (error) {
            this.available = false
            this.ready = false
            this.rebuilding = false
            const db = this.db
            this.db = null
            if (db) await db.destroy().catch(() => undefined)
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
        this.buildIndexedThroughTime = 0
        this.buildScanActive = false
        this.buildLoadingTimes = false
        this.activeBuildThroughTime = 0
        try {
            await this.buildPromise
            await this.validationPromise
            await this.operationPromise
        } catch (error) {
            this.errorHandle(error)
        }
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

    private enqueueOperation<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.operationPromise.then(operation, operation)
        this.operationPromise = result.then(
            () => undefined,
            () => undefined,
        )
        return result
    }

    private pendingTimesForCurrentBuild(times: number[], force = false): number[] {
        if (force || !this.rebuilding || !this.buildScanActive || this.buildLoadingTimes) return times
        const indexedThroughTime = Math.max(this.buildIndexedThroughTime, this.activeBuildThroughTime)
        return times.filter((time) => time <= indexedThroughTime)
    }

    async queueMessages(messages: SQLiteSearchMessage[], needsRebuild = false): Promise<void> {
        if (!messages.length || !this.db) return
        const messageTimes = Array.from(new Set(messages.map(messageTime).filter((time) => time > 0)))
        const times = this.pendingTimesForCurrentBuild(messageTimes)
        if (!times.length) return
        if (needsRebuild) {
            await this.queueRebuildTimes(times)
            return
        }
        const queueVersion = randomUUID()
        try {
            await this.db.transaction(async (transaction) => {
                for (let offset = 0; offset < times.length; offset += searchBatchSize) {
                    const rows = times.slice(offset, offset + searchBatchSize).map((time) => ({
                        time,
                        queueVersion,
                        needsRebuild: 0,
                    }))
                    const pending = transaction('search_pending_times').insert(rows)
                    await pending.onConflict('time').merge({ queueVersion })
                    if (offset + searchBatchSize < times.length) await yieldToWorkerEventLoop()
                }
            })
            this.pendingWork = true
            this.startBuild()
        } catch (error) {
            if (!this.closing) this.errorHandle(error)
        }
    }

    async requestRebuild(times?: number | number[]): Promise<void> {
        if (times === undefined) return
        await this.queueRebuildTimes(Array.isArray(times) ? times : [times])
    }

    private async queueRebuildTimes(times: number[], startBuild = true, force = false): Promise<void> {
        const db = this.db
        if (!db) return
        const normalizedTimes = Array.from(
            new Set(times.map((time) => Math.trunc(Number(time))).filter((time) => time > 0)),
        )
        if (!normalizedTimes.length) return
        try {
            const indexedTimes = this.pendingTimesForCurrentBuild(normalizedTimes, force)
            if (!indexedTimes.length) return
            const queueVersion = randomUUID()
            await db.transaction(async (transaction) => {
                for (let offset = 0; offset < indexedTimes.length; offset += searchBatchSize) {
                    const rows = indexedTimes.slice(offset, offset + searchBatchSize).map((time) => ({
                        time,
                        queueVersion,
                        needsRebuild: 1,
                    }))
                    await transaction('search_pending_times')
                        .insert(rows)
                        .onConflict('time')
                        .merge({ queueVersion, needsRebuild: 1 })
                    if (offset + searchBatchSize < indexedTimes.length) await yieldToWorkerEventLoop()
                }
            })
            this.pendingWork = true
            this.ready = false
            this.rebuilding = true
            if (startBuild) this.startBuild()
        } catch (error) {
            if (!this.closing) this.errorHandle(error)
        }
    }

    async syncMessages(messages: SQLiteSearchMessage[]): Promise<void> {
        if (!messages.length || !this.db || !this.available) return
        await this.enqueueOperation(() => this.syncMessagesInternal(messages))
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
            const pending = (await this.db('search_pending_times')
                .whereIn('time', times)
                .select('time', 'queueVersion', 'needsRebuild')) as PendingSearchTime[]
            const currentMessages = await this.callbacks.loadMessagesByTimes(times)
            await this.rebuildTimes(times, currentMessages)
            if (pending.length) await this.removeProcessedPendingTimes(pending)
            if (this.pendingWork) this.startBuild()
        } catch (error) {
            if (!this.closing) this.errorHandle(error)
            await this.queueRebuildTimes(times, true, true)
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
            await transaction.schema.dropTableIfExists('search_fts_vocab')
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
        const validationBarrier = this.enqueueOperation(async () => undefined)
        this.validationPromise = validationBarrier
            .then(() => this.validateMessageCounts())
            .then(() => undefined)
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

    private async validateMessageCounts(startBuild = true): Promise<boolean> {
        const db = this.db
        const loadMessageTimeCounts = this.callbacks.loadMessageTimeCounts
        if (!db) return false
        if (!loadMessageTimeCounts) return true

        const total = await this.getTotal()
        const invalidTimes: number[] = []
        const flushInvalidTimes = async () => {
            if (!invalidTimes.length) return
            const times = invalidTimes.splice(0, invalidTimes.length)
            await this.queueRebuildTimes(times, startBuild, true)
        }
        const addInvalidTime = async (time: number) => {
            if (time <= 0 || invalidTimes.includes(time)) return
            invalidTimes.push(time)
            if (invalidTimes.length >= searchBatchSize) await flushInvalidTimes()
        }

        let sourceAfterTime = 0
        let indexedAfterTime = 0
        let sourceBatch: SQLiteSearchTimeCount[] = []
        let indexedBatch: Array<{ time: number; messageCount: number }> = []
        let sourceOffset = 0
        let indexedOffset = 0
        let sourceDone = false
        let indexedDone = false
        let processed = 0
        let sourceSinceReport = 0

        const loadNextSourceBatch = async () => {
            while (!sourceDone && sourceOffset >= sourceBatch.length) {
                const loaded = await loadMessageTimeCounts(sourceAfterTime, searchBatchSize)
                const normalized = new Map<number, number>()
                for (const item of loaded) {
                    const time = Math.trunc(Number(item.time))
                    if (time <= sourceAfterTime) continue
                    normalized.set(time, Math.max(0, Math.trunc(Number(item.messageCount || 0))))
                }
                sourceBatch = Array.from(normalized, ([time, messageCount]) => ({ time, messageCount })).sort(
                    (left, right) => left.time - right.time,
                )
                sourceOffset = 0
                if (!sourceBatch.length) {
                    sourceDone = true
                    return
                }
                const lastTime = sourceBatch[sourceBatch.length - 1].time
                if (lastTime <= sourceAfterTime) {
                    sourceDone = true
                    sourceBatch = []
                    return
                }
                sourceAfterTime = lastTime
            }
        }

        const loadNextIndexedBatch = async () => {
            while (!indexedDone && indexedOffset >= indexedBatch.length) {
                const rows = await db('search_time_state')
                    .where('time', '>', indexedAfterTime)
                    .select('time', 'messageCount')
                    .orderBy('time', 'asc')
                    .limit(searchBatchSize)
                const normalized = new Map<number, number>()
                for (const row of rows) {
                    const time = Math.trunc(Number(row.time))
                    if (time <= indexedAfterTime) continue
                    normalized.set(time, Math.max(0, Math.trunc(Number(row.messageCount || 0))))
                }
                indexedBatch = Array.from(normalized, ([time, messageCount]) => ({ time, messageCount })).sort(
                    (left, right) => left.time - right.time,
                )
                indexedOffset = 0
                if (!indexedBatch.length) {
                    indexedDone = true
                    return
                }
                const lastTime = indexedBatch[indexedBatch.length - 1].time
                if (lastTime <= indexedAfterTime) {
                    indexedDone = true
                    indexedBatch = []
                    return
                }
                indexedAfterTime = lastTime
            }
        }

        await loadNextSourceBatch()
        await loadNextIndexedBatch()
        let comparisonsSinceYield = 0
        while (!this.closing && (!sourceDone || !indexedDone)) {
            const source = sourceBatch[sourceOffset]
            const indexed = indexedBatch[indexedOffset]
            if (!source && !sourceDone) {
                await loadNextSourceBatch()
                continue
            }
            if (!indexed && !indexedDone) {
                await loadNextIndexedBatch()
                continue
            }
            if (!source) {
                await addInvalidTime(indexed.time)
                indexedOffset++
            } else if (!indexed) {
                await addInvalidTime(source.time)
                processed += source.messageCount
                sourceSinceReport++
                sourceOffset++
            } else if (source.time === indexed.time) {
                if (source.messageCount !== indexed.messageCount) await addInvalidTime(source.time)
                processed += source.messageCount
                sourceSinceReport++
                sourceOffset++
                indexedOffset++
            } else if (source.time < indexed.time) {
                await addInvalidTime(source.time)
                processed += source.messageCount
                sourceSinceReport++
                sourceOffset++
            } else {
                await addInvalidTime(indexed.time)
                indexedOffset++
            }
            if (sourceSinceReport >= searchBatchSize) {
                sourceSinceReport = 0
                this.report({
                    active: true,
                    step: Math.min(processed, total || processed),
                    total: total || processed,
                    message: '正在校验消息搜索索引...',
                })
            }
            if (sourceOffset >= sourceBatch.length) await loadNextSourceBatch()
            if (indexedOffset >= indexedBatch.length) await loadNextIndexedBatch()
            comparisonsSinceYield++
            if (comparisonsSinceYield >= searchBatchSize) {
                comparisonsSinceYield = 0
                await yieldToWorkerEventLoop()
            }
        }
        if (this.closing) return false
        await flushInvalidTimes()
        this.report({
            active: true,
            step: Math.min(processed, total || processed),
            total: total || processed,
            message: '正在校验消息搜索索引...',
        })
        return true
    }

    private async runBuild(): Promise<void> {
        const db = this.db
        if (!db) return
        while (!this.closing) {
            const generation = this.requestGeneration
            const ready = (await this.getState('ready')) === '1'
            let cursor = this.parseCursor(await this.getState('buildCursor'))
            let legacyRecovery = (await this.getState(legacyCursorRecoveryState)) === '1'
            if (cursor?.legacy) {
                legacyRecovery = true
                await this.setState(legacyCursorRecoveryState, '1')
            }
            const hasIndexedRows = Boolean(await db('search_time_state').first())
            const hasPending = Boolean(await db('search_pending_times').first())
            this.pendingWork = hasPending
            if (!ready && !cursor && !hasPending && !hasIndexedRows) {
                await this.enqueueOperation(() => this.resetFts())
                cursor = undefined
            }
            this.buildIndexedThroughTime = cursor?.time || 0
            let afterTime = cursor?.time || 0
            if (ready && !cursor) {
                if (hasPending) {
                    this.rebuilding = true
                    this.ready = false
                }
                await this.flushPendingTimes(true)
                if (generation !== this.requestGeneration) continue
                if (legacyRecovery) {
                    const validated = await this.validateMessageCounts(false)
                    if (generation !== this.requestGeneration) continue
                    await this.flushPendingTimes(true)
                    if (!validated) continue
                    await db('search_state').where('key', legacyCursorRecoveryState).delete()
                }
                if (generation !== this.requestGeneration) continue
                this.rebuilding = false
                this.ready = true
                this.report({ active: false, step: 0, total: 0, message: '' })
                return
            }

            this.rebuilding = true
            this.ready = false
            let processed = cursor ? await this.getIndexedMessageCount(cursor.time) : 0
            const total = Math.max(await this.getTotal(), processed)
            this.report({ active: true, step: processed, total, message: '正在建立消息搜索索引...' })
            this.buildScanActive = true
            try {
                while (!this.closing) {
                    if (generation !== this.requestGeneration) break
                    this.buildLoadingTimes = true
                    let times: number[]
                    try {
                        times = await this.callbacks.loadTimes(afterTime, searchBatchSize)
                    } finally {
                        this.buildLoadingTimes = false
                    }
                    const normalizedTimes = Array.from(
                        new Set(times.map((time) => Math.trunc(Number(time))).filter((time) => time > afterTime)),
                    ).sort((left, right) => left - right)
                    if (!normalizedTimes.length) break
                    const lastTime = normalizedTimes[normalizedTimes.length - 1]
                    this.activeBuildThroughTime = lastTime
                    const batchCount = await this.enqueueOperation(() =>
                        this.insertBuildBatch(normalizedTimes, Boolean(cursor || hasIndexedRows)),
                    )
                    this.activeBuildThroughTime = 0
                    afterTime = lastTime
                    this.buildIndexedThroughTime = lastTime
                    cursor = { time: lastTime, legacy: false }
                    await this.setState('buildCursor', JSON.stringify({ time: lastTime }))
                    processed += batchCount
                    this.report({ active: true, step: processed, total, message: '正在建立消息搜索索引...' })
                    await yieldToWorkerEventLoop()
                }
            } finally {
                this.buildScanActive = false
                this.buildLoadingTimes = false
                this.activeBuildThroughTime = 0
            }
            if (this.closing) return
            if (generation !== this.requestGeneration) continue
            await this.flushPendingTimes(true)
            if (generation !== this.requestGeneration) continue
            if (legacyRecovery) {
                const validated = await this.validateMessageCounts(false)
                if (generation !== this.requestGeneration) continue
                await this.flushPendingTimes(true)
                if (!validated) continue
                await db('search_state').where('key', legacyCursorRecoveryState).delete()
            }
            if (generation !== this.requestGeneration) continue
            // Skip the full FTS5 merge for large indexes. The pending-time flush
            // and the ready-state transaction below are still required.
            // this.report({ active: true, step: 0, total: 0, message: '正在优化消息搜索索引...' })
            // await this.enqueueOperation(() => this.optimize())
            if (generation !== this.requestGeneration) continue
            const completed = await this.enqueueOperation(() =>
                db.transaction(async (transaction) => {
                    if (await transaction('search_pending_times').first()) return false
                    await transaction('search_state')
                        .whereIn('key', ['buildCursor', legacyCursorRecoveryState])
                        .delete()
                    await transaction('search_state')
                        .insert({ key: 'ready', value: '1' })
                        .onConflict('key')
                        .merge({ value: '1' })
                    return true
                }),
            )
            if (!completed) continue
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
            await transaction.schema.dropTableIfExists('search_fts_vocab')
            await transaction.schema.dropTableIfExists('search_fts')
            await transaction.raw(createSearchFtsSql)
            await transaction('search_state').whereIn('key', ['ready', 'buildCursor']).delete()
            await transaction('search_time_state').delete()
            await transaction('search_pending_times').where('needsRebuild', 1).delete()
        })
    }

    private async flushPendingTimes(reportProgress = false): Promise<void> {
        const db = this.db
        if (!db || !this.callbacks.loadMessagesByTimes) return
        let processed = 0
        let total = await this.getPendingCount()
        if (reportProgress && total) {
            this.report({ active: true, step: 0, total, message: '正在同步索引建立期间新增的消息...' })
        }
        while (!this.closing) {
            const batchSize = await this.enqueueOperation(async () => {
                const pending = (await db('search_pending_times')
                    .select('time', 'queueVersion', 'needsRebuild')
                    .orderBy('time', 'asc')
                    .limit(searchBatchSize)) as PendingSearchTime[]
                if (!pending.length) return 0
                const times = pending.map((row) => Number(row.time)).filter((time) => time > 0)
                if (times.length) {
                    const currentMessages = await this.callbacks.loadMessagesByTimes(times)
                    const currentCounts = new Map<number, number>()
                    for (const message of currentMessages) {
                        const time = messageTime(message)
                        if (time > 0) currentCounts.set(time, (currentCounts.get(time) || 0) + 1)
                    }
                    const indexedCounts = new Map<number, number>(
                        (await db('search_time_state').whereIn('time', times).select('time', 'messageCount')).map(
                            (row: any) => [Number(row.time), Number(row.messageCount || 0)],
                        ),
                    )
                    const rebuildTimes = pending
                        .filter(
                            (row) =>
                                Number(row.needsRebuild || 0) === 1 ||
                                currentCounts.get(Number(row.time)) !== indexedCounts.get(Number(row.time)),
                        )
                        .map((row) => Number(row.time))
                        .filter((time) => time > 0)
                    if (rebuildTimes.length) {
                        await this.rebuildTimes(rebuildTimes, currentMessages, true)
                    }
                }
                await this.removeProcessedPendingTimes(pending)
                return pending.length
            })
            if (!batchSize) {
                this.pendingWork = false
                return
            }
            processed += batchSize
            if (reportProgress) {
                const remaining = await this.getPendingCount()
                total = Math.max(total, processed + remaining)
                this.report({
                    active: true,
                    step: Math.min(processed, total),
                    total,
                    message: '正在同步索引建立期间新增的消息...',
                })
            }
            await yieldToWorkerEventLoop()
        }
    }

    private async removeProcessedPendingTimes(pending: PendingSearchTime[]): Promise<void> {
        const db = this.db
        if (!db) return
        const grouped = new Map<string | null, number[]>()
        for (const row of pending) {
            const time = Number(row.time)
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
            let mergePages = -searchMergePages
            while (!this.closing) {
                const before = await db.raw('SELECT total_changes() AS changes')
                await db.raw("INSERT INTO search_fts(search_fts, rank) VALUES('merge', ?)", [mergePages])
                const after = await db.raw('SELECT total_changes() AS changes')
                const beforeChanges = Number(before?.[0]?.changes || 0)
                const afterChanges = Number(after?.[0]?.changes || 0)
                if (afterChanges - beforeChanges < 2) break
                mergePages = searchMergePages
                await yieldToWorkerEventLoop()
            }
            await db.raw('PRAGMA wal_checkpoint(TRUNCATE)')
        } catch (error) {
            if (!this.closing) this.errorHandle(error)
        }
    }

    private async rebuildTimes(
        times: number[],
        messages?: SQLiteSearchMessage[],
        removeExisting = true,
    ): Promise<number> {
        const db = this.db
        if (!db) return 0
        const normalizedTimes = Array.from(
            new Set(times.map((time) => Math.trunc(Number(time))).filter((time) => time > 0)),
        )
        if (!normalizedTimes.length) return 0
        const currentMessages = messages || (await this.callbacks.loadMessagesByTimes(normalizedTimes))
        const normalizedTimeSet = new Set(normalizedTimes)
        const grouped = new Map<number, { contents: string[]; messageCount: number }>()
        for (const message of currentMessages) {
            const time = messageTime(message)
            if (time <= 0 || !normalizedTimeSet.has(time)) continue
            const values = grouped.get(time) || { contents: [], messageCount: 0 }
            values.messageCount++
            const content = this.indexContent(message.content)
            if (content) values.contents.push(content)
            grouped.set(time, values)
        }
        await db.transaction(async (transaction) => {
            for (let index = 0; index < normalizedTimes.length; index++) {
                const time = normalizedTimes[index]
                const value = grouped.get(time)
                if (!value) {
                    if (removeExisting) await transaction('search_fts').where('rowid', time).delete()
                    await transaction('search_time_state').where('time', time).delete()
                    continue
                }
                await transaction('search_time_state')
                    .insert({ time, messageCount: value.messageCount })
                    .onConflict('time')
                    .merge({ messageCount: value.messageCount })
                const content = value.contents.filter(Boolean).join(messageSeparator)
                if (content) {
                    await transaction.raw('INSERT OR REPLACE INTO search_fts(rowid, content) VALUES (?, ?)', [
                        time,
                        content,
                    ])
                } else if (removeExisting) {
                    await transaction('search_fts').where('rowid', time).delete()
                }
                if ((index + 1) % searchWriteYieldInterval === 0 && index + 1 < normalizedTimes.length) {
                    await yieldToWorkerEventLoop()
                }
            }
        })
        return currentMessages.length
    }

    private async insertBuildBatch(times: number[], removeExisting: boolean): Promise<number> {
        const normalizedTimes = Array.from(
            new Set(times.map((time) => Math.trunc(Number(time))).filter((time) => time > 0)),
        )
        if (!normalizedTimes.length) return 0
        const currentMessages = await this.callbacks.loadMessagesByTimes(normalizedTimes)
        await this.rebuildTimes(normalizedTimes, currentMessages, removeExisting)
        return currentMessages.length
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

    private async getIndexedMessageCount(maxTime: number): Promise<number> {
        const db = this.db
        if (!db) return 0
        const row = await db('search_time_state')
            .where('time', '<=', Math.trunc(maxTime))
            .sum({ messageCount: 'messageCount' })
            .first()
        return Math.max(0, Number(row?.messageCount || 0))
    }

    private async getPendingCount(): Promise<number> {
        const db = this.db
        if (!db) return 0
        const row = await db('search_pending_times').count({ count: '*' }).first()
        return Math.max(0, Number(row?.count || 0))
    }

    private parseCursor(value: string | undefined): BuildCursor | undefined {
        if (!value) return undefined
        try {
            const cursor = JSON.parse(value)
            if (Number.isFinite(Number(cursor?.time))) {
                return {
                    time: Math.max(0, Math.trunc(Number(cursor.time))),
                    legacy: cursor?.id !== undefined,
                }
            }
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
        return encodeSearchQuery(value)
    }
}
