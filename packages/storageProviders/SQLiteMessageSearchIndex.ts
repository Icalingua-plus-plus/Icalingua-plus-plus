import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import knex, { Knex } from 'knex'
import BetterSqlite3 from 'better-sqlite3'
import DatabaseUpgradeProgress from '@icalingua/types/DatabaseUpgradeProgress'
import { normalizeSearchText } from './MessageSearchIndex'

export interface SQLiteSearchMessage {
    time?: number
    content?: unknown
    roomId?: number | string
    senderId?: number | string
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
    buildBatchSize?: number
    validationBatchSize?: number
}

export interface SQLiteMessageSearchTimesOptions {
    maxTime?: number
    minTime?: number
    roomId?: number | string
    senderId?: number | string
    limit: number
}

interface PendingSearchTime {
    time: number
    queueVersion: string | null
    needsRebuild?: number
}

const searchIndexFormat = 'trigram-interleaved-run-length-identifier-none-contentless-delete-v9'
const searchBatchSize = 200
const searchProgressInterval = 500
const searchDatabaseDeleteAttempts = 100
const searchDatabaseDeleteRetryDelay = 250
// Each bulk write below binds at most two values per time. Stay below the
// lowest common SQLite variable limit even if searchBatchSize is increased.
const searchSqlParameterBudget = 900
const searchWriteBatchSize = Math.min(searchBatchSize, Math.floor(searchSqlParameterBudget / 2))
const searchMergePages = 128
const roomIdTokenCacheSize = 2048
const senderIdTokenCacheSize = 262144
const interleavedSeparator = '\u0001'
const continuousTokenMarker = '\u0002'
const messageSeparator = '\u0003'
const roomIdTokenMarker = '\u0004'
const senderIdTokenMarker = '\u0005'
const continuousTokenLengths = [3, 6, 12, 24] as const
// A field marker plus two private-use code points is one atomic trigram. The
// combined alphabet covers signed QQ identifiers without sharing text tokens.
const bmpPrivateUseSize = 0x1900
const supplementaryPrivateUseSize = 0xfffe
const identifierAlphabetSize = BigInt(bmpPrivateUseSize + supplementaryPrivateUseSize * 2)
const identifierTokenCapacity = identifierAlphabetSize * identifierAlphabetSize
// detail=none omits token positions. Keep contentless_delete for row replacement;
// SQLite rejects columnsize=0 together with contentless_delete=1.
const searchFtsColumns = "content, content='', contentless_delete=1, detail=none, tokenize='trigram'"
const createSearchFtsSql = `CREATE VIRTUAL TABLE search_fts USING fts5(${searchFtsColumns})`
const createSearchFtsIfNotExistsSql = `CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(${searchFtsColumns})`
const requiredSearchDatabaseTables = [
    'search_state',
    'search_pending_times',
    'search_time_state',
    'search_fts',
] as const
const legacyCursorRecoveryState = 'legacyCursorRecovery'

interface ExistingSearchDatabaseInspection {
    format?: string
    hasRequiredSchema: boolean
}

const searchCharacters = (value: unknown): string[] => Array.from(normalizeSearchText(value))

const encodeInterleavedOneGram = (character: string): string =>
    `${interleavedSeparator}${character}${interleavedSeparator}`

const encodeInterleavedTwoGram = (left: string, right: string): string => `${left}${interleavedSeparator}${right}`

// The length is stored as one code point (U+0003/U+0006/U+000C/U+0018), not
// as decimal text such as "4" or "16", so every run token stays three code
// points and is indexed by the trigram tokenizer as one token.
const encodeContinuousToken = (character: string, length: number): string =>
    `${continuousTokenMarker}${character}${String.fromCharCode(length)}`

const forEachContinuousRun = (characters: string[], callback: (character: string, length: number) => void): void => {
    for (let start = 0; start < characters.length;) {
        const character = characters[start]
        let end = start + 1
        while (end < characters.length && characters[end] === character) end++
        const length = end - start
        if (length >= continuousTokenLengths[0]) callback(character, length)
        start = end
    }
}

