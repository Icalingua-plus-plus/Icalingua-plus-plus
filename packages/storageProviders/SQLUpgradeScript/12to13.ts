import { Knex } from 'knex'
import { DBVersion } from '@icalingua/types/SQLTableTypes'

const upg12to13 = async (db: Knex) => {
    await db.schema.alterTable('messages', (table) => {
        table.bigInteger('subid').nullable()
    })
    await db<DBVersion>('dbVersion').update({ dbVersion: 13 })
}

export default upg12to13
