# Electron QA 经验

- 用独立配置启动时可执行：`XDG_CONFIG_HOME=/tmp/icalingua-qa-profile ../node_modules/.bin/electron --no-sandbox --remote-debugging-port=9223 .`，再通过 Playwright 的 `connectOverCDP('http://127.0.0.1:9223')` 连接真实 renderer。
- `pnpm install --frozen-lockfile` 后若 Electron 报安装不完整，先检查 `node_modules/electron/path.txt`。Node 26 环境下 `extract-zip` 可能无法完成官方缓存包的解压；确认缓存 zip 完整后，可用 `unzip` 解压到 `node_modules/electron/dist` 并写入 `path.txt`。
- 未登录状态下可进入 `#/main` 并向 ChatView 注入最小 room 数据做局部界面验收；由缺失 QQ 客户端引发的 `getGroup` 等 IPC 错误不代表渲染层回归。
- 内置浏览器控制不可用时，可用 `agent-browser --session <name> connect <port>` 连接 Electron 的 CDP 端口；它能直接执行 renderer 脚本、读取无障碍树和截图，适合验证 Vue 状态与 IPC 监听的即时界面变化。
- 通过 PTY 启动系统 Electron 后，`Ctrl+C` 可能只进入 Electron REPL 而未退出应用；应使用 `lsof -iTCP:<port> -sTCP:LISTEN -nP` 定位本次 QA 主进程，终止精确 PID 后再次确认 CDP 端口已释放。若环境禁止 `rm` 且 `/tmp` 不支持 `gio trash`，可对登记过的精确临时路径使用 `find <path...> -depth -delete` 清理。
