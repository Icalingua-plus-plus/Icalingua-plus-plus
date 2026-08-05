import { Knex } from 'knex'
import { DBVersion } from '@icalingua/types/SQLTableTypes'

const upg18to19 = async (db: Knex) => {
    await db.schema.alterTable('messages', (table) => {
        table.index(['roomId', 'time', '_id'])
        table.index(['senderId', 'roomId', 'time', '_id'])
    })
    await db<DBVersion>('dbVersion').update({ dbVersion: 19 })
}

export default upg18to19
