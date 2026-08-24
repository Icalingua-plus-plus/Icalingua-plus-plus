import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import knex, { Knex } from 'knex'
import SQLiteMessageSearchIndex, {
    encodeSearchIdentifierToken,
    SearchIdentifierTokenCache,
    SQLiteSearchMessage,
} from './SQLiteMessageSearchIndex'

const roomIdTokenMarker = '\u0004'
const senderIdTokenMarker = '\u0005'
const tokenHex = (token: string): string => Buffer.from(token).toString('hex')

test('identifier tokens retain the v9 byte format', () => {
    assert.equal(tokenHex(encodeSearchIdentifierToken(roomIdTokenMarker, 0)), '04ee8080ee8080')
    assert.equal(tokenHex(encodeSearchIdentifierToken(roomIdTokenMarker, 1)), '04ee8080ee8082')
    assert.equal(tokenHex(encodeSearchIdentifierToken(roomIdTokenMarker, -1)), '04ee8080ee8081')
    assert.equal(tokenHex(encodeSearchIdentifierToken(senderIdTokenMarker, 4294967295)), '05f3bdac96f4898598')
    assert.equal(tokenHex(encodeSearchIdentifierToken(roomIdTokenMarker, -4294967295)), '04f3bdac96f4898597')
    assert.equal(tokenHex(encodeSearchIdentifierToken(senderIdTokenMarker, 9448725512)), '05f3bfbfb1f48c94a2')
})

test('identifier normalization and markers remain isolated', () => {
    assert.equal(
        encodeSearchIdentifierToken(roomIdTokenMarker, '0001'),
        encodeSearchIdentifierToken(roomIdTokenMarker, 1),
    )
    assert.notEqual(
        encodeSearchIdentifierToken(roomIdTokenMarker, 1),
        encodeSearchIdentifierToken(senderIdTokenMarker, 1),
    )
    assert.equal(encodeSearchIdentifierToken(roomIdTokenMarker, ''), '')
    assert.equal(encodeSearchIdentifierToken(roomIdTokenMarker, '1.5'), '')
})

test('identifier token cache is bounded and clearable', () => {
    const cache = new SearchIdentifierTokenCache(roomIdTokenMarker, 2)
    const first = cache.encode(1)
    assert.equal(cache.size, 1)
    assert.equal(cache.encode(' 1 '), first)
    assert.equal(cache.size, 1)
    assert.equal(cache.encode('01'), first)
    assert.equal(cache.size, 2)
    assert.equal(cache.encode(2), encodeSearchIdentifierToken(roomIdTokenMarker, 2))
    assert.equal(cache.size, 2)
    assert.equal(cache.encode('invalid'), '')
    assert.equal(cache.size, 2)
    cache.clear()
    assert.equal(cache.size, 0)

    assert.throws(() => new SearchIdentifierTokenCache(roomIdTokenMarker, 0), RangeError)
})

