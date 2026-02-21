import { Knex } from 'knex'
import { DBVersion } from '@icalingua/types/SQLTableTypes'

const upg15to16 = async (db: Knex) => {
    await db.schema.alterTable('messages', (table) => {
        table.index(['senderId', 'roomId', 'time'])
    })
    await db.schema.alterTable('rooms', (table) => {
        table.index(['unreadCount', 'priority', 'utime'])
    })
    await db<DBVersion>('dbVersion').update({ dbVersion: 16 })
}

export default upg15to16
