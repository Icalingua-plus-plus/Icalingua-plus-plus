# Storage Providers Package

## OVERVIEW

`@icalingua/storage-providers` implements the `StorageProvider` interface for persisting chat data across multiple database backends.

## IMPLEMENTATIONS

| File | Database | Notes |
|------|----------|-------|
| `SQLStorageProvider.ts` | SQLite (default), MySQL, PostgreSQL | Uses knex query builder. Most complex implementation. |
| `MongoStorageProvider.ts` | MongoDB | Native driver. Used by Bridge deployments. |
| `RedisStorageProvider.ts` | Redis | ioredis client. Minimal/legacy support. |

## NOTES

- SQLite is the default and most common choice for desktop clients
- SQL schema migrations live in `SQLUpgradeScript/` (17 migration files, v0 to v17)
- This package uses TypeScript composite builds with a reference to `../types`
- Consumed by both `icalingua` (main process) and `icalingua-bridge-oicq`
- When modifying SQL schema, add a new migration script following the `NtoN+1.ts` naming convention
