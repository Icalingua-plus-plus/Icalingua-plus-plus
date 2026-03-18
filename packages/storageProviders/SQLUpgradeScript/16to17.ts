import { Knex } from 'knex'
import { DBVersion } from '@icalingua/types/SQLTableTypes'

const upg16to17 = async (db: Knex) => {
    const hasChatGroupsTable = await db.schema.hasTable('chatGroups')
    if (hasChatGroupsTable) {
        const hasColumn = await db.schema.hasColumn('chatGroups', 'includeAllPersonal')
        if (!hasColumn) {
            await db.schema.alterTable('chatGroups', (table) => {
                table.boolean('includeAllPersonal').defaultTo(false)
            })
        }
    }
    await db<DBVersion>('dbVersion').update({ dbVersion: 17 })
}

export default upg16to17
