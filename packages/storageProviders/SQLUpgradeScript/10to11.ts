import { Knex } from 'knex'
import { DBVersion } from '@icalingua/types/SQLTableTypes'

const upg10to11 = async (db: Knex) => {
    await db.schema.alterTable('messages', (table) => {
        table.index(['roomId', 'time'])
    })
    await db<DBVersion>('dbVersion').update({ dbVersion: 11 })
}

export default upg10to11
