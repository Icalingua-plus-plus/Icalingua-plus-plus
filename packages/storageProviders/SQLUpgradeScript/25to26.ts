import { Knex } from 'knex'
import { DBVersion } from '@icalingua/types/SQLTableTypes'

const upg25to26 = async (db: Knex) => {
    if (!(await db.schema.hasColumn('messages', 'emoji_reactions'))) {
        await db.schema.alterTable('messages', (table) => {
            table.text('emoji_reactions').nullable()
        })
    }
    await db<DBVersion>('dbVersion').update({ dbVersion: 26 })
}

export default upg25to26
