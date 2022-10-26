# Icalingua++

Icalingua++ 是 Icalingua 的分支，为已经删除的 Icalingua 提供有限的更新，同时欢迎社区提交PR。

Icalingua 这个名字是日语中「光」和拉丁语中「语言」的组合。

本项目希望为 Linux 打造一个会话前端框架，通过实现 Adapter 后端接口来适配各种聊天平台。目前已经拥有基于 [oicq](https://github.com/takayama-lily/oicq) 以及 Icalingua 自有协议的后端

[![State-of-the-art Shitcode](https://img.shields.io/static/v1?label=State-of-the-art&message=Shitcode&color=7B5804)](https://github.com/trekhleb/state-of-the-art-shitcode)
[![License](https://img.shields.io/aur/license/icalingua++)](https://github.com/Icalingua-plus-plus/Icalingua-plus-plus/blob/development/LICENSE)
[![discord](https://img.shields.io/static/v1?label=chat&message=discord&color=7289da&logo=discord)](https://discord.gg/gKnU7BARzv)
[![Telegram](https://img.shields.io/static/v1?label=Discussion&message=Telegram&color=blue&logo=telegram)](https://t.me/Icalinguapp)

[![GitHub release (latest by date)](https://img.shields.io/github/downloads/Icalingua-plus-plus/Icalingua-plus-plus/latest/total)](https://github.com/Icalingua-plus-plus/Icalingua-plus-plus/releases/latest)
[![AUR votes](https://img.shields.io/aur/votes/icalingua++)](https://aur.archlinux.org/packages/icalingua++/)
（项目开发组没有 AUR 账号，感谢社区提供的 AUR Package）

### 常用启动参数

- 禁用硬件加速: `--dha`
- 启动时隐藏主界面: `--hide`
- 指定配置: `--config xxx.yaml`

#### 分支状态

##### development

[![Build/release](https://github.com/Icalingua-plus-plus/Icalingua-plus-plus/actions/workflows/main.yml/badge.svg?branch=development)](https://github.com/Icalingua-plus-plus/Icalingua-plus-plus/actions/workflows/main.yml)

[![GitHub package.json dependency version (prod)](https://img.shields.io/github/package-json/dependency-version/Icalingua-plus-plus/Icalingua-plus-plus/oicq-icalingua-plus-plus/development?filename=icalingua%2Fpackage.json)](https://github.com/takayama-lily/oicq)
[![GitHub package.json dependency version (dev dep on branch)](https://img.shields.io/github/package-json/dependency-version/Icalingua-plus-plus/Icalingua-plus-plus/dev/electron/development?logo=electron&filename=icalingua%2Fpackage.json)](https://electronjs.org)

### 统计

[![Stargazers over time](https://starchart.cc/Icalingua-plus-plus/Icalingua-plus-plus.svg)](https://github.com/Icalingua-plus-plus/Icalingua-plus-plus/stargazers)

### License

[![](https://camo.githubusercontent.com/473b62766b498e4f2b008ada39f1d56fb3183649f24447866e25d958ac3fd79a/68747470733a2f2f7777772e676e752e6f72672f67726170686963732f6167706c76332d3135357835312e706e67)](https://www.gnu.org/licenses/agpl-3.0.txt)

### 免责声明

本开源项目仅用于学习和交流会话前端框架实现，一切开发旨在学习，请勿用于非法用途。本项目使用 AGPL-3.0 许可，完全免费开源，不收取任何费用。请勿将本项目用于商业用途。**因使用本项目调用不同 Adapter 后端接口（如 oicq）产生的一切问题与后果由使用者自行承担，项目开发者不承担任何责任。**

本项目基于 AGPL 发行。修改、再发行和运行服务需要遵守 AGPL 许可证，源码需要和服务一起提供。
