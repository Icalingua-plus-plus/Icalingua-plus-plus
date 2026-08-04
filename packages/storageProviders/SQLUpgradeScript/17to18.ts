import { Knex } from 'knex'
import { DBVersion } from '@icalingua/types/SQLTableTypes'

const upg17to18 = async (db: Knex) => {
    const hasColumn = await db.schema.hasColumn('messages', 'markdown')
    if (!hasColumn) {
        await db.schema.alterTable('messages', (table) => {
            table.boolean('markdown').nullable()
        })
    }
    await db<DBVersion>('dbVersion').update({ dbVersion: 18 })
}

export default upg17to18
