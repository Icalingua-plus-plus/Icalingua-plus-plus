# ICALINGUA DESKTOP CLIENT

Electron + Vue 2 桌面客户端, QQ 协议主入口。

## STRUCTURE

```
src/
├── main/                  # Electron 主进程
│   ├── index.ts           # 入口
│   ├── adapters/          # 协议适配 (oicq/socketIo/readOnly)
│   ├── ipc/               # IPC handlers (5 files)
│   ├── providers/         # socketIoProvider
│   ├── handlers/          # fileMgr
│   └── utils/             # 30 个工具文件
├── renderer/              # Vue 2 渲染进程
│   ├── main.ts            # 入口
│   ├── views/             # 20 个页面
│   ├── components/        # UI 组件
│   │   └── vac-mod/       # 魔改 vue-advanced-chat
│   ├── router/            # vue-router
│   ├── utils/             # IPC 封装等
│   └── assets/            # 字体、图片
└── utils/                 # 主/渲染共享 (15 files)

.electron-vue/             # rspack 配置
├── build.ts, dev-runner.ts
└── rspack.*.config.ts
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| 修改聊天 UI | `src/renderer/components/vac-mod/` |
| 添加 IPC 方法 | `src/main/ipc/*.ts` + `src/renderer/utils/ipc.ts` |
| 修改主题颜色 | `src/renderer/components/vac-mod/themes/index.js` |
| 协议适配器 | `src/main/adapters/` |
| 构建配置 | `.electron-vue/` |

## CONVENTIONS

- Path alias: `@/*` → `src/renderer/*` (仅渲染进程)
- Shared utils: 相对路径 `../../utils/`
- Vue 组件: PascalCase
- IPC 通道: 大驼峰, 如 `FetchMessage`

## COMMANDS

```bash
pnpm dev           # 开发模式
pnpm build         # 完整构建 (rspack + electron-builder)
pnpm build:ci      # CI 构建 (仅 rspack)
pnpm build:win     # Windows 构建
pnpm build:woa     # ARM64 Windows
```

## NOTES

- `package.json` main: `./dist/electron/main.js`
- Output: `build/`
- vac-mod 是深度魔改的 vue-advanced-chat, 与上游 API 不兼容
- Element UI + 自定义 JSON 主题
