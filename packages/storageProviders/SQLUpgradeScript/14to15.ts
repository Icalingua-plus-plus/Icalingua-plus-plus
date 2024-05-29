import { Knex } from 'knex'
import { DBVersion } from '@icalingua/types/SQLTableTypes'

const upg14to15 = async (db: Knex) => {
    await db.schema.alterTable('messages', (table) => {
        table.string('recallInfo').nullable()
    })
    await db<DBVersion>('dbVersion').update({ dbVersion: 15 })
}

export default upg14to15
