import assert from 'node:assert/strict'
import test from 'node:test'
import { DBWorkerTargetKind } from './DBWorkerProtocol'
import SQLStorageProviderWorker, { DBWorkerClientFactory, DBWorkerClientLike } from './SQLStorageProviderWorker'
import { sqliteMessageSearchSourceMethod, type SQLiteMessageSearchSourceRequest } from './SQLiteMessageSearchSource'

type MethodBehavior = (args: unknown[]) => unknown | Promise<unknown>

class FakeDBWorkerClient implements DBWorkerClientLike {
    readonly calls: string[] = []
    readonly behaviors = new Map<string, MethodBehavior>()
    isClosed = false
    private kind: DBWorkerTargetKind
    private callbacks: Record<string, (...args: any[]) => any> = {}
    private readonly blockedRejects = new Set<(error: Error) => void>()

    constructor(readonly name: string) {}

    async createTarget(
        kind: DBWorkerTargetKind,
        _args: unknown[],
        callbacks: Record<string, (...args: any[]) => any> = {},
    ): Promise<string> {
        this.kind = kind
        this.callbacks = callbacks
        return `${this.name}-target`
    }

    async callTarget<T>(_targetId: string, method: string, args: unknown[] = []): Promise<T> {
        if (this.isClosed) throw new Error(`${this.name} is closed`)
        this.calls.push(method)
        const behavior = this.behaviors.get(method)
        return (behavior ? await behavior(args) : undefined) as T
    }

    async disposeTarget(): Promise<void> {}

    async terminate(): Promise<void> {
        this.isClosed = true
        for (const reject of this.blockedRejects) reject(new Error(`${this.name} terminated`))
        this.blockedRejects.clear()
    }

    block(): Promise<never> {
        return new Promise((_, reject) => this.blockedRejects.add(reject))
    }

    invokeCallback<T>(name: string, ...args: any[]): Promise<T> {
        const callback = this.callbacks[name]
        if (!callback) return Promise.reject(new Error(`Missing callback: ${name}`))
        return Promise.resolve(callback(...args))
    }

    get targetKind(): DBWorkerTargetKind {
        return this.kind
    }
}

const createHarness = () => {
    const clients: FakeDBWorkerClient[] = []
    const factory: DBWorkerClientFactory = (name) => {
        const client = new FakeDBWorkerClient(name)
        clients.push(client)
        return client
    }
    const errors: unknown[] = []
    const provider = new SQLStorageProviderWorker(
        'test',
        'sqlite3',
        { dataPath: '.' },
        (error) => errors.push(error),
        factory,
    )
    const writer = clients.find((client) => client.name.includes('-write-'))
    const searchSource = clients.find((client) => client.name.includes('-fts-source-'))
    const readers = clients.filter((client) => client.name.includes('-read-'))
    assert.ok(writer)
    assert.ok(searchSource)
    assert.equal(readers.length, 2)
    return { provider, writer, searchSource, readers, errors }
}

const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve))

test('a blocked read worker does not receive later reads while the other worker remains responsive', async () => {
    const { provider, readers, errors } = createHarness()
    await provider.connect()
    readers[0].behaviors.set('getRoom', () => readers[0].block())
    readers[1].behaviors.set('getAllRooms', () => [{ roomId: 2 }])
    readers[1].behaviors.set('getUnreadCount', () => 7)

    const blockedRead = provider.getRoom(1)
    await nextTurn()
    assert.deepEqual(await provider.getAllRooms(), [{ roomId: 2 }])
    assert.equal(await provider.getUnreadCount(1), 7)
    assert.deepEqual(readers[0].calls, ['getRoom'])
    assert.deepEqual(readers[1].calls, ['getAllRooms', 'getUnreadCount'])

    await provider.close()
    assert.equal(await blockedRead, null)
    assert.deepEqual(errors, [])
})

