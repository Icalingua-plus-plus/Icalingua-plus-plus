# Icalingua++ Bridge OICQ

[![GitHub package.json dependency version (prod)](https://img.shields.io/github/package-json/dependency-version/Icalingua-plus-plus/Icalingua-plus-plus/oicq-icalingua-plus-plus?filename=icalingua-bridge-oicq%2Fpackage.json)](https://github.com/takayama-lily/oicq)

基于 OICQ 的 Icalingua++ 中继，可以部署在自己的服务器上，服务器通过 OICQ 库与上级服务器通信，本地电脑与自己的服务器通信。这样可以实现一些原先无法实现的功能：

-   在电脑关闭时保持在线和消息同步
-   在多个地点同时使用一个帐号
-   通过创建不同实例同时登录多个账号

## 安装方法

**注意：**
建议不要使用淘宝源，容易造成依赖丢失

### 常规安装

1. 服务器需要安装 pnpm 和 `ffmpeg` ，选装 MongoDB / MySQL / MariaDB / PostgreSQL / Redis 作为默认数据库 SQLite 的替代

2. 在项目根目录运行 `pnpm install` 安装必要依赖

3. 进入目录 icalingua-bridge-oicq 中，运行 `pnpm compile` (Windows 用户则运行 `pnpm compile:win`) 将 ts 转换为 js

4. 前往[此页面](https://paulmillr.com/ecc/)**点击按钮**生成一组 ECC 密钥对，记录私钥和 **ed** 公钥备用

    ![ECC 密钥生成页面](https://user-images.githubusercontent.com/72498396/197397311-e07fe4fe-e1f2-4649-87c6-83917a21f88b.png)

    **注意：**
    请不要使用自带的公钥 `207a067892821e25d770f1fba0c47c11ff4b813e54162ece9eb839e076231ab6`，它对应的私钥为 `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`

    **该密钥仅适用于本地环境及测试环境，暴露在公网中是非常危险的**

5. 修改 `config.yaml`，内容如下：

    ```yaml
    host: 0.0.0.0 # 监听地址。如果有反代工具，可以改成 localhost 或者 127.0.0.1
    pubKey: # 上一步生成的公钥
    custom: false # 自定义插件功能，默认禁用
    port: 6789 # 如果需要运行多个实例，可以设置不同端口
    ```

6. 执行 `node build`，然后软件将监听在你设置的端口（默认 `6789`）。可以通过 HTTP(S) 反向代理的软件（如 caddy）将端口绑定到域名（虚拟主机）上，或者直接暴露 HTTP 端口（不建议，因为这样的话流量将以未加密的方式传输）

### 安装预打包的 bridge

1. 服务器需要安装 pnpm 和 `ffmpeg` 命令，选装 MongoDB / MySQL / MariaDB / PostgreSQL / Redis 作为默认数据库 SQLite 的替代

2. 从 [GitHub Actions](https://github.com/Icalingua-plus-plus/Icalingua-plus-plus/actions) 中下载所需版本的 `bridge-oicq` 并解压

3. 运行 `pnpm install` 安装必要依赖，同时自行补充缺失的依赖

4. 转到常规步骤第四步

### 使用 Docker

Todo

## 客户端连接方法

保持 Icalingua++ 在未运行状态下，编辑 `config.yaml`（Linux：~/.config/icalingua/config.yaml，Windows：%AppData%\icalingua\config.yaml） 或通过 `-c` 开关自定义的配置文件，修改以下配置项：

```yaml
adapter: socketIo # 将 Icalingua++ 切换到自有协议
server: http(s)://服务器的地址，若非 HTTP80 或 HTTPS443 需要:端口号
privateKey: 安装的步骤中生成的私钥
```

首次运行的时候会弹出登录界面，**需要注意的是数据库是相对应服务器的地址**

## 登录握手细节

客户端与服务器建立连接后，服务器将当前时间戳的 MD5 发送给客户端。客户端使用私钥签名发送给服务端验证，服务端验证成功后开放通信
