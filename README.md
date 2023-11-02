# Icalingua++ 暂停维护

**感谢大家的陪伴，Icalingua++ 项目已经暂停维护，但是暂时不会删除。（可能）**

## 给用户的一封信
亲爱的 Icalingua++ 用户：

时光荏苒，我们一路走来，收获了许多美好的回忆和温暖的陪伴。但是现在，我们或许不得不告别了。

我们一直致力于为优化用户的聊天体验，但是由于某些不可抗拒的原因，我们后续可能将无法继续提供服务。我们曾经尝试各种缓解措施，但是最终的结果仍然无法令人满意。

我们非常感谢你们一路以来的支持和信任，这是我们前进的动力和信仰。我们深知你们对 Icalingua++ 的热爱和依赖，因此我们对这突如其来的道别表示抱歉，其实，我们的离开也含有许多的不舍。

我们希望你们能够理解我们的决定，并接受我们最真挚的道别。我们将永远怀念与你们一起度过的美好时光，并祝愿你们在未来的旅途中，一切顺利、幸福美满。

最后，感谢你们的陪伴，感谢你们在这个旅程中所做出的贡献和支持。我们的心中将永远怀抱着这份感激和温暖，希望我们的离别并不是终点，而是一个新的起点。

愿你们平安、快乐，与 Icalingua++ 的回忆永远铭刻在你们的记忆中。

Icalingua++ 团队

~~2023.05.23~~ 2023.11.02

# Icalingua++

Icalingua++ 是 Icalingua 的分叉，为已经删除的 Icalingua 提供有限的更新，同时欢迎社区提交PR。

Icalingua 这个名字是日语中「光」和拉丁语中「语言」的组合。

