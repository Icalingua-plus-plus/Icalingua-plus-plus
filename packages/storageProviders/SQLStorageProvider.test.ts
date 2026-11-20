import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import Room from '@icalingua/types/Room'
import Message from '@icalingua/types/Message'
import { MessagePagination } from '@icalingua/types/MessagePage'
import SQLStorageProvider, { MessageSearchIndexFactory } from './SQLStorageProvider'
import { SQLiteSearchMessage, SQLiteMessageSearchTimesOptions } from './SQLiteMessageSearchIndex'

test('search cursors preserve equal-time matches and skip newly inserted results above the cursor', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'icalingua-sql-search-cursor-'))
    let indexReady = false
    const searchedMaxTimes: Array<number | undefined> = []
    const searchIndex = {
        get isReady() {
            return indexReady
        },
        async open() {},
        async close() {},
        async requestRebuild() {},
        async searchTimes(_keyword: string, { maxTime, minTime }: SQLiteMessageSearchTimesOptions) {
            searchedMaxTimes.push(maxTime)
            return [190, 180, 150, 100, 90].filter(
                (time) => time <= (maxTime ?? Infinity) && time >= (minTime ?? -Infinity),
            )
        },
    }
    const provider = new SQLStorageProvider(
        'search-cursor-test',
        'sqlite3',
        { dataPath: directory },
        (error) => {
            throw error
        },
        () => searchIndex as ReturnType<MessageSearchIndexFactory>,
    )
    const message = (_id: string, time: number, senderId = 7) => ({
        _id,
        time,
        senderId,
        content: 'needle',
        username: 'sender',
    })

    try {
        await provider.connect()
        await provider.addMessages(-1, [
            message('newest', 180),
            message('outside date range', 90),
            message('different sender', 170, 8),
        ])
        const equalTimeMessages = Array.from({ length: 25 }, (_, i) =>
            message(`tie-${String(i).padStart(2, '0')}`, 150),
        )
        await provider.addMessages(-1, equalTimeMessages.slice(0, 12))
        await provider.addMessages(-2, [...equalTimeMessages.slice(12), message('oldest', 100)])

        const first = await provider.searchMessages(0, 'needle', 0, 20, '7', 100, 200)
        const last = first[first.length - 1]
        const cursor = { time: last.time, id: last._id, roomId: last.roomId, offset: first.length }
        const expected = [
            ...equalTimeMessages
                .slice(0, 6)
                .reverse()
                .map(({ _id }) => _id),
            'oldest',
        ]
        assert.equal(first.length, 20)
        assert.equal(cursor.time, 150)
        const legacySecond = await provider.searchMessages(0, 'needle', 20, 20, '7', 100, 200)
        assert.deepEqual(
            legacySecond.map(({ _id }) => _id),
            expected,
        )

        await provider.addMessage(-1, message('arrived after first page', 190))
        for (const useIndex of [false, true]) {
            indexReady = useIndex
            const second = await provider.searchMessages(0, 'needle', cursor, 20, '7', 100, 200)
            assert.deepEqual(
                second.map(({ _id }) => _id),
                expected,
            )
            assert.deepEqual(
                second.map(({ roomId }) => roomId),
                [-1, -1, -1, -1, -1, -1, -2],
            )
        }
        assert.equal(searchedMaxTimes[0], 150)
        const dateOnly = await provider.searchMessages(0, '', cursor, 20, '7', 100, 200)
        assert.deepEqual(
            dateOnly.map(({ _id }) => _id),
            expected,
        )
    } finally {
        await provider.close()
        fs.rmSync(directory, { recursive: true, force: true })
    }
})

