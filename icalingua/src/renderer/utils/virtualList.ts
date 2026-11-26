export function buildVirtualListOffsets<T>(items: T[], getHeight: (item: T, index: number) => number): number[] {
    const offsets = [0]
    for (let index = 0; index < items.length; index++) {
        const height = getHeight(items[index], index)
        offsets.push(offsets[index] + (Number.isFinite(height) && height > 0 ? height : 1))
    }
    return offsets
}

// Find the row containing a position without scanning the preceding rows.
export function findVirtualListIndex(offsets: number[], position: number): number {
    let low = 0
    let high = Math.max(0, offsets.length - 2)
    while (low < high) {
        const middle = Math.ceil((low + high) / 2)
        if (offsets[middle] <= position) low = middle
        else high = middle - 1
    }
    return low
}

export function getVirtualListRange(offsets: number[], scrollTop: number, viewportHeight: number, overscan = 5) {
    const count = offsets.length - 1
    if (count <= 0 || viewportHeight <= 0) return { start: 0, end: 0 }
    const top = Math.max(0, Math.min(scrollTop, Math.max(0, offsets[count] - viewportHeight)))
    return {
        start: Math.max(0, findVirtualListIndex(offsets, top) - overscan),
        end: Math.min(count, findVirtualListIndex(offsets, top + viewportHeight) + 1 + overscan),
    }
}
