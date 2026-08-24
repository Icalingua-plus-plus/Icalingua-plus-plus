import assert from 'node:assert/strict'
import test from 'node:test'
import MongoStorageProvider from './MongoStorageProvider'
import RedisStorageProvider from './RedisStorageProvider'

test('Mongo legacy At migration batches room updates with bulkWrite', async () => {
    const provider = Object.create(MongoStorageProvider.prototype) as any
    const bulkWrites: any[] = []
    let projection: any
    const legacyContent = '<IcalinguaAt qq=42>Alice%20%26%20Bob</IcalinguaAt> tail'
    const migratedContent = '<IcaAt qq=42>Alice &amp; Bob</IcaAt> tail'
    provider.searchIndex = { getSyncGeneration: async () => null }
    provider.getSearchRooms = async () => [{ roomId: -1001 }]
    provider.mdb = {
        collection: () => ({
            find: (_query: any, options: any) => {
                projection = options.projection
                return {
                    toArray: async () => [
                        {
                            _id: 'legacy-1',
                            content: legacyContent,
                            files: [{ type: 'image/png', order: legacyContent.indexOf(' tail') }],
                        },
                        { _id: 'new-1', content: '<IcaAt qq=42>Alice &amp; Bob</IcaAt>' },
                    ],
                }
            },
            bulkWrite: async (operations: any[]) => {
                bulkWrites.push(operations)
            },
        }),
    }

    await provider.migrateLegacyAtBatch([100])

    assert.equal(bulkWrites.length, 1)
    assert.equal(projection.file, 1)
    assert.equal(projection.files, 1)
    assert.deepEqual(bulkWrites[0], [
        {
            updateOne: {
                filter: { _id: 'legacy-1', content: legacyContent },
                update: {
                    $set: {
                        content: migratedContent,
                        files: [{ type: 'image/png', order: migratedContent.indexOf(' tail') }],
                    },
                },
            },
        },
    ])
})

test('Redis legacy At migration batches hash updates in one pipeline', async () => {
    const provider = Object.create(RedisStorageProvider.prototype) as any
    const commands: any[] = []
    const legacyContent = '<IcalinguaAt qq=42>Alice%20%26%20Bob</IcalinguaAt> tail'
    const migratedContent = '<IcaAt qq=42>Alice &amp; Bob</IcaAt> tail'
    provider.qid = 'eqq:test'
    provider.searchIndex = { getSyncGeneration: async () => null }
    provider.getSearchRooms = async () => [{ roomId: -1001 }]
    provider.getMessagesBySearchTimes = async () => [
        {
            _id: 'legacy-1',
            content: legacyContent,
            files: [{ type: 'image/png', order: legacyContent.indexOf(' tail') }],
        },
        { _id: 'new-1', content: '<IcaAt qq=42>Alice &amp; Bob</IcaAt>' },
    ]
    provider.redis = {
        pipeline: () => ({
            hset: (...args: any[]) => {
                commands.push(args)
                return provider.redis.pipeline()
            },
            exec: async () => [],
        }),
    }

    await provider.migrateLegacyAtBatch([100])

    assert.deepEqual(commands, [
        [
            'eqq:test:msg-1001:messages',
            'legacy-1',
            JSON.stringify({
                _id: 'legacy-1',
                content: migratedContent,
                files: [{ type: 'image/png', order: migratedContent.indexOf(' tail') }],
            }),
        ],
    ])
})

test('Mongo legacy At migration loads each room once and reuses syncMessages', async () => {
    const provider = Object.create(MongoStorageProvider.prototype) as any
    const collectionReads: string[] = []
    const syncs: any[] = []
    provider.getSearchRooms = async () => [{ roomId: -1001 }, { roomId: -1002 }]
    provider.searchIndex = {
        getSyncGeneration: async () => 7,
        syncMessages: async (messages: any[], generation: number) => {
            syncs.push({ messages, generation })
        },
    }
    provider.mdb = {
        collection: (name: string) => ({
            find: () => ({
                toArray: async () => {
                    collectionReads.push(name)
                    return name === 'msg-1001'
                        ? [
                              {
                                  _id: 'legacy-1',
                                  time: 100,
                                  senderId: 42,
                                  content: '<IcalinguaAt qq=42>Alice%20%26%20Bob</IcalinguaAt>',
                              },
                          ]
                        : []
                },
            }),
            bulkWrite: async () => ({ modifiedCount: 1 }),
        }),
    }

    const synchronized = await provider.migrateLegacyAtBatch([100])

    assert.equal(synchronized, true)
    assert.deepEqual(collectionReads.sort(), ['msg-1001', 'msg-1002'])
    assert.equal(syncs.length, 1)
    assert.equal(syncs[0].generation, 7)
    assert.deepEqual(syncs[0].messages, [
        {
            time: 100,
            content: '<IcaAt qq=42>Alice &amp; Bob</IcaAt>',
            roomId: -1001,
            senderId: 42,
        },
    ])
})

test('Redis legacy At migration uses bounded shared loads and reuses syncMessages', async () => {
    const provider = Object.create(RedisStorageProvider.prototype) as any
    const roomReads: Array<{ roomId: number; times: number[] }> = []
    const syncs: any[] = []
    const commands: any[] = []
    provider.qid = 'eqq:test'
    provider.getSearchRooms = async () => [{ roomId: -1001 }, { roomId: -1002 }]
    provider.searchIndex = {
        getSyncGeneration: async () => 7,
        syncMessages: async (messages: any[], generation: number) => {
            syncs.push({ messages, generation })
        },
    }
    provider.getMessagesBySearchTimes = async (roomId: number, times: number[]) => {
        roomReads.push({ roomId, times })
        return roomId === -1001
            ? [
                  {
                      _id: 'legacy-1',
                      time: 100,
                      senderId: 42,
                      content: '<IcalinguaAt qq=42>Alice%20%26%20Bob</IcalinguaAt>',
                  },
              ]
            : []
    }
    provider.redis = {
        pipeline: () => ({
            hset: (...args: any[]) => commands.push(args),
            exec: async () => [],
        }),
    }

    const synchronized = await provider.migrateLegacyAtBatch([100])

    assert.equal(synchronized, true)
    assert.deepEqual(roomReads, [
        { roomId: -1001, times: [100] },
        { roomId: -1002, times: [100] },
    ])
    assert.equal(commands.length, 1)
    assert.equal(syncs.length, 1)
    assert.equal(syncs[0].generation, 7)
    assert.deepEqual(syncs[0].messages, [
        {
            time: 100,
            content: '<IcaAt qq=42>Alice &amp; Bob</IcaAt>',
            roomId: -1001,
            senderId: 42,
        },
    ])
})