test('reads wait for earlier writes and writes stay strictly ordered', async () => {
    const { provider, writer, readers, errors } = createHarness()
    await provider.connect()

    let releaseAddRoom: () => void
    writer.behaviors.set(
        'addRoom',
        () =>
            new Promise<void>((resolve) => {
                releaseAddRoom = resolve
            }),
    )
    readers[0].behaviors.set('getRoom', () => ({ roomId: 1, roomName: 'committed' }))

    const addRoom = provider.addRoom({ roomId: 1 } as any)
    const updateRoom = provider.updateRoom(1, { roomName: 'committed' })
    const getRoom = provider.getRoom(1)
    await nextTurn()
    assert.deepEqual(writer.calls, ['connect', 'addRoom'])
    assert.deepEqual(
        readers.flatMap((reader) => reader.calls),
        [],
    )

    releaseAddRoom()
    await addRoom
    await updateRoom
    assert.equal((await getRoom)?.roomName, 'committed')
    assert.deepEqual(writer.calls, ['connect', 'addRoom', 'updateRoom'])
    assert.deepEqual(readers[0].calls, ['getRoom'])

    await provider.close()
    assert.deepEqual(errors, [])
    assert.equal(writer.targetKind, 'sql')
    assert.ok(readers.every((reader) => reader.targetKind === 'sqlReader'))
})

test('FTS source callbacks use the dedicated read worker', async () => {
    const { provider, writer, searchSource, readers, errors } = createHarness()
    await provider.connect()

    searchSource.behaviors.set(sqliteMessageSearchSourceMethod, ([request]: [SQLiteMessageSearchSourceRequest]) => {
        switch (request.operation) {
            case 'countMessages':
                return 123
            case 'loadTimes':
                return [request.afterTime, request.limit]
            case 'loadMessagesByTimes':
                return request.times
            case 'loadMessageTimeCounts':
                return [{ time: request.afterTime, messageCount: request.limit }]
        }
    })
    writer.behaviors.set('validateMessageSearchIndex', async () => {
        assert.equal(await writer.invokeCallback(sqliteMessageSearchSourceMethod, { operation: 'countMessages' }), 123)
        assert.deepEqual(
            await writer.invokeCallback(sqliteMessageSearchSourceMethod, {
                operation: 'loadTimes',
                afterTime: 10,
                limit: 20,
            }),
            [10, 20],
        )
        assert.deepEqual(
            await writer.invokeCallback(sqliteMessageSearchSourceMethod, {
                operation: 'loadMessagesByTimes',
                times: [30, 40],
            }),
            [30, 40],
        )
        assert.deepEqual(
            await writer.invokeCallback(sqliteMessageSearchSourceMethod, {
                operation: 'loadMessageTimeCounts',
                afterTime: 50,
                limit: 60,
            }),
            [{ time: 50, messageCount: 60 }],
        )
    })

    await provider.validateMessageSearchIndex()
    assert.deepEqual(searchSource.calls, Array(4).fill(sqliteMessageSearchSourceMethod))
    assert.ok(readers.every((reader) => reader.calls.length === 0))
    assert.deepEqual(errors, [])

    await provider.close()
})

test('message search forwards sender and time bounds to a read worker', async () => {
    const { provider, readers, errors } = createHarness()
    await provider.connect()
    readers[0].behaviors.set('searchMessages', (args) => {
        assert.deepEqual(args, [123, 'keyword', 40, 20, '7', 1000, 2000])
        return []
    })

    assert.deepEqual(await provider.searchMessages(123, 'keyword', 40, 20, '7', 1000, 2000), [])
    assert.deepEqual(readers[0].calls, ['searchMessages'])
    assert.deepEqual(errors, [])
    await provider.close()
})

test('foreground database failures reject instead of being converted to empty results', async () => {
    const { provider, writer, readers, errors } = createHarness()
    const connectError = new Error('database unavailable')
    writer.behaviors.set('connect', () => {
        throw connectError
    })

    await assert.rejects(provider.connect(), /database unavailable/)
    assert.deepEqual(errors, [connectError])

    writer.behaviors.delete('connect')
    await provider.connect()
    const readError = new Error('read failed')
    readers[0].behaviors.set('getRoom', ([roomId]) => {
        if (roomId === 1) throw readError
        return { roomId }
    })

    await assert.rejects(provider.getRoom(1), /read failed/)
    assert.deepEqual(await provider.getRoom(2), { roomId: 2 })
    assert.deepEqual(errors, [connectError, readError])

    await provider.close()
})