test('search fallback preserves undated legacy rows at the end of a cursor page', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'icalingua-sql-search-undated-'))
    const provider = new SQLStorageProvider(
        'search-undated-test',
        'sqlite3',
        { dataPath: directory },
        (error) => {
            throw error
        },
        () =>
            ({
                open: async () => {},
                close: async () => {},
                requestRebuild: async () => {},
            }) as ReturnType<MessageSearchIndexFactory>,
    )
    const message = (_id: string, time?: number) => ({ _id, time, senderId: 7, content: 'needle', username: 'sender' })
    try {
        await provider.connect()
        await provider.addMessages(-1, [message('newest', 200), message('older', 100), message('zero', 0)])
        await provider.addMessages(-2, [message('undated-1'), message('undated-2')])

        const cursor = { time: 200, id: 'newest', roomId: -1, offset: 1 }
        const page = await provider.searchMessages(0, 'needle', cursor, 3, '7')
        const legacy = await provider.searchMessages(0, 'needle', 1, 3, '7')
        assert.deepEqual(page, legacy)
        assert.deepEqual(
            page.map(({ _id }) => _id),
            ['older', 'zero', 'undated-2'],
        )
        const next = await provider.searchMessages(0, 'needle', 4, 3, '7')
        assert.equal(next[0]._id, 'undated-1')

        const dated = await provider.searchMessages(0, 'needle', cursor, 3, '7', 0)
        assert.deepEqual(
            dated.map(({ _id }) => _id),
            ['older', 'zero'],
        )
    } finally {
        await provider.close()
        fs.rmSync(directory, { recursive: true, force: true })
    }
})

test('filtered histories preserve the full results with cursor and legacy offset pagination', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'icalingua-sql-history-cursor-'))
    const provider = new SQLStorageProvider(
        'history-cursor-test',
        'sqlite3',
        { dataPath: directory },
        (error) => {
            throw error
        },
        () =>
            ({
                open: async () => {},
                close: async () => {},
                requestRebuild: async () => {},
            }) as ReturnType<MessageSearchIndexFactory>,
    )
    const monthEnd = Date.UTC(2026, 10, 1) - 1
    const attachment = { type: 'image/png', url: 'image.png' }
    const message = (_id: string, time?: number, senderId = 7, files = [attachment]): Message => ({
        _id,
        time,
        senderId,
        files,
        content: 'message',
        username: 'sender',
    })

    const readAll = async (
        roomId: number,
        pageSize: number,
        fetch: (page: MessagePagination) => Promise<Message[]>,
        ascending = false,
        useCursor = false,
    ) => {
        let count = 0
        let page: MessagePagination = 0
        const messages: Message[] = []
        for (let i = 0; i < 10; i++) {
            const next = await fetch(page)
            count += next.length
            const oldest = ascending ? next[0] : next[next.length - 1]
            if (ascending) messages.unshift(...next)
            else messages.push(...next)
            if (next.length < pageSize) return messages
            page =
                useCursor && oldest.time
                    ? { time: oldest.time, id: oldest._id, roomId: roomId || oldest.roomId, offset: count }
                    : count
        }
        assert.fail('pagination did not terminate')
    }

    try {
        await provider.connect()
        const ties = (prefix: string) =>
            Array.from({ length: 43 }, (_, i) => message(`${prefix}-${String(i).padStart(2, '0')}`, monthEnd))
        await provider.addMessages(-1, [
            ...ties('group-one'),
            message('after-month', monthEnd + 1),
            message('two-pictures', monthEnd - 1, 7, [attachment, attachment]),
            message('other-sender', monthEnd - 2, 9),
            { ...message('legacy-file-only', monthEnd - 3, 7, []), file: attachment },
            message('undated'),
        ])
        await provider.addMessages(-2, ties('group-two'))
        await provider.addMessages(
            3,
            Array.from({ length: 1100 }, (_, i) => message(`private-${i}`, monthEnd)),
        )

        for (const roomId of [0, -1]) {
            const fetch = (page: MessagePagination) => provider.fetchMessagesBySender(roomId, '7', page, 20, monthEnd)
            const offsetRows = await readAll(roomId, 20, fetch, true)
            const cursorRows = await readAll(roomId, 20, fetch, true, true)
            assert.deepEqual(cursorRows, offsetRows)
            assert.equal(cursorRows.length, roomId === 0 ? 88 : 45)
            assert.equal(new Set(cursorRows.map((row) => row._id)).size, cursorRows.length)
            assert.equal(cursorRows[0]._id, 'legacy-file-only')
            if (roomId === 0) assert.equal(Number(cursorRows[0].roomId), -1)
        }
        const sparse = await provider.fetchMessagesBySender(0, '9', 0, 20, monthEnd)
        assert.deepEqual(
            sparse.map((row) => row._id),
            ['other-sender'],
        )

        for (const endTime of [monthEnd, undefined]) {
            const fetch = (page: MessagePagination) => provider.fetchImageMessages(-1, page, 30, endTime)
            const offsetRows = await readAll(-1, 30, fetch)
            const cursorRows = await readAll(-1, 30, fetch, false, true)
            assert.deepEqual(cursorRows, offsetRows)
            assert.equal(cursorRows.length, endTime === undefined ? 47 : 45)
            assert.equal(cursorRows.find((row) => row._id === 'two-pictures').files.length, 2)
            assert.equal(
                cursorRows.some((row) => row._id === 'legacy-file-only'),
                false,
            )
            assert.equal(
                cursorRows.some((row) => row._id === 'undated'),
                endTime === undefined,
            )
        }
        const cursorAfterMonth = { time: monthEnd + 1, id: 'after-month', roomId: -1, offset: 1 }
        assert.deepEqual(
            await provider.fetchImageMessages(-1, cursorAfterMonth, 30, monthEnd),
            await provider.fetchImageMessages(-1, 0, 30, monthEnd),
        )
    } finally {
        await provider.close()
        fs.rmSync(directory, { recursive: true, force: true })
    }
})

