import assert from 'node:assert/strict'
import test from 'node:test'

import { createRoomUpdateBatch, mergeRoomUpdatesByUtime } from './roomUpdateBatch'

interface TestRoom {
    roomId: number
    utime: number
    value: string
}

const room = (roomId: number, utime: number, value = String(roomId)): TestRoom => ({ roomId, utime, value })

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
