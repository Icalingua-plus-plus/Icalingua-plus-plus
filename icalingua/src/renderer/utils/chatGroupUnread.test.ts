import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldCountChatGroupUnread } from './chatGroupUnread'

test('关闭 @全体统计时不提升低优先级会话', () => {
    assert.equal(shouldCountChatGroupUnread({ unreadCount: 1, priority: 2, at: 'all' }, 3, false), false)
})

test('关闭 @全体统计时仍提升 @自己的低优先级会话', () => {
    assert.equal(shouldCountChatGroupUnread({ unreadCount: 1, priority: 2, at: true }, 3, false), true)
})

test('关闭 @全体统计时仍统计达到通知优先级的会话', () => {
    assert.equal(shouldCountChatGroupUnread({ unreadCount: 1, priority: 3, at: 'all' }, 3, false), true)
})

test('开启 @全体统计时提升低优先级会话', () => {
    assert.equal(shouldCountChatGroupUnread({ unreadCount: 1, priority: 2, at: 'all' }, 3, true), true)
})
