# RENDERER PROCESS

Vue 2 + Element UI + vue-router based Electron renderer for Icalingua++.

## STRUCTURE

```
src/renderer/
├── main.ts              # Entry point
├── App.vue              # Root component
├── components/          # Reusable components + vac-mod/ + multipane/
├── views/               # Route-level views (ChatView, LoginView, etc.)
├── router/              # vue-router configuration
├── utils/               # IPC bridge, themes, caches
└── assets/              # Static files
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add IPC call | `utils/ipc.ts` | 300+ methods exported, sole channel to main |
| Modify chat UI | `components/vac-mod/` | Heavily modified vue-advanced-chat, not npm package |
| Change theme | `utils/themes.ts` | Theme definitions |
| Add route | `router/index.ts` | Route definitions |
| Chat list sidebar | `components/TheRoomsPanel.vue` | Room list with RoomEntry |
| Contacts panel | `components/TheContactsPanel.vue` | Contacts with ContactEntry |
| Group members | `components/TheGroupMemberPanel.vue` | GroupEntry for member list |
| Main chat view | `views/ChatView.vue` | Assembles sidebar + chat |
| Detached chat window | `views/ChatWindowView.vue` | Standalone chat window |
| Login | `views/LoginView.vue` | QQ login view |

## KEY FILES

- `utils/ipc.ts` — IPC bridge with 300+ methods, **only** way to talk to main process
- `utils/rendererLifecycleScope.ts` — Owns and releases component-scoped IPC/DOM listeners, timers, RAF, and custom resources
- `vue-instance.d.ts` — Declares the typed, non-reactive `this.lifecycleScope` Vue instance field
- `components/vac-mod/` — Custom chat UI, forked/modified vue-advanced-chat
- `views/ChatView.vue` — Main application view

## COMPONENT RESOURCE LIFECYCLE

- Components that register IPC/DOM listeners, timers, animation frames, file watchers, or similar external resources must create a `RendererLifecycleScope` and dispose it in `beforeDestroy`.
- Initialize `this.lifecycleScope = createRendererLifecycleScope()` before the first `await` in `created`; this lets destruction during async initialization reject or immediately clean up late registrations.
- Keep `lifecycleScope` out of `data()`. It is an internal non-reactive instance field whose editor type is provided by `vue-instance.d.ts`; preserve the exported `RendererLifecycleScope` type and Vue module augmentation so `this.lifecycleScope` does not degrade to `any`.
- Use `lifecycleScope.onIpc` so cleanup calls `removeListener` with the exact owned callback. Never use `ipcRenderer.removeAllListeners` for component cleanup because channels are shared across components.
- Use `onEvent`, `timeout`, `interval`, and `animationFrame` for component-owned work. Use the matching scope cancellation method when cancelling early so the cleanup record is also released.
- Register `FSWatcher.close()` and other custom cleanup through `addCleanup`.
- Process-lifetime module listeners are exempt only when their lifetime is intentionally the renderer process lifetime rather than a Vue component lifetime.
- Run `pnpm --dir icalingua run test:renderer-lifecycle` after changing the scope, its Vue typing, or component integrations.

## NOTES

- `@/*` alias maps to `src/renderer/*`
- `vac-mod/` is deeply customized, treat as internal code not external dep
- All main process communication goes through `ipc.ts` methods
