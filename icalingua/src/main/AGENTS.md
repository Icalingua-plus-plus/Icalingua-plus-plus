# ELECTRON MAIN PROCESS

## OVERVIEW

Electron main process: Node.js backend handling QQ protocol adapters, IPC communication with renderer, and native OS integration.

## STRUCTURE

```
src/main/
├── index.ts              # Entry: parses argv, sets flags, defers to ready.ts
├── ready.ts              # Post-init: creates bot, sets up window/tray, handles lifecycle
├── adapters/             # Protocol implementations (all implement Adapter interface)
├── ipc/                  # IPC handlers (renderer ↔ main communication)
├── providers/            # Socket.IO server for bridge mode
├── handlers/             # File manager registration
└── utils/                # 30+ helper modules
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add new IPC method | `ipc/botAndStorage.ts` + `renderer/utils/ipc.ts` | Must sync both sides |
| Modify login flow | `ready.ts`, `adapters/*.ts` | Adapter creates bot instance |
| Change window behavior | `utils/windowManager.ts` | Multi-window support |
| Add tray menu items | `utils/trayManager.ts` | Native tray integration |
| Handle protocol URLs | `utils/protocolHandler.ts` | `icalingua://` scheme |
| Audio encode/decode | `utils/silkEncode.ts`, `silkDecode.ts` | SILK codec for voice |
| Config persistence | `utils/configManager.ts` | YAML-based settings |

## KEY FILES

**`ipc/botAndStorage.ts`** - Central IPC hub (~2500 lines). Bridges renderer requests to active adapter, manages storage providers, handles message sending/receiving. The main traffic controller.

**`adapters/oicqAdapter.ts`** - Direct QQ protocol via oicq library. Full-featured: login, messages, groups, files.

**`adapters/socketIoAdapter.ts`** - Remote bridge mode. Connects to icalingua-bridge-oicq via Socket.IO for headless/offload operation.

**`adapters/readOnlyAdapter.ts`** - Read-only mode for viewing history without connecting.

**`index.ts`** - Minimal entry point. Parses CLI args (`--dha`, `--hide`, `--config`), then hands off to `ready.ts`.

**`ready.ts`** - Application bootstrap: initializes config, creates bot if autologin, shows login window, registers protocol handlers, handles quit lifecycle.

## ADAPTER PATTERN

All adapters implement the `Adapter` interface from `@icalingua/types`. The active adapter is set at runtime based on `config.adapter`. Adapter handles all QQ operations: login, send message, fetch history, group management. IPC handlers call adapter methods; adapter emits events back via IPC to renderer.

## NOTES

- `botAndStorage.ts` is massive; consider splitting when adding new features
- Adapters are singleton; switching requires restart
- Bridge mode (`socketIoAdapter`) requires `socketIoProvider.ts` server running
- `utils/` contains platform-specific code (Windows toast, Linux notifications)
- Main process uses CommonJS; renderer uses ES modules via rspack
