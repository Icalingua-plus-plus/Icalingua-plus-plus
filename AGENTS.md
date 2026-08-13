# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-20
**Commit:** 5c11c2e5
**Branch:** develop

## OVERVIEW

Icalingua++ — Electron + Vue 2 桌面 QQ 客户端，附带独立 Bridge 中继服务。pnpm monorepo，TypeScript 全栈。基于 oicq 协议库实现 QQ 通信。

## STRUCTURE

```
icalingua-plus-plus/
├── icalingua/                  # Electron 桌面客户端（主应用）
│   ├── src/main/               # Electron 主进程
│   ├── src/renderer/           # Vue 2 渲染进程
│   ├── src/utils/              # 主/渲染进程共享工具
│   └── .electron-vue/          # rspack 构建配置
├── icalingua-bridge-oicq/      # 独立 Bridge 中继服务（可 Docker 部署）
│   ├── adapters/               # oicq/milky/onebot 协议适配
│   ├── providers/              # Express/Socket.IO/配置
│   ├── handlers/               # Socket 事件处理
│   └── clients/                # Milky/Onebot 客户端
├── packages/
│   ├── types/                  # @icalingua/types — 共享类型声明
│   └── storageProviders/       # @icalingua/storage-providers — 存储后端
└── pkgres/                     # 打包资源（图标等）
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| 修改聊天 UI | `icalingua/src/renderer/components/vac-mod/` | 魔改版 vue-advanced-chat |
| 添加 IPC 方法 | `icalingua/src/main/ipc/` + `icalingua/src/renderer/utils/ipc.ts` | 两端必须同步 |
| 新增协议适配器 | `icalingua/src/main/adapters/` 或 `icalingua-bridge-oicq/adapters/` | 实现 Adapter 接口 |
| 新增存储后端 | `packages/storageProviders/` | 实现 StorageProvider 接口 |
| 共享类型 | `packages/types/` | `.d.ts` 声明文件 |
| 构建配置 | `icalingua/.electron-vue/` | rspack for renderer, tsc for main |
| Bridge 部署 | `icalingua-bridge-oicq/docker-compose.yml` | Docker + MongoDB |
| CI/CD | `.github/workflows/main.yml` | 多平台 Electron 构建 |
| 自定义主题 | `icalingua/src/renderer/components/vac-mod/themes/` | JSON 颜色主题 |

## ARCHITECTURE

```
┌─────────────────────────────────────────────┐
│              Electron Client                │
│  ┌─────────────┐     ┌──────────────────┐   │
│  │  Renderer    │ IPC │  Main Process    │   │
│  │  (Vue 2)     │◄───►│  ┌────────────┐  │   │
│  │  components/ │     │  │ Adapters   │  │   │
│  │  views/      │     │  │ oicq/      │  │   │
│  │  router/     │     │  │ socketIo/  │  │   │
│  └─────────────┘     │  │ readOnly/  │  │   │
│                       │  └──────┬─────┘  │   │
│                       │         │        │   │
│                       │  ┌──────▼─────┐  │   │
│                       │  │ Storage    │  │   │
│                       │  │ Providers  │  │   │
│                       │  └────────────┘  │   │
│                       └──────────────────┘   │
└──────────────────────┬──────────────────────┘
                       │ Socket.IO (socketIo adapter)
              ┌────────▼────────┐
              │  Bridge Service │
              │  (独立 Node.js) │
              │  adapters/      │
              │  providers/     │
              │  handlers/      │
              └────────┬────────┘
                       │ oicq protocol
              ┌────────▼────────┐
              │   QQ Servers    │
              └─────────────────┘
```

## CONVENTIONS

- **Prettier**: 120 字符行宽, 4 空格缩进, 无分号, 单引号, 尾逗号
- **TypeScript**: `strict: false`, target ES2022, module CommonJS
- **Path alias**: `@/*` → `src/renderer/*` (仅渲染进程)
- **包名**: `@icalingua/types`, `@icalingua/storage-providers`
- **Git**: 所有开发在 `develop` 分支，PR 自动 squash merge
- **提交前**: 必须运行 prettier（lint-staged + husky 自动执行）

## ANTI-PATTERNS

- **禁止** 提交 `dist` 目录
- **禁止** 使用不可信的头部签名 API（会泄露消息内容）
- 默认公钥 `207a067892...` 仅限测试环境，**禁止**在公网使用
- Bridge **必须**使用 HTTPS 反向代理（否则流量未加密）

## COMMANDS

```bash
# 安装依赖
pnpm install

# 开发 Electron 客户端
cd icalingua && pnpm dev

# 构建客户端
cd icalingua && pnpm build

# 构建 Bridge（所有平台，推荐）
cd icalingua-bridge-oicq && pnpm build

# 兼容旧脚本（已弃用，仍执行原来的 tsc 流程）
cd icalingua-bridge-oicq && pnpm compile
cd icalingua-bridge-oicq && pnpm compile:win

# 启动 Bridge
cd icalingua-bridge-oicq && pnpm start

# 格式检查
pnpm prettier -c .

# 格式化
pnpm prettier -w .
```

## NOTES

- 无自动化测试（无 jest/vitest/mocha 配置）
- Vue 2（非 Vue 3），使用 Element UI 组件库
- `vac-mod` 是深度魔改的 vue-advanced-chat 组件，已内嵌项目
- Bridge 使用 Ed25519 密钥对做客户端认证（非加密）
- 支持多种数据库：SQLite（默认）/ MongoDB / MySQL / PostgreSQL / Redis
- 项目自嘲为 "State-of-the-art Shitcode"，代码风格有历史包袱