test('synchronizes Bridge snapshots in batches and skips unchanged rows', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'icalingua-sql-bridge-snapshot-'))
    const provider = new SQLStorageProvider(
        'bridge-snapshot-test',
        'sqlite3',
        { dataPath: directory },
        (error) => {
            throw error
        },
        () => ({ open: async () => {}, close: async () => {} }) as ReturnType<MessageSearchIndexFactory>,
    )
    try {
        await provider.connect()
        const rooms = Array.from({ length: 51 }, (_, index) => ({
            roomId: -(index + 1),
            roomName: `群 ${index}`,
            index: 0,
            unreadCount: 1,
            priority: 3,
            utime: index,
            users: [],
            lastMessage: { content: 'last message' },
            _id: 'MongoDB metadata',
        })) as unknown as Room[]
        const chatGroup = { name: 'group', index: 0, rooms: [-1], includeAllPersonal: true }
        await provider.syncBridgeSnapshot({ rooms, chatGroups: [chatGroup] })
        assert.equal((await provider.getAllRooms()).length, rooms.length)
        assert.deepEqual(await provider.getAllChatGroups(), [chatGroup])

        await provider.updateRoom(-1, { downloadPath: 'local path' })
        await provider.db.raw('CREATE TABLE roomUpdates (roomId TEXT)')
        await provider.db.raw(
            'CREATE TRIGGER countRoomUpdates AFTER UPDATE ON rooms BEGIN INSERT INTO roomUpdates VALUES (NEW.roomId); END',
        )
        await provider.syncBridgeSnapshot({ rooms, chatGroups: [chatGroup] })
        assert.deepEqual(await provider.db('roomUpdates'), [])

        await provider.syncBridgeSnapshot({ rooms: [{ ...rooms[0], unreadCount: 0, at: false, atMessageId: null }] })
        const updated = await provider.getRoom(-1)
        assert.equal(updated.unreadCount, 0)
        assert.equal(updated.at, false)
        assert.equal(updated.downloadPath, 'local path')
        assert.deepEqual(await provider.db('roomUpdates'), [{ roomId: '-1' }])
        assert.equal((await provider.getAllRooms()).length, rooms.length)
    } finally {
        await provider.close()
        fs.rmSync(directory, { recursive: true, force: true })
    }
})

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
        assert.equal(Number(version?.dbVersion), 26)
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

test('ordinary SQLite writes only register pending FTS times, including during legacy At migration', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'icalingua-sql-legacy-at-write-'))
    const queued: number[][] = []
    const factory: MessageSearchIndexFactory = (_filePath, _callbacks, _errorHandle) => {
        const index = {
            isReady: false,
            async open() {
                this.isReady = true
            },
            async close() {},
            async validate() {},
            async syncMessages() {
                assert.fail('ordinary writes must use the pending queue')
            },
            async requestRebuild(times: number[]) {
                queued.push(times)
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
        assert.deepEqual(queued, [[100]])
        assert.ok(await provider.db('messages').where('_id', 'incoming-during-legacy-at-migration').first())
    } finally {
        await provider.close()
        fs.rmSync(directory, { recursive: true, force: true })
    }
})
