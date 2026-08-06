import { Knex } from 'knex'
import { DBVersion } from '@icalingua/types/SQLTableTypes'

const upg19to20 = async (db: Knex) => {
    await db.schema.alterTable('messages', (table) => {
        table.index(['time', '_id'])
    })
    await db<DBVersion>('dbVersion').update({ dbVersion: 20 })
}

export default upg19to20