const waitUntilReady = async (index: SQLiteMessageSearchIndex): Promise<void> => {
    for (let attempt = 0; attempt < 200; attempt++) {
        if (index.isReady) return
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
    assert.fail('message search index did not become ready')
}

const closeDatabase = async (db: Knex | null): Promise<void> => {
    if (db) await db.destroy().catch(() => undefined)
}

test('an incompatible FTS database is closed, deleted with retries, and rebuilt', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'icalingua-search-version-'))
    const filePath = path.join(directory, 'search.db')
    let legacyDb: Knex | null = knex({
        client: 'better-sqlite3',
        connection: { filename: filePath },
        useNullAsDefault: true,
        pool: {
            min: 1,
            max: 1,
            afterCreate: (connection: any, done: any) => {
                try {
                    connection.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000')
                    done(null, connection)
                } catch (error) {
                    done(error, connection)
                }
            },
        },
    })
    await legacyDb.schema.createTable('search_state', (table) => {
        table.string('key').primary()
        table.text('value').notNullable()
    })
    await legacyDb('search_state').insert({ key: 'format', value: 'legacy-incompatible-format' })
    await legacyDb.schema.createTable('legacy_marker', (table) => table.integer('value'))

    const messages: SQLiteSearchMessage[] = [
        { time: 100, content: 'fresh index content', roomId: -1001, senderId: 2001 },
    ]
    const index = new SQLiteMessageSearchIndex(filePath, {
        loadTimes: async (afterTime, limit) =>
            messages
                .map((message) => Number(message.time))
                .filter((time) => time > afterTime)
                .slice(0, limit),
        loadMessagesByTimes: async (times) => messages.filter((message) => times.includes(Number(message.time))),
        countMessages: async () => messages.length,
    })
    let releaseLegacyDatabase: Promise<void> | null = null
    const releaseTimer = setTimeout(() => {
        const db = legacyDb
        legacyDb = null
        releaseLegacyDatabase = closeDatabase(db)
    }, 350)

    try {
        const startedAt = Date.now()
        await index.open()
        if (releaseLegacyDatabase) await releaseLegacyDatabase
        await waitUntilReady(index)

        if (process.platform === 'win32') assert.ok(Date.now() - startedAt >= 200)
        assert.equal(
            await index.getState('format'),
            'trigram-interleaved-run-length-identifier-none-contentless-delete-v9',
        )
        assert.deepEqual(await index.searchTimes('fresh', { limit: 20 }), [100])

        await index.close()
        const rebuiltDb = knex({
            client: 'better-sqlite3',
            connection: { filename: filePath },
            useNullAsDefault: true,
        })
        try {
            assert.equal(await rebuiltDb.schema.hasTable('legacy_marker'), false)
        } finally {
            await rebuiltDb.destroy()
        }
    } finally {
        clearTimeout(releaseTimer)
        await index.close()
        await closeDatabase(legacyDb)
        if (releaseLegacyDatabase) await releaseLegacyDatabase
        fs.rmSync(directory, { recursive: true, force: true })
    }
})

test('orphaned SQLite sidecar files are deleted before rebuilding a missing FTS database', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'icalingua-search-orphans-'))
    const filePath = path.join(directory, 'search.db')
    const orphanedFiles = [`${filePath}-wal`, `${filePath}-shm`, `${filePath}-journal`]
    for (const orphanedFile of orphanedFiles) fs.writeFileSync(orphanedFile, 'orphaned search database file')

    const messages: SQLiteSearchMessage[] = [
        { time: 200, content: 'rebuilt after orphan cleanup', roomId: -1001, senderId: 2001 },
    ]
    const index = new SQLiteMessageSearchIndex(filePath, {
        loadTimes: async (afterTime, limit) =>
            messages
                .map((message) => Number(message.time))
                .filter((time) => time > afterTime)
                .slice(0, limit),
        loadMessagesByTimes: async (times) => messages.filter((message) => times.includes(Number(message.time))),
        countMessages: async () => messages.length,
    })

    try {
        await index.open()
        await waitUntilReady(index)
        assert.deepEqual(await index.searchTimes('orphan cleanup', { limit: 20 }), [200])
        assert.equal(fs.existsSync(`${filePath}-journal`), false)
    } finally {
        await index.close()
        fs.rmSync(directory, { recursive: true, force: true })
    }
})

test('a current-format database missing a required table is deleted and rebuilt', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'icalingua-search-missing-table-'))
    const filePath = path.join(directory, 'search.db')
    const staleDb = knex({
        client: 'better-sqlite3',
        connection: { filename: filePath },
        useNullAsDefault: true,
    })
    await staleDb.schema.createTable('search_state', (table) => {
        table.string('key').primary()
        table.text('value').notNullable()
    })
    await staleDb('search_state').insert([
        { key: 'format', value: 'trigram-interleaved-run-length-identifier-none-contentless-delete-v9' },
        { key: 'ready', value: '1' },
    ])
    await staleDb.schema.createTable('search_pending_times', (table) => {
        table.integer('time').primary()
        table.integer('needsRebuild').notNullable().defaultTo(0)
        table.string('queueVersion').nullable()
    })
    await staleDb.schema.createTable('search_time_state', (table) => {
        table.integer('time').primary()
        table.integer('messageCount').notNullable().defaultTo(0)
    })
    await staleDb.schema.createTable('stale_marker', (table) => table.integer('value'))
    await staleDb.destroy()

    const messages: SQLiteSearchMessage[] = [
        { time: 300, content: 'rebuilt after missing table', roomId: -1001, senderId: 2001 },
    ]
    const index = new SQLiteMessageSearchIndex(filePath, {
        loadTimes: async (afterTime, limit) =>
            messages
                .map((message) => Number(message.time))
                .filter((time) => time > afterTime)
                .slice(0, limit),
        loadMessagesByTimes: async (times) => messages.filter((message) => times.includes(Number(message.time))),
        countMessages: async () => messages.length,
    })

    try {
        await index.open()
        await waitUntilReady(index)
        assert.deepEqual(await index.searchTimes('missing table', { limit: 20 }), [300])

        await index.close()
        const rebuiltDb = knex({
            client: 'better-sqlite3',
            connection: { filename: filePath },
            useNullAsDefault: true,
        })
        try {
            assert.equal(await rebuiltDb.schema.hasTable('search_fts'), true)
            assert.equal(await rebuiltDb.schema.hasTable('stale_marker'), false)
        } finally {
            await rebuiltDb.destroy()
        }
    } finally {
        await index.close()
        fs.rmSync(directory, { recursive: true, force: true })
    }
})

