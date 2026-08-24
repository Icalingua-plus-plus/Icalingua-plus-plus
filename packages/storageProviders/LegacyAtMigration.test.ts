import assert from 'node:assert/strict'
import test from 'node:test'
import {
    containsLegacyAtContent,
    migrateLegacyAtContent,
    runLegacyAtMigration,
    tryMigrateLegacyAtMessage,
    tryMigrateLegacyAtContent,
} from './LegacyAtMigration'

test('migrates URI-encoded legacy At markup into XML-escaped IcaAt markup', () => {
    assert.equal(
        migrateLegacyAtContent('before <IcalinguaAt qq=42>Alice%20%26%20Bob</IcalinguaAt> after'),
        'before <IcaAt qq=42>Alice &amp; Bob</IcaAt> after',
    )
    assert.equal(migrateLegacyAtContent('<IcalinguaAt qq=1>%E0%A4</IcalinguaAt>'), '<IcaAt qq=1>%E0%A4</IcaAt>')
    assert.equal(containsLegacyAtContent('<IcalinguaAt qq=42>Alice%20Chen</IcalinguaAt>'), true)
    assert.equal(containsLegacyAtContent('<IcaAt qq=42>Alice Chen</IcaAt>'), false)
})

test('converts malformed old URI content without throwing', () => {
    assert.equal(
        migrateLegacyAtContent('<IcalinguaAt qq=42>Alice%E0%A4%26&lt;</IcalinguaAt>'),
        '<IcaAt qq=42>Alice%E0%A4%26&amp;lt;</IcaAt>',
    )
    assert.equal(
        tryMigrateLegacyAtContent({
            toString: () => {
                throw new Error('bad value')
            },
        }),
        null,
    )
})

test('keeps ordered media offsets aligned after legacy At replacement', () => {
    const legacyMarkup = '<IcalinguaAt qq=42>Alice%20%26%20Bob</IcalinguaAt>'
    const source = `before ${legacyMarkup} after`
    const migrated = tryMigrateLegacyAtMessage({
        content: source,
        file: { order: source.indexOf(' after') },
        files: [{ order: source.indexOf(legacyMarkup) }, { order: source.indexOf(' after') }],
    })

    assert.ok(migrated)
    assert.equal(migrated.content, 'before <IcaAt qq=42>Alice &amp; Bob</IcaAt> after')
    assert.equal((migrated.file as { order: number }).order, migrated.content.indexOf(' after'))
    assert.deepEqual(
        (migrated.files as Array<{ order: number }>).map((file) => file.order),
        [source.indexOf(legacyMarkup), migrated.content.indexOf(' after')],
    )
    assert.equal(migrated.mediaChanged, true)
})

test('keeps media items without order metadata unchanged while shifting ordered items', () => {
    const legacyMarkup = '<IcalinguaAt qq=42>Alice%20%26%20Bob</IcalinguaAt>'
    const source = `${legacyMarkup} tail`
    const files = [{ name: 'ordered-image.png', order: source.indexOf(' tail') }, { name: 'old-image.png' }]
    const migrated = tryMigrateLegacyAtMessage({ content: source, files })

    assert.ok(migrated)
    assert.equal(migrated.mediaChanged, true)
    assert.deepEqual(migrated.files, [
        { name: 'ordered-image.png', order: migrated.content.indexOf(' tail') },
        { name: 'old-image.png' },
    ])
    assert.strictEqual((migrated.files as Array<{ name: string }>)[1], files[1])
})

test('does not mark migration complete when FTS becomes unavailable', async () => {
    let marked = false
    const progress: boolean[] = []
    await runLegacyAtMigration({
        searchIndex: {
            async countTimes() {
                return 1
            },
            async searchTimes() {
                return null
            },
            async syncMessages() {},
        },
        isClosed: () => false,
        hasCompleted: async () => false,
        migrateBatch: async () => undefined,
        markCompleted: async () => {
            marked = true
        },
        reportProgress: (value) => progress.push(value.active),
    })
    assert.equal(marked, false)
    assert.deepEqual(progress, [true, false])
})

test('does not reload FTS when the provider synchronized the migrated batch', async () => {
    let searchPage = 0
    let syncCalls = 0
    let marked = false
    await runLegacyAtMigration({
        searchIndex: {
            async countTimes() {
                return 1
            },
            async searchTimes() {
                searchPage++
                return searchPage === 1 ? [100] : []
            },
            async syncMessages() {
                syncCalls++
            },
        },
        isClosed: () => false,
        hasCompleted: async () => false,
        migrateBatch: async () => true,
        markCompleted: async () => {
            marked = true
        },
        reportProgress: () => undefined,
    })

    assert.equal(syncCalls, 0)
    assert.equal(marked, true)
})