const encodeSearchText = (value: unknown): string => {
    const characters = searchCharacters(value)
    if (!characters.length) return ''
    const encoded = `${interleavedSeparator}${characters.join(interleavedSeparator)}${interleavedSeparator}`
    const continuousTokens: string[] = []
    forEachContinuousRun(characters, (character, length) => {
        for (const tokenLength of continuousTokenLengths) {
            if (length < tokenLength) break
            continuousTokens.push(encodeContinuousToken(character, tokenLength))
        }
    })
    return continuousTokens.length ? `${encoded}${continuousTokens.join('')}` : encoded
}

const encodeSearchQuery = (value: unknown): string | null => {
    const characters = searchCharacters(value)
    if (!characters.length) return null
    if (characters.length === 1) return quoteSearchToken(encodeInterleavedOneGram(characters[0]))

    const grams = new Set<string>()
    for (let index = 0; index + 1 < characters.length; index++) {
        grams.add(encodeInterleavedTwoGram(characters[index], characters[index + 1]))
    }
    forEachContinuousRun(characters, (character, length) => {
        for (let index = continuousTokenLengths.length - 1; index >= 0; index--) {
            const tokenLength = continuousTokenLengths[index]
            if (length >= tokenLength) {
                grams.add(encodeContinuousToken(character, tokenLength))
                break
            }
        }
    })
    return Array.from(grams, quoteSearchToken).join(' AND ')
}

const quoteSearchToken = (token: string): string => `"${token.replace(/"/g, '""')}"`

interface ParsedSearchIdentifier {
    canonical: string
    numeric: bigint
}

const rawSearchIdentifier = (value: unknown): string => String(value ?? '').trim()

const isSearchIdentifier = (identifier: string): boolean => /^-?\d+$/.test(identifier)

const parseSearchIdentifier = (identifier: string): ParsedSearchIdentifier | null => {
    try {
        const numeric = BigInt(identifier)
        return { canonical: numeric.toString(), numeric }
    } catch {
        return null
    }
}

const identifierCodePoint = (value: bigint): string => {
    let index = Number(value)
    if (index < bmpPrivateUseSize) return String.fromCodePoint(0xe000 + index)
    index -= bmpPrivateUseSize
    if (index < supplementaryPrivateUseSize) return String.fromCodePoint(0xf0000 + index)
    return String.fromCodePoint(0x100000 + index - supplementaryPrivateUseSize)
}

const hashSearchIdentifier = (identifier: string): bigint => {
    let hash = 14695981039346656037n
    for (const character of Array.from(identifier)) {
        hash ^= BigInt(character.codePointAt(0) || 0)
        hash = BigInt.asUintN(64, hash * 1099511628211n)
    }
    return hash
}

const encodeParsedSearchIdentifier = (marker: string, identifier: ParsedSearchIdentifier): string => {
    const pairedIdentifier = identifier.numeric >= 0n ? identifier.numeric * 2n : -identifier.numeric * 2n - 1n
    const encodedIdentifier =
        pairedIdentifier < identifierTokenCapacity
            ? pairedIdentifier
            : hashSearchIdentifier(identifier.canonical) % identifierTokenCapacity
    return `${marker}${identifierCodePoint(encodedIdentifier / identifierAlphabetSize)}${identifierCodePoint(encodedIdentifier % identifierAlphabetSize)}`
}

export const encodeSearchIdentifierToken = (marker: string, value: unknown): string => {
    const rawIdentifier = rawSearchIdentifier(value)
    if (!isSearchIdentifier(rawIdentifier)) return ''
    const identifier = parseSearchIdentifier(rawIdentifier)
    return identifier ? encodeParsedSearchIdentifier(marker, identifier) : ''
}

