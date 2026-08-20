import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
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
