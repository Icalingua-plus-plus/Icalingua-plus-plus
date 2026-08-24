import assert from 'node:assert/strict'
import test from 'node:test'

import {
    createForwardOpenEvent,
    parseForwardCard,
    parseForwardPreview,
    parseForwardResource,
    stripForwardPreview,
} from './forwardMessage'
import { formatMessageParts, padFaceId, parseMessageText } from './messageFormatting'
import { convertLegacyIcalinguaAt, encodeIcalinguaAt } from '../../../../utils/icalinguaAt'

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
    const parts = formatMessageParts('<IcaAt qq=42>Alice Chen</IcaAt>\n')

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

test('leaves legacy IcalinguaAt markers unchanged by default', () => {
    const legacy = 'reply: <IcalinguaAt qq=42>Alice%20%26%20Bob</IcalinguaAt>'
    assert.deepEqual(formatMessageParts(legacy), [{ value: legacy }])
})

test('renders legacy IcalinguaAt markers when compatibility is enabled', () => {
    assert.deepEqual(
        formatMessageParts('reply: <IcalinguaAt qq=42>Alice%20%26%20Bob</IcalinguaAt>', {
            legacyAtCompat: true,
        }),
        [
            { value: 'reply: ' },
            {
                href: 'icalingua://at?name=Alice%20%26%20Bob&qq=42',
                title: 'Alice & Bob(42)',
                type: 'at',
                value: 'Alice & Bob',
            },
        ],
    )
})

test('uses XML escaping for new @ markers', () => {
    assert.equal(
        encodeIcalinguaAt(42, `A&B <C> "D" 'E'`),
        '<IcaAt qq=42>A&amp;B &lt;C&gt; &quot;D&quot; &apos;E&apos;</IcaAt>',
    )
    assert.deepEqual(formatMessageParts('<IcaAt qq=42>A&amp;B &lt;C&gt; &quot;D&quot; &apos;E&apos;</IcaAt>'), [
        {
            href: "icalingua://at?name=A%26B%20%3CC%3E%20%22D%22%20'E'&qq=42",
            title: 'A&B <C> "D" \'E\'(42)',
            type: 'at',
            value: `A&B <C> "D" 'E'`,
        },
    ])
})

test('converts legacy @ markers to the current format and reports offsets', () => {
    const legacy = '<IcalinguaAt qq=42>Alice%20%26%20Bob</IcalinguaAt>'
    const legacy2 = '<IcalinguaAt qq=7>Bob%2EChen</IcalinguaAt>'
    const converted = encodeIcalinguaAt(42, 'Alice & Bob')
    const converted2 = encodeIcalinguaAt(7, 'Bob.Chen')
    const replacements: Array<[number, number, number]> = []

    assert.equal(
        convertLegacyIcalinguaAt(`x${legacy}m${legacy2}y`, (index, replacedLength, replacementLength) => {
            replacements.push([index, replacedLength, replacementLength])
        }),
        `x${converted}m${converted2}y`,
    )
    assert.deepEqual(replacements, [
        [1, legacy.length, converted.length],
        [converted.length + 2, legacy2.length, converted2.length],
    ])
})

test('downgrades QLottie and applies spacing only to plain text', () => {
    assert.deepEqual(formatMessageParts('[QLottie: 7,123]', { disableQLottie: true }), [{ type: 'face', value: '123' }])
    assert.deepEqual(formatMessageParts('[QLottie: 7,123,9]', { disableQLottie: true }), [
        { type: 'face', value: '123' },
    ])

    assert.equal(formatMessageParts('中文ABC', { usePanguJs: true })[0].value, '中文 ABC')
    assert.equal(
        formatMessageParts('<IcaAt qq=invalid>中文ABC</IcaAt>', { usePanguJs: true })[0].value,
        '<IcaAt qq=invalid>中文ABC</IcaAt>',
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
    assert.doesNotThrow(() => formatMessageParts('<IcaAt qq=42>%E0%A4</IcaAt>'))
})

test('handles newline-heavy messages without recursion', () => {
    const lineCount = 10_000
    const message = Array(lineCount).fill('line').join('\n')
    assert.equal(parseMessageText(message, false).length, lineCount * 2 - 1)
})

test('handles forwarded-message resource IDs and JSON previews', () => {
    const code =
        '{"prompt":"[Chat record]","meta":{"detail":{"source":"Group chat","news":[{"text":"First"},{"text":"Second"}]}}}'

    assert.deepEqual(parseForwardResource('["a","b"]'), { messages: ['a', 'b'] })
    assert.deepEqual(parseForwardResource('{"id":"a"}'), {})
    const resourceCode = '{"meta":{"detail":{"resid":"code-resid","uniseq":"file-1"}}}'
    assert.deepEqual(parseForwardResource(resourceCode), { resId: 'code-resid', fileName: 'file-1' })
    assert.deepEqual(parseForwardResource('<msg m_resid="xml-resid" m_fileName="file-2" />'), {
        resId: 'xml-resid',
        fileName: 'file-2',
    })
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

test('opens nested forwarded-message cards with their own resource ID', () => {
    assert.deepEqual(createForwardOpenEvent('forward', 'inner-id', { resId: 'inner-id' }, 'outer-id'), {
        resId: 'inner-id',
    })
    assert.deepEqual(
        createForwardOpenEvent('forward', 'inner-id', { resId: 'fallback-id', fileName: 'nested-file' }, 'outer-id'),
        {
            resId: 'outer-id',
            fileName: 'nested-file',
            fallbackResId: 'fallback-id',
        },
    )
})
