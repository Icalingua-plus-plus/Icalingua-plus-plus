const assert = require('node:assert/strict')

const { milkyToOicqSegment } = require('../utils/milkySegmentConverter')
const createProcessMessage = require('../utils/processMessage').default
const {
    parseForwardCard,
    stripForwardPreview,
} = require('../../icalingua/src/renderer/components/vac-mod/utils/forwardMessage')

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

    assert.equal(lastMessage.content, '[Forward multiple messages]')
    assert.equal(message.content, '[Forward: res-123]')
    assert.equal(message.code, elem.data.data)
    const card = parseForwardCard(message.code)
    assert.deepEqual(card, {
        title: 'Group forward title',
        messages: ['Alice: hello', 'Bob: world'],
        footer: 'View 2 forwarded messages',
    })
    assert.equal(stripForwardPreview(message.content, card), '[Forward: res-123]')

    // Direct JSON cards use the same parser as Milky-converted forward segments.
    for (const [resource, marker] of [
        [{ resid: 'json-res-123' }, '[Forward: json-res-123]'],
        [{ uniseq: 'nested-file' }, '[NestedForward: nested-file]'],
    ]) {
        const code = JSON.stringify({
            app: 'com.tencent.multimsg',
            desc: '[Custom description]',
            meta: {
                detail: {
                    ...resource,
                    title: 'JSON forward title',
                    news: [{ text: 'Alice: hello' }, { text: '[聊天记录]' }],
                    summary: 'View 2 forwarded messages',
                },
            },
        })
        const forwarded = { content: '', files: [] }
        const lastForwarded = { content: 'Previous text' }
        await processMessage([{ type: 'json', data: { data: code } }], forwarded, lastForwarded)

        assert.equal(lastForwarded.content, 'Previous text[Forward multiple messages]')
        assert.equal(forwarded.content, marker)
        assert.equal(forwarded.code, code)
        assert.deepEqual(parseForwardCard(forwarded.code), {
            title: 'JSON forward title',
            messages: ['Alice: hello', '[聊天记录]'],
            footer: 'View 2 forwarded messages',
        })
        assert.equal(stripForwardPreview(forwarded.content, parseForwardCard(forwarded.code)), marker)
    }
}

run().catch((error) => {
    console.error(error)
    process.exit(1)
})
