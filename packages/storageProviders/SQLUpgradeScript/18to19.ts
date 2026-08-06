import { Knex } from 'knex'
import { DBVersion } from '@icalingua/types/SQLTableTypes'

/** Version 19 is kept as a compatibility step for the reverted FTS commit. */
const upg18to19 = async (db: Knex) => {
    await db<DBVersion>('dbVersion').update({ dbVersion: 19 })
}

export default upg18to19