本项目希望为 Linux 打造一个会话前端框架，通过实现 Adapter 后端接口来适配各种聊天平台。目前已经拥有基于 [oicq](https://github.com/takayama-lily/oicq) 的分叉 [oicq-icalingua-plus-plus](https://github.com/Icalingua-plus-plus/oicq-icalingua-plus-plus) 以及 Icalingua 自有协议的后端。

[![State-of-the-art Shitcode](https://img.shields.io/static/v1?label=State-of-the-art&message=Shitcode&color=7B5804)](https://github.com/trekhleb/state-of-the-art-shitcode)
[![License](https://img.shields.io/aur/license/icalingua++)](https://github.com/Icalingua-plus-plus/Icalingua-plus-plus/blob/develop/LICENSE)
[![discord](https://img.shields.io/static/v1?label=chat&message=discord&color=7289da&logo=discord)](https://discord.gg/gKnU7BARzv)
[![Telegram Discussion](https://img.shields.io/static/v1?label=Discussion&message=Telegram&color=blue&logo=telegram)](https://t.me/Icalinguapp)
[![Telegram Channel](https://img.shields.io/static/v1?label=Channel&message=Telegram&color=blue&logo=telegram)](https://t.me/Icalinguapp_Updates)

[![GitHub release (latest by date)](https://img.shields.io/github/downloads/Icalingua-plus-plus/Icalingua-plus-plus/latest/total)](https://github.com/Icalingua-plus-plus/Icalingua-plus-plus/releases/latest)
[![AUR votes](https://img.shields.io/aur/votes/icalingua++)](https://aur.archlinux.org/packages/icalingua++/)
（感谢社区提供的 AUR Package）

#### 分支状态

##### develop

[![Build/release](https://github.com/Icalingua-plus-plus/Icalingua-plus-plus/actions/workflows/main.yml/badge.svg?branch=develop)](https://github.com/Icalingua-plus-plus/Icalingua-plus-plus/actions/workflows/main.yml)

[![GitHub package.json dependency version (prod)](https://img.shields.io/github/package-json/dependency-version/Icalingua-plus-plus/Icalingua-plus-plus/oicq-icalingua-plus-plus/develop?filename=icalingua%2Fpackage.json)](https://github.com/takayama-lily/oicq)
[![GitHub package.json dependency version (dev dep on branch)](https://img.shields.io/github/package-json/dependency-version/Icalingua-plus-plus/Icalingua-plus-plus/dev/electron/develop?logo=electron&filename=icalingua%2Fpackage.json)](https://electronjs.org)

### 头部签名 API

可用于解决无法登录/无法发送消息的问题

**不要随意使用无法信任的 API**，因为这可能导致**消息内容的泄露**

### 常用启动参数

- 禁用硬件加速: `--dha`
- 启动时隐藏主界面: `--hide` 或 `-h`
- 指定配置: `--config xxx.yaml` 或 `-c xxx.yaml`
- 自定义数据目录: `--user-data-dir=`$path-you-want

### 默认数据目录

| 操作系统 | 路径                  |
|---------|-----------------------|
| Linux   | `~/.config/icalingua` |
| Windows | `%AppData%\icalingua` |
| macOS   | `~/Library/Application Support/icalingua`|

### 自定义脚本、样式、主题、插件相关

#### 自定义脚本

客户端默认会加载数据目录下的 `addon.js`，但是默认不会创建这个文件。

#### 自定义样式

客户端默认会加载数据目录下的 `style.css`，但是默认不会创建这个文件。

#### 自定义主题

此类主题为**颜色主题**，仅能修改各处的颜色表现，若需修改样式请使用**自定义样式**。

客户端默认会加载数据目录下的 `themes` 目录的所有 JSON 文件，以文件名作为主题的名字，JSON 内容可以参考客户端源码中的[默认主题文件](icalingua/src/renderer/components/vac-mod/themes/index.js)。

默认会采用 **白色 (light)** 作为基础主题，可以在 **bashTheme** 字段中指定 **light** 或者 **dark**。

##### 参考例子（一个基于黑色主题的透明主题）

themes/transparent-dark.json

```
{
    "baseTheme": "dark",
    "general": {
        "backgroundInput": "#20222364"
    },
    "header": {
        "background": "#181a1b48"
    },
    "footer": {
        "background": "#13141569",
        "backgroundReply": "#1b1c1c84",
        "backgroundTagActive": "#2b2c2c80"
    },
    "content": {
        "background": "#2c2e3064"
    },
    "message": {
        "background": "#22242a78",
        "backgroundMe": "#1f7e8064",
        "backgroundImage": "#dddddd40"
    },
    "panel": {
        "background": "#34343484",
        "itemBg": "#22242a84",
        "itemBgHover": "#1e1e2584",
        "sideBar": "#41383684",
        "headerBg": "#181a1b1c"
    }
}
```

style.css 配置（壁纸 background-image 自定）

```
.el-main {
  background-image: url("");
  background-size: cover;
  background-repeat: no-repeat;
}

.vac-container-scroll { margin-top: 64px; }
.el-badge__content--info { background-color: #6771856e; }
.vac-box-footer input { background: #ccc6; }
.el-dialog { background: #526a6bc7; }
.vac-card-window a { color: #a3b8cb; }
.vac-box-footer>div { backdrop-filter: blur(5px); }
```

#### 自定义插件

须在选项中勾选**启用插件**，bridge 则在配置文件中**设置 `custom` 为 `true`**。

插件为名为 custom 的目录，非 bridge 的插件存放在数据目录中，bridge 的插件目录与 data 目录同级存放。

[参考插件](https://github.com/Icalingua-plus-plus/Icalingua-plus-plus/tree/develop/icalingua-bridge-oicq/custom.example)，**此插件需使用 tsc 编译成 JavaScript 后才能使用！**

插件需使用 JavaScript 编写，且只有在接收到消息时才会调用插件导出的 `onMessage` 方法，data 与 bot 参数的使用方法请参考 [OICQ v1 的 wiki](https://github.com/takayama-lily/oicq/wiki)。若需监听其他事件可使用 `bot.on()`，理论上可以兼容使用修改后的 OICQ v1 API 的机器人框架并增加更完善的插件系统。

### 统计

[![Stargazers over time](https://starchart.cc/Icalingua-plus-plus/Icalingua-plus-plus.svg)](https://github.com/Icalingua-plus-plus/Icalingua-plus-plus/stargazers)

### License

[![](https://camo.githubusercontent.com/473b62766b498e4f2b008ada39f1d56fb3183649f24447866e25d958ac3fd79a/68747470733a2f2f7777772e676e752e6f72672f67726170686963732f6167706c76332d3135357835312e706e67)](https://www.gnu.org/licenses/agpl-3.0.txt)

### 免责声明

本开源项目仅用于学习和交流会话前端框架实现，一切开发旨在学习，请勿用于非法用途。本项目使用 AGPL-3.0 许可，完全免费开源，不收取任何费用。请勿将本项目用于商业用途。**因使用本项目调用不同 Adapter 后端接口（如 oicq）产生的一切问题与后果由使用者自行承担，项目开发者不承担任何责任。**

本项目基于 AGPL 发行。修改、再发行和运行服务需要遵守 AGPL 许可证，源码需要和服务一起提供。
