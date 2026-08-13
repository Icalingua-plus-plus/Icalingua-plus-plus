# BRIDGE KNOWLEDGE BASE

**Project:** Icalingua++ Bridge OICQ
**Role:** Independent relay service for remote QQ clients

## OVERVIEW

Standalone Node.js service bridging QQ protocol (oicq/milky/onebot) to Electron clients via Socket.IO. Enables 24/7 online presence, multi-device access, and multi-account management.

## STRUCTURE

```
icalingua-bridge-oicq/
├── index.ts                    # Entry: adapter selection + Socket.IO init
├── adapters/                   # Protocol backends (oicq/milky/onebot)
├── providers/                  # socketIoProvider, expressProvider, configManager
├── handlers/                   # registerSocketHandlers.ts, registerFileMgrHandler.ts
├── clients/                    # MilkyClient.ts, OnebotClient.ts
├── utils/                      # 17 shared utilities (processMessage, silkDecode, etc.)
├── static/                     # File manager web UI assets
├── custom.example/             # Plugin template
├── config.yaml                 # Runtime config (pubKey, port, host)
└── docker-compose.yml          # Docker + MongoDB deployment
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add protocol support | `adapters/` - implement adapter interface |
| Modify auth logic | `providers/socketIoProvider.ts` |
| Add Socket events | `handlers/registerSocketHandlers.ts` |
| Plugin development | `custom.example/` - compile TS to JS |
| Build config | `build.mjs` - esbuild bundling |

## AUTHENTICATION FLOW

1. Server sends timestamp MD5 to client on connection
2. Client signs with Ed25519 private key
3. Server verifies against `pubKey` in config
4. **WARNING:** Always use HTTPS reverse proxy in production. HTTP exposes credentials.

## COMMANDS

```bash
pnpm dev                    # Development (ts-node)
pnpm build                 # Build Bridge (all platforms, recommended)
pnpm compile               # Deprecated compatibility command (legacy tsc build)
pnpm compile:win           # Deprecated compatibility command (legacy tsc build)
pnpm start                 # Run production build
docker compose up -d       # Deploy with MongoDB
```

## NOTES

- **HTTPS REQUIRED:** Never expose HTTP in production. See `nginx.example.conf`.
- **Key Generation:** Use [paulmillr.com/ecc/](https://paulmillr.com/ecc/) for Ed25519 pairs. Default test key `207a067892...` is insecure for production.
- **Supported DBs:** SQLite (default), MongoDB, MySQL, PostgreSQL, Redis
- **Plugins:** Enable via `custom: true`, place compiled JS in `custom/` directory
- **Multi-instance:** Change `port` in config + container name for multiple accounts
