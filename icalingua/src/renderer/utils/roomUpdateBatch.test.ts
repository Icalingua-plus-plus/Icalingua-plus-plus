import assert from 'node:assert/strict'
import test from 'node:test'

import { createRoomUpdateBatch, mergeRoomUpdatesByUtime } from './roomUpdateBatch'

interface TestRoom {
    roomId: number
    utime: number
    value: string
    unreadCount: number
    at: boolean
    atMessageId: string | null
}

const room = (roomId: number, utime: number, value = String(roomId)): TestRoom => ({
    roomId,
    utime,
    value,
    unreadCount: 1,
    at: true,
    atMessageId: 'message',
})

test('queues one frame and keeps the latest update for each room', () => {
    const scheduledCallbacks = new Map<number, () => void>()
    const applied: ReadonlyArray<TestRoom>[] = []
    let nextFrame = 1
    const batch = createRoomUpdateBatch<TestRoom>({
        schedule(callback) {
            const frame = nextFrame++
            scheduledCallbacks.set(frame, callback)
            return frame
        },
        cancel(frame) {
            scheduledCallbacks.delete(frame)
        },
        apply(updates) {
            applied.push(updates)
        },
    })

    batch.queue(room(1, 100, 'first'))
    batch.queue(room(2, 100))
    batch.queue(room(1, 100, 'latest'))

    assert.equal(scheduledCallbacks.size, 1)
    scheduledCallbacks.get(1)?.()
    assert.deepEqual(applied, [[room(2, 100), room(1, 100, 'latest')]])
})

test('clear cancels a queued frame and drops its updates', () => {
    const canceledFrames: number[] = []
    let applyCalls = 0
    const batch = createRoomUpdateBatch<TestRoom>({
        schedule: () => 7,
        cancel: (frame) => canceledFrames.push(frame),
        apply: () => applyCalls++,
    })

    batch.queue(room(1, 100))
    batch.clear()

    assert.deepEqual(canceledFrames, [7])
    assert.equal(applyCalls, 0)
})

test('merges a frame of updates while preserving descending utime order', () => {
    const rooms = [room(1, 100), room(2, 90, 'old'), room(3, 90), room(4, 70, 'old')]
    const updates = [room(2, 110, 'new'), room(5, 90), room(4, 60, 'new')]

    assert.deepEqual(mergeRoomUpdatesByUtime(rooms, updates), [
        room(2, 110, 'new'),
        room(1, 100),
        room(3, 90),
        room(5, 90),
        room(4, 60, 'new'),
    ])
})

test('patches only the queued read state and keeps the latest room preview', () => {
    let scheduledCallback: (() => void) | undefined
    const applied: ReadonlyArray<TestRoom>[] = []
    const batch = createRoomUpdateBatch<TestRoom>({
        schedule: (callback) => {
            scheduledCallback = callback
            return 1
        },
        cancel: () => {},
        apply: (updates) => applied.push(updates),
    })

    batch.queue(room(1, 100, 'new preview'))
    batch.queue(room(2, 200, 'keep'))
    batch.patch(1, (pendingRoom) => ({
        ...pendingRoom,
        unreadCount: 0,
        at: false,
        atMessageId: null,
    }))
    scheduledCallback?.()

    assert.deepEqual(applied, [
        [
            {
                ...room(1, 100, 'new preview'),
                unreadCount: 0,
                at: false,
                atMessageId: null,
            },
            room(2, 200, 'keep'),
        ],
    ])
})