test('a corrupt SQLite search database is deleted and rebuilt', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'icalingua-search-corrupt-'))
    const filePath = path.join(directory, 'search.db')
    fs.writeFileSync(
        filePath,
        Buffer.concat([Buffer.from('SQLite format 3\0'), Buffer.alloc(4096 - 'SQLite format 3\0'.length, 0x41)]),
    )

    const messages: SQLiteSearchMessage[] = [
        { time: 400, content: 'rebuilt after corrupt database', roomId: -1001, senderId: 2001 },
    ]
    const errors: unknown[] = []
    const index = new SQLiteMessageSearchIndex(
        filePath,
        {
            loadTimes: async (afterTime, limit) =>
                messages
                    .map((message) => Number(message.time))
                    .filter((time) => time > afterTime)
                    .slice(0, limit),
            loadMessagesByTimes: async (times) => messages.filter((message) => times.includes(Number(message.time))),
            countMessages: async () => messages.length,
        },
        (error) => errors.push(error),
    )

    try {
        await index.open()
        await waitUntilReady(index)
        assert.deepEqual(errors, [])
        assert.deepEqual(await index.searchTimes('corrupt database', { limit: 20 }), [400])

        await index.close()
        assert.equal(fs.readFileSync(filePath).subarray(0, 16).toString(), 'SQLite format 3\u0000')
    } finally {
        await index.close()
        fs.rmSync(directory, { recursive: true, force: true })
    }
})

test('roomId and senderId tokens constrain FTS candidates', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'icalingua-search-identifiers-'))
    const messages: SQLiteSearchMessage[] = [
        { time: 100, content: 'needle alpha', roomId: -1001, senderId: 2001 },
        { time: 99, content: 'needle beta', roomId: -1002, senderId: 2002 },
        { time: 98, content: 'needle gamma', roomId: -1001, senderId: 2002 },
        { time: 97, content: 'needle delta', roomId: -10010, senderId: 20020 },
        { time: 96, content: 'needle epsilon', roomId: 2002, senderId: 1001 },
        { time: 95, content: 'needle zeta', roomId: -4294967295, senderId: 4294967295 },
        { time: 94, content: 'needle eta', roomId: -1002, senderId: 2001 },
        { time: 94, content: '', roomId: -1001, senderId: 2002 },
        { time: 93, content: 'needle theta', roomId: -2001, senderId: 3001 },
        { time: 93, content: 'needle iota', roomId: -2002, senderId: 3002 },
    ]
    const index = new SQLiteMessageSearchIndex(path.join(directory, 'search.db'), {
        loadTimes: async (afterTime, limit) =>
            Array.from(new Set(messages.map((message) => Number(message.time))))
                .filter((time) => time > afterTime)
                .sort((left, right) => left - right)
                .slice(0, limit),
        loadMessagesByTimes: async (times) => messages.filter((message) => times.includes(Number(message.time))),
        countMessages: async () => messages.length,
    })

    try {
        await index.open()
        await waitUntilReady(index)

        assert.deepEqual(await index.searchTimes('needle', { roomId: -1001, limit: 20 }), [100, 98])
        assert.deepEqual(await index.searchTimes('needle', { senderId: 2002, limit: 20 }), [99, 98])
        assert.deepEqual(await index.searchTimes('needle', { roomId: -1001, senderId: 2002, limit: 20 }), [98])
        assert.deepEqual(await index.searchTimes('needle', { roomId: -10010, limit: 20 }), [97])
        assert.deepEqual(await index.searchTimes('needle', { senderId: 20020, limit: 20 }), [97])
        assert.deepEqual(await index.searchTimes('needle', { roomId: -4294967295, limit: 20 }), [95])
        assert.deepEqual(await index.searchTimes('needle', { senderId: 4294967295, limit: 20 }), [95])
        assert.deepEqual(await index.searchTimes('needle', { roomId: -2001, limit: 20 }), [93])
        assert.deepEqual(await index.searchTimes('needle', { roomId: -2002, limit: 20 }), [93])
        assert.deepEqual(await index.searchTimes('needle', { senderId: 3001, limit: 20 }), [93])
        assert.deepEqual(await index.searchTimes('needle', { senderId: 3002, limit: 20 }), [93])
    } finally {
        await index.close()
        fs.rmSync(directory, { recursive: true, force: true })
    }
})