/** A bounded FIFO cache for stable per-account identifier tokens. */
export class SearchIdentifierTokenCache {
    private readonly tokens = new Map<string, string>()

    constructor(
        private readonly marker: string,
        readonly maxEntries: number,
    ) {
        if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0) {
            throw new RangeError('Search identifier token cache size must be a positive safe integer')
        }
    }

    get size(): number {
        return this.tokens.size
    }

    encode(value: unknown): string {
        const cacheKey = rawSearchIdentifier(value)
        const cached = this.tokens.get(cacheKey)
        if (cached !== undefined) return cached
        if (!isSearchIdentifier(cacheKey)) return ''
        const identifier = parseSearchIdentifier(cacheKey)
        if (!identifier) return ''
        const token = encodeParsedSearchIdentifier(this.marker, identifier)
        if (this.tokens.size >= this.maxEntries) {
            const oldest = this.tokens.keys().next()
            if (!oldest.done) this.tokens.delete(oldest.value)
        }
        this.tokens.set(cacheKey, token)
        return token
    }

    clear(): void {
        this.tokens.clear()
    }
}

const encodeSearchIdentifierQuery = (cache: SearchIdentifierTokenCache, value: unknown): string | null => {
    const encoded = cache.encode(value)
    return encoded ? quoteSearchToken(encoded) : null
}

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
const wait = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds))

const sqliteDatabaseFiles = (filePath: string): string[] => [
    `${filePath}-wal`,
    `${filePath}-shm`,
    `${filePath}-journal`,
    filePath,
]

const existingFiles = async (filePaths: string[]): Promise<{ files: string[]; error?: unknown }> => {
    const files: string[] = []
    let lastError: unknown
    for (const filePath of filePaths) {
        try {
            await fs.promises.stat(filePath)
            files.push(filePath)
        } catch (error) {
            if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
                files.push(filePath)
                lastError = error
            }
        }
    }
    return { files, error: lastError }
}

const inspectExistingSearchDatabase = (filePath: string): ExistingSearchDatabaseInspection => {
    const db = new BetterSqlite3(filePath, { fileMustExist: true })
    try {
        const tableRows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
        const tables = new Set(tableRows.map((row: { name: unknown }) => String(row.name)))
        let format: string | undefined
        if (tables.has('search_state')) {
            const row = db.prepare("SELECT value FROM search_state WHERE key = 'format'").get()
            if (row?.value !== undefined && row?.value !== null) format = String(row.value)
        }
        return {
            format,
            hasRequiredSchema: requiredSearchDatabaseTables.every((table) => tables.has(table)),
        }
    } finally {
        db.close()
    }
}

const isSQLiteCorruptionError = (error: unknown): boolean => {
    const code = String((error as NodeJS.ErrnoException)?.code || '')
    if (code === 'SQLITE_NOTADB' || code === 'SQLITE_CORRUPT' || code.startsWith('SQLITE_CORRUPT_')) return true
    const message = error instanceof Error ? error.message : String(error || '')
    return /database disk image is malformed|file is not a database|malformed database schema/i.test(message)
}

