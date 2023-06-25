import { Knex } from 'knex'
import { DBVersion } from '@icalingua/types/SQLTableTypes'

const upg13to14 = async (db: Knex) => {
    await db.schema.alterTable('messages', (table) => {
        table.index(['subid', 'time'])
    })
    await db<DBVersion>('dbVersion').update({ dbVersion: 14 })
}

export default upg13to14
