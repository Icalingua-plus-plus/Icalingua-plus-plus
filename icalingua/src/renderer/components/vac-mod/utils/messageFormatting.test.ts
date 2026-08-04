import assert from 'node:assert/strict'
import test from 'node:test'

import { parseForwardCard, parseForwardPreview, resolveForwardResource, stripForwardPreview } from './forwardMessage'
import { formatMessageParts, padFaceId, parseMessageText } from './messageFormatting'

test('parses message tokens and preserves line breaks', () => {
    assert.deepEqual(parseMessageText('hello\n[Face: 12]\n[Forward: resource]'), [
        { value: 'hello' },
        { type: 'breakLine', value: '' },
        { type: 'face', value: '12' },
        { type: 'breakLine', value: '' },
        { type: 'forward', value: 'resource' },
    ])
    assert.deepEqual(parseMessageText('a\n\nb'), [
        { value: 'a' },
        { type: 'breakLine', value: '' },
        { type: 'breakLine', value: '' },
        { value: 'b' },
    ])
    assert.deepEqual(parseMessageText('[NestedForward: nested.json]'), [
        { type: 'nestedforward', value: 'nested.json' },
    ])
})

test('linkifies every URL without swallowing surrounding text', () => {
    assert.deepEqual(parseMessageText('中文https://a.com测试 https://b.com'), [
        { value: '中文' },
        { href: 'https://a.com', type: 'url', value: 'https://a.com' },
        { value: '测试 ' },
        { href: 'https://b.com', type: 'url', value: 'https://b.com' },
    ])
    assert.deepEqual(parseMessageText('https://example.com', false), [{ value: 'https://example.com' }])
    assert.deepEqual(parseMessageText('icalingua://at?qq=42'), [
        {
            href: 'icalingua://at?qq=42',
            type: 'url',
            value: 'icalingua://at?qq=42',
        },
    ])
})

test('formats @ mentions and keeps trailing empty lines visible', () => {
    const parts = formatMessageParts('<IcalinguaAt qq=42>Alice%20Chen</IcalinguaAt>\n')

    assert.deepEqual(parts, [
        {
            href: 'icalingua://at?name=Alice%20Chen&qq=42',
            title: 'Alice Chen(42)',
            type: 'at',
            value: 'Alice Chen',
        },
        { type: 'breakLine', value: '' },
        { type: 'breakLine', value: '' },
    ])
})

test('downgrades QLottie and applies spacing only to plain text', () => {
    assert.deepEqual(formatMessageParts('[QLottie: 7,123]', { disableQLottie: true }), [{ type: 'face', value: '123' }])
    assert.deepEqual(formatMessageParts('[QLottie: 7,123,9]', { disableQLottie: true }), [
        { type: 'face', value: '123' },
    ])

    assert.equal(formatMessageParts('中文ABC', { usePanguJs: true })[0].value, '中文 ABC')
    assert.equal(
        formatMessageParts('<IcalinguaAt qq=invalid>中文ABC</IcalinguaAt>', { usePanguJs: true })[0].value,
        '<IcalinguaAt qq=invalid>中文ABC</IcalinguaAt>',
    )
})

test('pads face identifiers', () => {
    assert.equal(padFaceId(7), '007')
    assert.equal(padFaceId(1234), '1234')
})

test('keeps malformed formatting markers readable', () => {
    assert.deepEqual(formatMessageParts('[Face: invalid]'), [{ value: '[Face: invalid]' }])
    assert.deepEqual(parseMessageText('[Face: invalid] [Face: 12]'), [
        { value: '[Face: invalid] ' },
        { type: 'face', value: '12' },
    ])
    assert.doesNotThrow(() => formatMessageParts('<IcalinguaAt qq=42>%E0%A4</IcalinguaAt>'))
})

test('handles newline-heavy messages without recursion', () => {
    const lineCount = 10_000
    const message = Array(lineCount).fill('line').join('\n')
    assert.equal(parseMessageText(message, false).length, lineCount * 2 - 1)
})

test('handles forwarded-message resource IDs and JSON previews', () => {
    const code =
        '{"prompt":"[Chat record]","meta":{"detail":{"source":"Group chat","news":[{"text":"First"},{"text":"Second"}]}}}'

    assert.deepEqual(resolveForwardResource('["a","b"]', 'fallback'), ['a', 'b'])
    assert.equal(resolveForwardResource('{"id":"a"}', 'fallback'), 'fallback')
    assert.equal(parseForwardPreview(code), 'Group chat\nFirst\nSecond\n')
    assert.deepEqual(parseForwardCard(code), {
        title: 'Group chat',
        messages: ['First', 'Second'],
        footer: 'Chat record',
    })
    assert.equal(
        stripForwardPreview(`Group chat\nFirst\nSecond\n[Forward: res-123]`, parseForwardCard(code)),
        '[Forward: res-123]',
    )
    assert.equal(stripForwardPreview('[Forward: res-123]', parseForwardCard(undefined)), '[Forward: res-123]')
    assert.deepEqual(
        parseForwardCard(
            '<msg action="viewMultiMsg" brief="[Chat record]"><item><title>Group chat</title><title>Alice: hello</title><title>Bob: world</title><summary>View 2 forwarded messages</summary></item></msg>',
        ),
        {
            title: 'Group chat',
            messages: ['Alice: hello', 'Bob: world'],
            footer: 'View 2 forwarded messages',
        },
    )
    assert.equal(
        parseForwardCard('{"prompt":"[Chat record]","meta":{"detail":{"summary":"View 2 forwarded messages"}}}').footer,
        'View 2 forwarded messages',
    )
    assert.equal(
        parseForwardPreview('{"meta":{"detail":{"news":[{},{"text":"Only valid text"}]}}}'),
        'Only valid text\n',
    )
    assert.equal(
        parseForwardPreview('<msg><title>First</title><title><![CDATA[Second]]></title></msg>'),
        'First\nSecond\n',
    )
})
