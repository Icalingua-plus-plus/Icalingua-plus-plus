import { Knex } from 'knex'
import { DBVersion } from '@icalingua/types/SQLTableTypes'

interface RoomAtMigrationRow {
    roomId: string
    unreadCount?: unknown
    at?: unknown
    atMessageId?: unknown
}

const hasUnreadAt = (value: unknown): boolean => {
    if (value === true || value === 'all') return true
    if (typeof value !== 'string') return false
    try {
        const parsed = JSON.parse(value)
        return parsed === true || parsed === 'all'
    } catch {
        return false
    }
}

const findLatestUnreadAtMessageId = async (
    db: Knex.Transaction,
    roomId: string,
    unreadCount: number,
): Promise<string | null> => {
    if (!unreadCount) return null

    const recentMessages = db('messages')
        .where('roomId', roomId)
        .where((builder) => builder.whereNull('system').orWhere('system', false))
        .orderBy('time', 'desc')
        .orderBy('_id', 'desc')
        .limit(unreadCount)
        .select('_id', 'time', 'at')
        .as('recent_messages')
    const target = await db
        .from(recentMessages)
        .whereIn('at', [JSON.stringify(true), JSON.stringify('all')])
        .orderBy('time', 'desc')
        .orderBy('_id', 'desc')
        .select('_id')
        .first()
    return target?._id === undefined || target?._id === null ? null : String(target._id)
}

const upg23to24 = async (db: Knex) => {
    await db.transaction(async (transaction) => {
        if (!(await transaction.schema.hasColumn('rooms', 'atMessageId'))) {
            await transaction.schema.alterTable('rooms', (table) => table.string('atMessageId').nullable())
        }

        const rooms = await transaction<RoomAtMigrationRow>('rooms').select(
            'roomId',
            'unreadCount',
            'at',
            'atMessageId',
        )
        for (const room of rooms) {
            if (!hasUnreadAt(room.at) || room.atMessageId) continue

            const unreadCount = Math.max(0, Math.trunc(Number(room.unreadCount) || 0))
            const atMessageId = await findLatestUnreadAtMessageId(transaction, String(room.roomId), unreadCount)
            if (atMessageId) {
                await transaction('rooms').where('roomId', room.roomId).update({ atMessageId })
            } else {
                await transaction('rooms')
                    .where('roomId', room.roomId)
                    .update({ at: JSON.stringify(false), atMessageId: null })
            }
        }

        await transaction<DBVersion>('dbVersion').update({ dbVersion: 24 })
    })
}

export default upg23to24
