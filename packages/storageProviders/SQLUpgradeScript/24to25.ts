import { Knex } from 'knex'
import { DBVersion } from '@icalingua/types/SQLTableTypes'

const upg24to25 = async (db: Knex) => {
    if (!(await db.schema.hasColumn('messages', 'button_rows'))) {
        await db.schema.alterTable('messages', (table) => {
            table.text('button_rows').nullable()
        })
    }
    await db<DBVersion>('dbVersion').update({ dbVersion: 25 })
}

export default upg24to25