const deleteSQLiteDatabaseFiles = async (filePath: string): Promise<void> => {
    const filePaths = sqliteDatabaseFiles(filePath)
    let lastError: unknown
    for (let attempt = 1; attempt <= searchDatabaseDeleteAttempts; attempt++) {
        for (const targetPath of filePaths) {
            try {
                await fs.promises.unlink(targetPath)
            } catch (error) {
                if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') lastError = error
            }
        }

        const remaining = await existingFiles(filePaths)
        if (!remaining.files.length) return
        lastError = remaining.error || lastError
        if (attempt < searchDatabaseDeleteAttempts) await wait(searchDatabaseDeleteRetryDelay)
    }

    const remaining = await existingFiles(filePaths)
    if (!remaining.files.length) return
    const reason = lastError instanceof Error ? `: ${lastError.message}` : ''
    throw new Error(
        `Failed to delete SQLite search database after ${searchDatabaseDeleteAttempts} attempts; remaining files: ${remaining.files.join(', ')}${reason}`,
    )
}

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
    private pendingProgress: DatabaseUpgradeProgress | null = null
    private progressTimer: ReturnType<typeof setTimeout> | null = null
    private lastProgressReportAt = 0
    private readonly roomIdTokenCache = new SearchIdentifierTokenCache(roomIdTokenMarker, roomIdTokenCacheSize)
    private readonly senderIdTokenCache = new SearchIdentifierTokenCache(senderIdTokenMarker, senderIdTokenCacheSize)

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
        this.lastProgressReportAt = 0
        try {
            fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
            const databaseFiles = sqliteDatabaseFiles(this.filePath)
            const existingDatabaseFiles = await existingFiles(databaseFiles)
            const databaseExisted = existingDatabaseFiles.files.includes(this.filePath)
            let reuseExistingDatabase = false
            if (!databaseExisted && existingDatabaseFiles.files.length) {
                await deleteSQLiteDatabaseFiles(this.filePath)
                if (this.closing) return
            } else if (databaseExisted) {
                try {
                    const inspection = inspectExistingSearchDatabase(this.filePath)
                    reuseExistingDatabase = inspection.format === searchIndexFormat && inspection.hasRequiredSchema
                } catch (error) {
                    if (!isSQLiteCorruptionError(error)) throw error
                }
                if (!reuseExistingDatabase) {
                    await deleteSQLiteDatabaseFiles(this.filePath)
                    if (this.closing) return
                }
            }
            this.db = this.createDatabase()
            await this.ensureSchema(!reuseExistingDatabase)
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

    private createDatabase(): Knex {
        return knex({
            client: 'better-sqlite3',
            connection: { filename: this.filePath, charset: 'utf8mb4' },
            useNullAsDefault: true,
            pool: { min: 1, max: 1, afterCreate: sqliteAfterCreate },
        })
    }

    private async destroyDatabaseConnection(): Promise<void> {
        const db = this.db
        this.db = null
        if (db) await db.destroy()
    }

    async close(): Promise<void> {
        this.closing = true
        this.clearProgressTimer()
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
        this.roomIdTokenCache.clear()
        this.senderIdTokenCache.clear()
        try {
            await this.destroyDatabaseConnection()
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
        const match = this.buildMatchQuery(keyword, options)
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

    private async ensureSchema(writeFormat: boolean): Promise<void> {
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
        if (writeFormat) {
            await db('search_state').insert({ key: 'format', value: searchIndexFormat }).onConflict('key').merge()
        }
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

        const validationBatchSize = Math.max(
            searchBatchSize,
            Math.trunc(this.callbacks.validationBatchSize || searchBatchSize),
        )
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
                const loaded = await loadMessageTimeCounts(sourceAfterTime, validationBatchSize)
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
                    .limit(validationBatchSize)
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
        const buildBatchSize = Math.max(searchBatchSize, Math.trunc(this.callbacks.buildBatchSize || searchBatchSize))
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
                        times = await this.callbacks.loadTimes(afterTime, buildBatchSize)
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
        const grouped = new Map<
            number,
            { contents: string[]; roomIds: Set<string>; senderIds: Set<string>; messageCount: number }
        >()
        for (const message of currentMessages) {
            const time = messageTime(message)
            if (time <= 0 || !normalizedTimeSet.has(time)) continue
            const values = grouped.get(time) || {
                contents: [],
                roomIds: new Set<string>(),
                senderIds: new Set<string>(),
                messageCount: 0,
            }
            values.messageCount++
            const content = this.indexContent(message.content)
            if (content) {
                values.contents.push(content)
                const roomId = this.roomIdTokenCache.encode(message.roomId)
                if (roomId) values.roomIds.add(roomId)
                const senderId = this.senderIdTokenCache.encode(message.senderId)
                if (senderId) values.senderIds.add(senderId)
            }
            grouped.set(time, values)
        }
        await db.transaction(async (transaction) => {
            for (let offset = 0; offset < normalizedTimes.length; offset += searchWriteBatchSize) {
                const batchTimes = normalizedTimes.slice(offset, offset + searchWriteBatchSize)
                const batchRows = batchTimes.map((time) => {
                    const value = grouped.get(time)
                    return {
                        time,
                        messageCount: value?.messageCount ?? null,
                        content: value
                            ? [...value.contents, ...value.roomIds, ...value.senderIds].join(messageSeparator)
                            : '',
                    }
                })
                const stateRows = batchRows.filter((row) => row.messageCount !== null)
                const ftsRows = stateRows.filter((row) => row.content)
                const ftsDeleteTimes = removeExisting
                    ? batchRows.filter((row) => !row.content).map(({ time }) => time)
                    : []
                const stateDeleteTimes = batchRows.filter((row) => row.messageCount === null).map(({ time }) => time)

                if (stateRows.length) {
                    await transaction('search_time_state')
                        .insert(
                            stateRows.map(({ time, messageCount }) => ({ time, messageCount: messageCount as number })),
                        )
                        .onConflict('time')
                        .merge()
                }
                if (ftsRows.length) {
                    const placeholders = ftsRows.map(() => '(?, ?)').join(', ')
                    const bindings = ftsRows.flatMap(({ time, content }) => [time, content])
                    await transaction.raw(
                        `INSERT OR REPLACE INTO search_fts(rowid, content) VALUES ${placeholders}`,
                        bindings,
                    )
                }
                if (ftsDeleteTimes.length) {
                    await transaction('search_fts').whereIn('rowid', ftsDeleteTimes).delete()
                }
                if (stateDeleteTimes.length) {
                    await transaction('search_time_state').whereIn('time', stateDeleteTimes).delete()
                }
                if (offset + searchWriteBatchSize < normalizedTimes.length) await yieldToWorkerEventLoop()
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
        if (!this.callbacks.reportProgress) return
        this.pendingProgress = { ...progress }
        if (!progress.active) {
            this.clearProgressTimer()
            this.lastProgressReportAt = Date.now()
            this.emitProgress(progress)
            return
        }

        const elapsed = Date.now() - this.lastProgressReportAt
        if (!this.lastProgressReportAt || elapsed >= searchProgressInterval) {
            this.flushProgress()
            return
        }
        if (!this.progressTimer) {
            this.progressTimer = setTimeout(() => this.flushProgress(), searchProgressInterval - elapsed)
        }
    }

    private clearProgressTimer(): void {
        if (this.progressTimer) clearTimeout(this.progressTimer)
        this.progressTimer = null
        this.pendingProgress = null
    }

    private flushProgress(): void {
        const progress = this.pendingProgress
        this.pendingProgress = null
        this.progressTimer = null
        if (!progress || this.closing) return
        this.lastProgressReportAt = Date.now()
        this.emitProgress(progress)
    }

    private emitProgress(progress: DatabaseUpgradeProgress): void {
        try {
            this.callbacks.reportProgress?.(progress)
        } catch (error) {
            if (!this.closing) this.errorHandle(error)
        }
    }

    private buildMatchQuery(value: unknown, options: SQLiteMessageSearchTimesOptions): string | null {
        const textQuery = encodeSearchQuery(value)
        if (!textQuery) return null
        const clauses = [textQuery]
        if (options.roomId !== undefined) {
            const roomIdQuery = encodeSearchIdentifierQuery(this.roomIdTokenCache, options.roomId)
            if (!roomIdQuery) return null
            clauses.push(roomIdQuery)
        }
        if (options.senderId !== undefined) {
            const senderIdQuery = encodeSearchIdentifierQuery(this.senderIdTokenCache, options.senderId)
            if (!senderIdQuery) return null
            clauses.push(senderIdQuery)
        }
        return clauses.join(' AND ')
    }
}
