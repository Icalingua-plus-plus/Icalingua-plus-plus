import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import SQLStorageProvider, { MessageSearchIndexFactory } from './SQLStorageProvider'
import { SQLiteSearchMessage, SQLiteMessageSearchTimesOptions } from './SQLiteMessageSearchIndex'

test('does not auto-migrate legacy At messages and supports manual migration', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'icalingua-sql-legacy-at-'))
    let index: {
        isReady: boolean
    } & Record<string, any>
    let searchPage = 0
    const syncedTimes: number[][] = []
    const progresses: Array<{ active: boolean; step: number; total: number; message: string }> = []
    const factory: MessageSearchIndexFactory = (_filePath, _callbacks, _errorHandle) => {
        index = {
            isReady: false,
            async open() {
                this.isReady = true
            },
            async close() {},
            async validate() {},
            async syncMessages(messages: SQLiteSearchMessage[]) {
                syncedTimes.push(messages.map((message) => Number(message.time)))
            },
            async requestRebuild() {},
            async searchTimes(_keyword: string, _options: SQLiteMessageSearchTimesOptions) {
                searchPage++
                return searchPage === 1 ? [100] : []
            },
            async countTimes() {
                return 1
            },
        }
        return index as any
    }

    const provider = new SQLStorageProvider(
        'legacy-at-test',
        'sqlite3',
        { dataPath: directory },
        (error) => {
            throw error
        },
        factory,
    )
    provider.onUpgradeProgress = (progress) => progresses.push(progress)

    try {
        await provider.connect()
        const legacyMessages = Array.from({ length: 600 }, (_, index) => ({
            _id: `legacy-at-message-${String(index).padStart(4, '0')}`,
            time: 100,
            roomId: -1001,
            content: `<IcalinguaAt qq=${42 + index}>Alice%20%26%20Bob</IcalinguaAt>`,
        }))
        for (let offset = 0; offset < legacyMessages.length; offset += 200) {
            await provider.db('messages').insert(legacyMessages.slice(offset, offset + 200))
        }
        const mediaLegacyContent = '<IcalinguaAt qq=9001>Alice%20%26%20Bob</IcalinguaAt> tail'
        await provider.db('messages').insert({
            _id: 'legacy-at-media-message',
            time: 100,
            roomId: -1001,
            content: mediaLegacyContent,
            files: JSON.stringify([{ type: 'image/png', order: mediaLegacyContent.indexOf(' tail') }]),
        })
        assert.equal(await provider.db('dbMetadata').where('name', 'messageAtMarkupVersion').first(), undefined)

        await provider.migrateLegacyAtMessages()
        const metadata = await provider.db('dbMetadata').where('name', 'messageAtMarkupVersion').first()

        const version = await provider.db('dbVersion').first()
        assert.equal(Number(version?.dbVersion), 25)
        assert.equal(metadata?.value, '1')
        const migratedMessageCount = await provider.db('messages').where('time', 100).count({ count: '*' }).first()
        assert.equal(Number(migratedMessageCount?.count), 601)
        const message = await provider.db('messages').where('_id', 'legacy-at-message-0000').first()
        assert.equal(message?.content, '<IcaAt qq=42>Alice &amp; Bob</IcaAt>')
        const lastMessage = await provider.db('messages').where('_id', 'legacy-at-message-0599').first()
        assert.equal(lastMessage?.content, '<IcaAt qq=641>Alice &amp; Bob</IcaAt>')
        const mediaMessage = await provider.db('messages').where('_id', 'legacy-at-media-message').first()
        assert.deepEqual(JSON.parse(mediaMessage?.files), [
            { type: 'image/png', order: '<IcaAt qq=9001>Alice &amp; Bob</IcaAt> tail'.indexOf(' tail') },
        ])
        assert.deepEqual(syncedTimes, [[100]])
        assert.equal(
            progresses.some((progress) => progress.active),
            true,
        )
        assert.equal(progresses.at(-1)?.active, false)
    } finally {
        await provider.close()
        fs.rmSync(directory, { recursive: true, force: true })
    }
})

test('does not rebuild FTS when replacing a message only changes recall metadata', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'icalingua-sql-recall-'))
    const rebuildTimes: number[][] = []
    const factory: MessageSearchIndexFactory = (_filePath, _callbacks, _errorHandle) => {
        const index = {
            isReady: false,
            async open() {
                this.isReady = true
            },
            async close() {},
            async validate() {},
            async syncMessages() {},
            async requestRebuild(times?: number | number[]) {
                if (times === undefined) return
                rebuildTimes.push(Array.isArray(times) ? times : [times])
            },
            async searchTimes() {
                return []
            },
            async countTimes() {
                return 0
            },
        }
        return index as any
    }
    const provider = new SQLStorageProvider(
        'recall-test',
        'sqlite3',
        { dataPath: directory },
        (error) => {
            throw error
        },
        factory,
    )

    try {
        await provider.connect()
        await provider.db('messages').insert({
            _id: 'recalled-message',
            content: 'unchanged content',
            time: 100,
            roomId: -1001,
            senderId: '42',
        })

        await provider.replaceMessage(-1001, 'recalled-message', {
            _id: 'recalled-message',
            content: 'unchanged content',
            time: 100,
            deleted: true,
            reveal: false,
            recallInfo: JSON.stringify({ time: Date.now(), operator_id: '42' }),
        } as any)

        assert.deepEqual(rebuildTimes, [])

        await provider.updateMessage(-1001, 'recalled-message', { content: 'updated content' })
        assert.deepEqual(rebuildTimes, [[100, 100]])
    } finally {
        await provider.close()
        fs.rmSync(directory, { recursive: true, force: true })
    }
})

test('does not wait for FTS synchronization while legacy At migration is active', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'icalingua-sql-legacy-at-write-'))
    let releaseSync: () => void = () => undefined
    let syncStarted = false
    let syncFinished = false
    const syncBlock = new Promise<void>((resolve) => {
        releaseSync = resolve
    })
    const factory: MessageSearchIndexFactory = (_filePath, _callbacks, _errorHandle) => {
        const index = {
            isReady: false,
            async open() {
                this.isReady = true
            },
            async close() {},
            async validate() {},
            async syncMessages() {
                syncStarted = true
                await syncBlock
                syncFinished = true
            },
            async requestRebuild() {},
            async searchTimes() {
                return []
            },
            async countTimes() {
                return 0
            },
        }
        return index as any
    }
    const provider = new SQLStorageProvider(
        'legacy-at-write-test',
        'sqlite3',
        { dataPath: directory },
        (error) => {
            throw error
        },
        factory,
    )

    try {
        await provider.connect()
        ;(provider as any).legacyAtMigrationPromise = Promise.resolve()
        await provider.addMessage(-1001, {
            _id: 'incoming-during-legacy-at-migration',
            time: 100,
            roomId: -1001,
            content: 'message received during migration',
            files: [],
        } as any)
        await new Promise<void>((resolve) => setImmediate(resolve))
        assert.equal(syncStarted, true)
        assert.equal(syncFinished, false)
        assert.ok(await provider.db('messages').where('_id', 'incoming-during-legacy-at-migration').first())

        releaseSync()
        await new Promise<void>((resolve) => setImmediate(resolve))
        assert.equal(syncFinished, true)
    } finally {
        releaseSync()
        await provider.close()
        fs.rmSync(directory, { recursive: true, force: true })
    }
})
