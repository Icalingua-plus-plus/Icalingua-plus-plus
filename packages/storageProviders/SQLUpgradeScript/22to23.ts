import { Knex } from 'knex'
import { DBVersion } from '@icalingua/types/SQLTableTypes'

interface RoomMigrationRow {
    roomId: string
    utime?: unknown
}

const normalizeRoomId = (roomId: unknown): string => {
    const value = String(roomId || 0) || '0'
    return /^-?\d+\.0$/.test(value) ? value.slice(0, -2) : value
}

const roomUtime = (room: RoomMigrationRow): number => {
    const value = Number(room.utime)
    return Number.isFinite(value) ? value : 0
}

const compareRooms = (left: RoomMigrationRow, right: RoomMigrationRow, normalizedRoomId: string): number => {
    const timeDifference = roomUtime(right) - roomUtime(left)
    if (timeDifference !== 0) return timeDifference

    // If timestamps are equal, prefer the already canonical key so that a
    // migration does not unnecessarily replace the existing room row.
    const leftIsCanonical = left.roomId === normalizedRoomId
    const rightIsCanonical = right.roomId === normalizedRoomId
    if (leftIsCanonical !== rightIsCanonical) return leftIsCanonical ? -1 : 1
    return 0
}

const upg22to23 = async (db: Knex) => {
    await db.transaction(async (transaction) => {
        const rooms = await transaction<RoomMigrationRow>('rooms').select('roomId', 'utime')
        const roomGroups = new Map<string, RoomMigrationRow[]>()

        for (const room of rooms) {
            if (room.roomId === null || room.roomId === undefined) continue

            const originalRoomId = String(room.roomId)
            const normalizedRoomId = normalizeRoomId(originalRoomId)
            const group = roomGroups.get(normalizedRoomId) || []
            group.push({
                roomId: originalRoomId,
                utime: room.utime,
            })
            roomGroups.set(normalizedRoomId, group)
        }

        for (const [normalizedRoomId, group] of roomGroups) {
            const winner = [...group].sort((left, right) => compareRooms(left, right, normalizedRoomId))[0]
            for (const room of group) {
                if (room !== winner) {
                    await transaction('rooms').where('roomId', room.roomId).delete()
                }
            }
            if (winner.roomId !== normalizedRoomId) {
                await transaction('rooms').where('roomId', winner.roomId).update({ roomId: normalizedRoomId })
            }
        }

        await transaction<DBVersion>('dbVersion').update({ dbVersion: 23 })
    })
}

export default upg22to23
