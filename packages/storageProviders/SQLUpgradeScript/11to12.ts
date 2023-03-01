import { Knex } from 'knex'
import { DBVersion } from '@icalingua/types/SQLTableTypes'

const upg11to12 = async (db: Knex) => {
    await db.schema.alterTable('messages', (table) => {
        table.bigInteger('bubble_id').nullable()
    })
    await db<DBVersion>('dbVersion').update({ dbVersion: 12 })
}

export default upg11to12