test('counts and paginates legacy At timestamp candidates from FTS', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'icalingua-search-legacy-at-'))
    const messages: SQLiteSearchMessage[] = [
        { time: 500, content: '<IcalinguaAt qq=42>Alice%20Chen</IcalinguaAt>', roomId: -1001, senderId: 2001 },
        { time: 499, content: '<IcaAt qq=42>Alice Chen</IcaAt>', roomId: -1001, senderId: 2001 },
    ]
    const index = new SQLiteMessageSearchIndex(path.join(directory, 'search.db'), {
        loadTimes: async (afterTime, limit) =>
            Array.from(new Set(messages.map((message) => Number(message.time))))
                .filter((time) => time > afterTime)
                .sort((left, right) => left - right)
                .slice(0, limit),
        loadMessagesByTimes: async (times) => messages.filter((message) => times.includes(Number(message.time))),
        countMessages: async () => messages.length,
    })

    try {
        await index.open()
        await waitUntilReady(index)
        assert.equal(await index.countTimes('IcalinguaAt'), 1)
        assert.deepEqual(await index.searchTimes('IcalinguaAt', { limit: 20 }), [500])
    } finally {
        await index.close()
        fs.rmSync(directory, { recursive: true, force: true })
    }
})

test('complete time groups reuse syncMessages and fall back after a concurrent FTS sync', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'icalingua-search-snapshot-'))
    const messages: SQLiteSearchMessage[] = [
        { time: 500, content: '<IcalinguaAt qq=42>Alice%20Chen</IcalinguaAt>', roomId: -1001, senderId: 2001 },
        { time: 500, content: 'other room content', roomId: -1002, senderId: 2002 },
        { time: 500, content: '', roomId: -1003, senderId: 2003 },
    ]
    let sourceLoads = 0
    const index = new SQLiteMessageSearchIndex(path.join(directory, 'search.db'), {
        loadTimes: async (afterTime, limit) => (afterTime < 500 ? [500].slice(0, limit) : []),
        loadMessagesByTimes: async (times) => {
            sourceLoads++
            return messages.filter((message) => times.includes(Number(message.time)))
        },
        countMessages: async () => messages.length,
    })

    try {
        await index.open()
        await waitUntilReady(index)
        sourceLoads = 0

        const generation = await index.getSyncGeneration()
        assert.notEqual(generation, null)
        messages[0].content = '<IcaAt qq=42>Alice Chen</IcaAt>'
        await index.syncMessages(messages, generation as number)
        assert.equal(sourceLoads, 0)
        assert.equal(await index.countTimes('IcalinguaAt'), 0)
        assert.equal(await index.countTimes('IcaAt'), 1)
        const timeState = await (index as any).db('search_time_state').where('time', 500).first()
        assert.equal(Number(timeState.messageCount), 3)

        const staleGeneration = await index.getSyncGeneration()
        assert.notEqual(staleGeneration, null)
        const staleCompleteTimeGroup = messages.map((message) => ({ ...message }))
        messages[1].content = 'concurrent fresh content'
        await index.syncMessages([{ time: 500 }])
        const loadsBeforeStaleGroup = sourceLoads
        await index.syncMessages(staleCompleteTimeGroup, staleGeneration as number)

        assert.equal(sourceLoads, loadsBeforeStaleGroup + 1)
        assert.deepEqual(await index.searchTimes('concurrent fresh', { limit: 20 }), [500])
        assert.deepEqual(await index.searchTimes('other room content', { limit: 20 }), [])
    } finally {
        await index.close()
        fs.rmSync(directory, { recursive: true, force: true })
    }
})
