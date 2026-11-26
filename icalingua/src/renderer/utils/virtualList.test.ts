import assert from 'node:assert/strict'
import test from 'node:test'
import { buildVirtualListOffsets, findVirtualListIndex, getVirtualListRange } from './virtualList'

test('mixed header and contact heights map positions to the correct rows', () => {
    const offsets = buildVirtualListOffsets([49, 71, 71, 49, 71], (height) => height)
    assert.deepEqual(offsets, [0, 49, 120, 191, 240, 311])
    assert.equal(findVirtualListIndex(offsets, 48.5), 0)
    assert.equal(findVirtualListIndex(offsets, 49), 1)
    assert.equal(findVirtualListIndex(offsets, 120), 2)
    assert.equal(findVirtualListIndex(offsets, 999), 4)
    assert.deepEqual(getVirtualListRange(offsets, 49, 100, 0), { start: 1, end: 3 })
})

test('large lists render a bounded range at the beginning, middle and end', () => {
    const offsets = buildVirtualListOffsets(Array(10000).fill(71), (height) => height)
    for (const top of [0, 300000, 709500]) {
        const range = getVirtualListRange(offsets, top, 500)
        assert.ok(range.end - range.start <= 19)
        assert.ok(offsets[range.start] <= top)
        assert.ok(offsets[range.end] >= Math.min(top + 500, offsets[10000]))
    }
    assert.equal(getVirtualListRange(offsets, 710000, 500).end, 10000)
})

test('empty, hidden and filtered lists never produce an invalid range', () => {
    assert.deepEqual(getVirtualListRange([0], 0, 500), { start: 0, end: 0 })
    assert.deepEqual(getVirtualListRange([0, 71], 0, 0), { start: 0, end: 0 })
    assert.deepEqual(getVirtualListRange([0, 71], 300000, 500), { start: 0, end: 1 })
    assert.deepEqual(getVirtualListRange([0, 71], -100, 500), { start: 0, end: 1 })
})

test('invalid estimates cannot make the layout non-monotonic', () => {
    assert.deepEqual(
        buildVirtualListOffsets([0, -1, NaN, Infinity, 71], (height) => height),
        [0, 1, 2, 3, 4, 75],
    )
})
