# @icalingua/types

## OVERVIEW

Shared TypeScript type declarations for Icalingua++ monorepo. Consumed by both Electron client and Bridge service.

## KEY TYPES

| File | Description |
|------|-------------|
| `Message.d.ts` | Core message model (senderId, content, timestamp, files, replyMessage, etc.) |
| `Room.d.ts` | Chat room model (roomId, roomName, unreadCount, priority, lastMessage) |
| `Adapter.d.ts` | Protocol adapter interface (oicq, socketIo, readOnly modes) |
| `StorageProvider.d.ts` | Storage backend CRUD interface for messages/rooms |
| `AllConfig.d.ts` | Centralized application configuration type |
| `LoginForm.d.ts` | Login credentials and device info |
| `SendMessageParams.d.ts` | Parameters for sending messages |
| `SQLTableTypes.d.ts` | SQL database table type definitions |

## NOTES

- This package contains **only declaration files (.d.ts)** — no runtime code
- Two `.ts` files exist: `LottieFaceType.ts` and `OnlineStatusType.ts` (enum-like value types)
- Uses TypeScript project references for composite builds
- Import via `@icalingua/types`
