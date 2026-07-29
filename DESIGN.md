# Icalingua++ Design System

## 1. Atmosphere & Identity

Icalingua++ 是高密度、低干扰的桌面聊天工具。界面以 QQ 会话内容为主，固定工具区保持克制；标志性体验是主界面、独立聊天窗口与明暗主题共享同一套紧凑操作语言。

## 2. Color

颜色由 `icalingua/src/renderer/components/vac-mod/themes/index.js` 转换为 CSS 变量，组件不得绕过主题变量。

| Role | Token | Light default | Dark default | Usage |
|---|---|---:|---:|---|
| Surface/header | `--chat-header-bg-color` | `#fff` | `#181a1b` | Room header |
| Surface/content | `--chat-content-bg-color` | `#f8f9fa` | `#131415` | Message area |
| Text/primary | `--chat-header-color-name` | `#0a0a0a` | `#fff` | Room name |
| Text/secondary | `--chat-header-color-info` | `#9ca6af` | `#9ca6af` | Member count |
| Icon/header | `--chat-icon-color-menu` | `#0a0a0a` | `#fff` | Header actions |
| Accent | `--chat-icon-color-file` | `#1976d2` | `#1976d2` | File actions |
| Border | `--chat-border-style` | `1px solid #e1e4e8` | `none` | Panel separation |

## 3. Typography

| Level | Size | Weight | Line Height | Usage |
|---|---:|---:|---:|---|
| Room title | `17px` desktop / `16px` mobile | `500` | `22px` | Header title |
| Room metadata | `13px` desktop / `12px` mobile | `400` | `18px` / `16px` | Member count |
| Body | `14px` | `400` | `1.5` | Default interface text |

Primary font follows Element UI and the operating-system sans-serif stack. Monospace is reserved for diagnostics and code-like content. Letter spacing remains `0`.

## 4. Spacing & Layout

The base unit is `4px`; existing compact steps are `4px`, `8px`, `12px`, and `16px`.

- The desktop room header is `64px` high with `16px` inline padding; mobile is `50px` high with `10px` inline padding.
- The room header is fixed within the chat pane. `.vac-container-scroll` remains the sole message scroll owner.
- Header identity content may shrink and ellipsize. Action buttons are fixed-size and must not resize the header.
- At narrow widths, actions stay in one compact cluster while the room title yields space first.

## 5. Components

### Header Icon Button

- **Structure**: native `button` containing one Element UI or `SvgIcon` glyph.
- **Variants**: neutral header action; destructive actions are not permitted in the header cluster.
- **Spacing**: `32px` stable hit box, `8px` cluster gap.
- **States**: theme-colored default, visible hover, pressed scale, keyboard focus ring, disabled opacity.
- **Accessibility**: every icon-only button has `title` and `aria-label`; it is keyboard reachable through native button semantics.
- **Motion**: existing `200ms` transform/opacity feedback; transforms are disabled under reduced motion.
- **Layout**: compact cluster immediately before the room overflow menu.

### Room Header

- **Structure**: navigation controls, room identity, contextual action cluster, overflow menu.
- **Variants**: group, private, mobile, independent chat window.
- **States**: selected room, no room, long room name, group metadata present or absent.
- **Accessibility**: controls retain native focus order and descriptive labels.
- **Motion**: only direct control feedback; the header itself does not animate.
- **Layout**: fixed shell region; message content owns scrolling.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
|---|---:|---|---|
| Micro | `200ms` | `ease` | Header icon hover and press |
| Standard | `200-300ms` | `ease-in-out` | Existing panels and menus |

Only `transform` and `opacity` are animated. Interactive controls expose hover, active, and `:focus-visible` states. `prefers-reduced-motion: reduce` disables transform feedback.

## 7. Depth & Surface

The strategy is mixed and theme-driven: panel boundaries use `--chat-border-style`; menus and overlays may use the existing `vac-app-box-shadow`. Header actions do not introduce their own surfaces or shadows.

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- Target WCAG 2.2 AA for new controls.
- Every new icon-only action must be keyboard reachable, carry an accessible name, and show a visible focus indicator.
- New controls must remain usable in light, dark, and custom themes through existing CSS variables.
- New motion must respect `prefers-reduced-motion`.

### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|---|---|---|---|
| Existing `vac-svg-button` uses a broad `transition: all` | `vac-mod/styles/helper.scss` | Pre-existing shared behavior; changing it would affect the full chat surface | Consolidate during a dedicated interaction audit |
