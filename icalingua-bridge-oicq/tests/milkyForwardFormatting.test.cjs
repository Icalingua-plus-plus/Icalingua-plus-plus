const assert = require('node:assert/strict')

const { milkyToOicqSegment } = require('../utils/milkySegmentConverter')
const createProcessMessage = require('../utils/processMessage').default

async function run() {
    const segment = {
        type: 'forward',
        data: {
            forward_id: 'res-123',
            title: 'Group forward title',
            preview: ['Alice: hello', 'Bob: world'],
            summary: 'View 2 forwarded messages',
            prompt: '[Custom forward]',
        },
    }
    const elem = milkyToOicqSegment(segment)
    const payload = JSON.parse(elem.data.data)

    assert.equal(payload.prompt, '[Custom forward]')
    assert.equal(payload.desc, '[Custom forward]')
    assert.equal(payload.meta.detail.source, 'Group forward title')
    assert.deepEqual(payload.meta.detail.news, [{ text: 'Alice: hello' }, { text: 'Bob: world' }])
    assert.equal(payload.meta.detail.summary, 'View 2 forwarded messages')

    const processMessage = createProcessMessage({})
    const message = {
        content: '',
        files: [],
    }
    const lastMessage = {
        content: '',
    }

    await processMessage([elem], message, lastMessage)

    assert.equal(lastMessage.content, '[Custom forward]')
    assert.equal(message.content, 'Group forward title\nAlice: hello\nBob: world\n[Forward: res-123]')
}

run().catch((error) => {
    console.error(error)
    process.exit(1)
})
