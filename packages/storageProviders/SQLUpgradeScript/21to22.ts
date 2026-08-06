import { Knex } from 'knex'
import { DBVersion } from '@icalingua/types/SQLTableTypes'

const obsoleteIndexColumns = [['time', '_id']]

const isMissingIndexError = (error: any): boolean => {
    const code = String(error?.code || error?.errno || '')
    if (['1091', '42704', 'ER_CANT_DROP_FIELD_OR_KEY'].includes(code)) return true
    const message = String(error?.message || error || '').toLowerCase()
    return message.includes('no such index') || /index .* does not exist/.test(message)
}

const upg21to22 = async (db: Knex) => {
    for (const columns of obsoleteIndexColumns) {
        try {
            await db.schema.alterTable('messages', (table) => table.dropIndex(columns))
        } catch (error) {
            if (!isMissingIndexError(error)) throw error
        }
    }
    await db<DBVersion>('dbVersion').update({ dbVersion: 22 })
}

export default upg21to22
