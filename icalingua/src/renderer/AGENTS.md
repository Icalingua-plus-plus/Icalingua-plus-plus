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
- `components/vac-mod/` — Custom chat UI, forked/modified vue-advanced-chat
- `views/ChatView.vue` — Main application view

## NOTES

- `@/*` alias maps to `src/renderer/*`
- `vac-mod/` is deeply customized, treat as internal code not external dep
- All main process communication goes through `ipc.ts` methods
