import assert from 'node:assert/strict'
import test from 'node:test'
import Message from '@icalingua/types/Message'
import { mergeMessageLists, normalizeMessageList } from './messageOrder'

const message = (_id: string | number, time: number): Message => ({
    _id,
    time,
    username: 'tester',
    content: String(_id),
    files: [],
})

test('message ordering uses time and ID while deduplicating numeric and string IDs', () => {
    const messages = normalizeMessageList([
        message('003', 101),
        message(2, 100),
        message('2', 100),
        message('002', 100),
        message('001', 100),
    ])
    assert.deepEqual(
        messages.map((item) => String(item._id)),
        ['001', '002', '2', '003'],
    )
})

test('ordered message lists merge without disturbing either boundary', () => {
    const current = [message('001', 100), message('003', 100), message('005', 102)]
    const incoming = [message('002', 100), message('004', 101), message('005', 102)]
    assert.deepEqual(
        mergeMessageLists(current, incoming).map((item) => item._id),
        ['001', '002', '003', '004', '005'],
    )
})
