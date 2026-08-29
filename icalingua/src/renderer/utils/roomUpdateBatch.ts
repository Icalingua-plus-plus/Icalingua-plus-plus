interface OrderedRoom {
    roomId: number
    utime: number
}

interface RoomUpdateBatchOptions<T extends OrderedRoom> {
    schedule(callback: () => void): number | null
    cancel(handle: number): void
    apply(updates: readonly T[]): void
}

export function mergeRoomUpdatesByUtime<T extends OrderedRoom>(rooms: readonly T[], updates: readonly T[]): T[] {
    const latestUpdates = new Map<number, T>()
    for (const room of updates) {
        latestUpdates.delete(room.roomId)
        latestUpdates.set(room.roomId, room)
    }
    if (!latestUpdates.size) return rooms.slice()

    const remainingRooms = rooms.filter((room) => !latestUpdates.has(room.roomId))
    const orderedUpdates = [...latestUpdates.values()].sort((left, right) => right.utime - left.utime)
    const mergedRooms: T[] = []
    let roomIndex = 0
    let updateIndex = 0

    while (roomIndex < remainingRooms.length && updateIndex < orderedUpdates.length) {
        if (orderedUpdates[updateIndex].utime > remainingRooms[roomIndex].utime) {
            mergedRooms.push(orderedUpdates[updateIndex++])
        } else {
            // Existing rooms stay before newly updated rooms when utime is equal,
            // matching the previous upper-bound insertion behavior.
            mergedRooms.push(remainingRooms[roomIndex++])
        }
    }

    return mergedRooms.concat(remainingRooms.slice(roomIndex), orderedUpdates.slice(updateIndex))
}

export function createRoomUpdateBatch<T extends OrderedRoom>({ schedule, cancel, apply }: RoomUpdateBatchOptions<T>) {
    const pendingUpdates = new Map<number, T>()
    let frame: number | null = null

    const flush = () => {
        frame = null
        if (!pendingUpdates.size) return

        const updates = [...pendingUpdates.values()]
        pendingUpdates.clear()
        apply(updates)
    }

    const queue = (room: T) => {
        // Moving an overwritten key to the end preserves the order of the
        // latest events for rooms with the same utime.
        pendingUpdates.delete(room.roomId)
        pendingUpdates.set(room.roomId, room)
        if (frame !== null) return

        frame = schedule(flush)
        if (frame === null) pendingUpdates.clear()
    }

    const patch = (roomId: number, updater: (room: T) => T) => {
        const room = pendingUpdates.get(roomId)
        if (room) pendingUpdates.set(roomId, updater(room))
    }

    const clear = () => {
        if (frame !== null) cancel(frame)
        frame = null
        pendingUpdates.clear()
    }

    return { queue, patch, clear }
}
