# Icalingua++ Bridge OICQ

[![GitHub package.json dependency version (prod)](https://img.shields.io/github/package-json/dependency-version/Icalingua-plus-plus/Icalingua-plus-plus/oicq-icalingua-plus-plus?filename=icalingua-bridge-oicq%2Fpackage.json)](https://github.com/takayama-lily/oicq)

基于 OICQ 的 Icalingua++ 中继，可以部署在自己的服务器上，服务器通过 OICQ 库与上级服务器通信，本地电脑与自己的服务器通信。这样可以实现一些原先无法实现的功能：

-   在电脑关闭时保持在线和消息同步
-   在多个地点同时使用一个帐号
-   通过创建不同实例同时登录多个账号

**警告⚠：若需在公网或不可信网络中连接 Bridge，请务必使用 HTTPS 反向代理！！请务必使用 HTTPS 反向代理！！请务必使用 HTTPS 反向代理！！否则流量将以未加密的方式传输，可能导致密码/聊天记录泄露！！**

## 安装方法

**注意：**
建议不要使用淘宝源，容易造成依赖丢失；你可以使用 nrm 命令快速地切换源，安装命令如下： `npm i -g nrm`。

使用方法，例如：

```bash
nrm use npm
```

### 常规安装

1. 服务器需要安装 pnpm 和 `ffmpeg` ，选装 MongoDB / MySQL / MariaDB / PostgreSQL / Redis 作为默认数据库 SQLite 的替代

2. 在项目根目录运行 `pnpm install` 安装必要依赖

3. 进入目录 icalingua-bridge-oicq 中，运行 `pnpm build` 构建 Bridge（Linux、macOS 和 Windows 使用同一个入口）。原有的 `pnpm compile` 和 `pnpm compile:win` 命令仍可用，但已弃用。

4. 前往[此页面](https://paulmillr.com/ecc/)**点击按钮**生成一组 ECC 密钥对，记录私钥和 **ed** 公钥备用

    ![ECC 密钥生成页面](https://user-images.githubusercontent.com/72498396/197397311-e07fe4fe-e1f2-4649-87c6-83917a21f88b.png)

    **注意：**

    请不要使用自带的公钥 `207a067892821e25d770f1fba0c47c11ff4b813e54162ece9eb839e076231ab6`；

    它对应的私钥为 `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`。

    **该密钥仅适用于本地环境及测试环境，暴露在公网中是非常危险的。**

    **注意配置的密钥仅用于客户端认证，并非用于数据加密！！**

    当然，如果你不信任在线服务，可以使用本地工具生成对应的密钥对。

5. 修改 `config.yaml`，内容如下：

    ```yaml
    host: 0.0.0.0 # 监听地址。如果有反代工具，可以改成 localhost 或者 127.0.0.1
    pubKey: # 上一步生成的公钥
    custom: false # 自定义插件功能，默认禁用
    port: 6789 # 如果需要运行多个实例，可以设置不同端口
    ```

6. 执行 `node build`，然后软件将监听在你设置的端口（默认 `6789`）。可以通过 HTTP(S) 反向代理的软件（如 Caddy , Nginx 等）将端口绑定到域名（虚拟主机）上，并安装 SSL 证书；或者直接暴露 HTTP 端口（不建议，**因为这样的话流量将以未加密的方式传输**）， 关于反向代理的配置文件示例，可以参考仓库当前目录下的 [nginx.example.conf](https://github.com/Icalingua-plus-plus/Icalingua-plus-plus/blob/develop/icalingua-bridge-oicq/nginx.example.conf)。

### 安装预打包的 bridge

1. 服务器需要安装 pnpm 和 `ffmpeg` 命令，选装 MongoDB / MySQL / MariaDB / PostgreSQL / Redis 作为默认数据库 SQLite 的替代

2. 从 [GitHub Actions](https://github.com/Icalingua-plus-plus/Icalingua-plus-plus/actions) 中下载所需版本的 `bridge-oicq` 并解压

3. 运行 `pnpm install` 安装必要依赖，同时自行补充缺失的依赖

4. 转到常规步骤第四步

### Docker 部署

使用 Docker 部署是一件非常简单的事情，必要的依赖已经全部打包进去，仅仅需要一份 `docker-compose.yml` 以及一份 `config.yaml` 即可。

同时，修改 `docker-compose.yml` 中的 `ports` , `network` 以及 `container_name` 即可快速地部署多个实例。

目前支持了 `x86_64` 和 `arm64` 两种架构的镜像。

注意：该 `docker-compose.yml` 默认使用 SQLite，数据库文件会通过 `/app/data` 挂载持久化到宿主机的 `./data/config/databases/` 目录，不需要额外的数据库容器。

如果你需要使用 MongoDB、MySQL、PostgreSQL 或 Redis，请在登录配置中选择对应的数据库，并自行提供可访问的数据库服务。

#### 如何使用？

安装 Docker 和 Docker Compose(已有 Docker 环境略过)

```bash
curl -fsSL https://get.docker.com | bash -s docker
```

如果你是国内服务器，可以使用 --mirror 参数指定国内镜像源

```bash
curl -fsSL https://get.docker.com | bash -s docker --mirror Aliyun
```

#### 下载所需文件

使用 wget 来获取所需文件

```bash
mkdir qq-bridge && cd qq-bridge

# 下载 docker-compose.yml
wget https://fastly.jsdelivr.net/gh/Icalingua-plus-plus/Icalingua-plus-plus@develop/icalingua-bridge-oicq/docker-compose.yml

# 下载 config.yaml
wget https://fastly.jsdelivr.net/gh/Icalingua-plus-plus/Icalingua-plus-plus@develop/icalingua-bridge-oicq/config.yaml
```

#### 修改配置文件

依照上文中的方法，修改公钥即可，然后运行

具体跳转到 [常规安装](#常规安装) 的第 4,5 个步骤

#### 启动

使用 docker compose 来启动

```bash
docker compose up -d
```

当然，仅仅如此也是比较不安全的，你仍然需要反向代理等过程，以保证安全性。

反向代理时，需要代理的地址为`http://127.0.0.1:6789`，即容器映射后的端口，具体请根据实际情况修改。

关于反向代理的配置文件示例，可以参考仓库当前目录下的 [nginx.example.conf](https://github.com/Icalingua-plus-plus/Icalingua-plus-plus/blob/develop/icalingua-bridge-oicq/nginx.example.conf)。

## 可选的第三方协议适配器（OneBot / Milky）

Bridge 默认使用内置的 `oicq` 协议。OneBot 和 Milky 适配器是可选项，主要用于 QQ 已经由第三方机器人实现登录、且希望 Icalingua++ 与机器人共存的场景。它们不会在 Bridge 内直接登录 QQ，而是把 Bridge 连接到已经运行的 OneBot/Milky 服务。

如果没有共存需求，推荐优先使用内置 `oicq` 协议：内置协议的功能覆盖最完整；第三方适配器能否执行某项操作还取决于对应的机器人实现，部分功能可能不可用或行为不同。

### 适配器选择规则

适配器配置写在 Bridge 的 `config.yaml` 中，不是 Icalingua++ 客户端的配置文件。单个 Bridge 实例只能选择一个上游协议：

| Bridge 配置 | 实际使用的适配器 |
| --- | --- |
| 没有 `milky`，也没有 `onebot` | 内置 `oicq`（默认） |
| 配置了 `onebot` | OneBot |
| 配置了 `milky` | Milky |

`milky` 的优先级高于 `onebot`。不要在同一个实例中同时填写两项；如果两项都存在，Bridge 会使用 Milky，忽略 OneBot。需要切回内置 OICQ 时，删除（或注释）`onebot` 和 `milky` 配置项即可。

### OneBot 配置

Bridge 会主动连接 `onebot` 指定的 WebSocket 地址，因此第三方机器人需要先启动一个兼容 OneBot v11 的 WebSocket 服务端。这里填写的是 `ws://` 或 `wss://` 地址，不是普通 HTTP API 地址。示例配置如下：

```yaml
host: 0.0.0.0
pubKey: your-ed25519-public-key
custom: false
port: 6789

# OneBot WebSocket 服务端地址
onebot: 'ws://127.0.0.1:3001'
```

当前 OneBot 配置项是一个字符串 URL，不支持 `onebot: { url: ..., accessToken: ... }` 这样的对象写法。适配器不会额外设置 `Authorization` 请求头；如果所使用的 OneBot 实现规定通过 URL 查询参数鉴权，可以按该实现的要求把参数拼到 URL 中，例如：

```yaml
onebot: 'ws://127.0.0.1:3001/?access_token=replace-with-your-token'
```

具体路径、鉴权参数名和是否需要 `wss://` 以第三方机器人实现的配置为准。配置文件中的 token 属于敏感信息，不要提交到公开仓库；跨主机或公网连接时请使用加密连接，并继续为 Icalingua++ 与 Bridge 之间的连接配置 HTTPS 反向代理。

### Milky 配置

`milky` 可以写成不带鉴权的 URL 字符串，也可以写成带可选 token 的对象。这里的 `url` 是 Milky API 基地址。示例配置如下：

```yaml
host: 0.0.0.0
pubKey: your-ed25519-public-key
custom: false
port: 6789

milky:
  url: 'http://127.0.0.1:8080'
  accessToken: 'replace-with-your-token'
```

如果 Milky 服务端不需要 token，也可以使用短写法：

```yaml
milky: 'http://127.0.0.1:8080'
```

如果服务端部署在路径下，例如 API 基地址是 `http://127.0.0.1:8080/milky`，则填写该基地址，Bridge 会连接 `http://127.0.0.1:8080/milky/event`。请确认第三方服务同时提供兼容的 Milky API 和事件流，并保证 Bridge 所在机器能够访问它。

### 启动和客户端连接

1. 先启动第三方机器人服务，并确认 OneBot WebSocket 或 Milky API/SSE 地址可以从 Bridge 所在环境访问。
2. 修改 Bridge 的 `config.yaml`，填写所需的 `onebot` 或 `milky` 配置项。
3. 在 Bridge 目录启动服务。自编译或预打包版本都可以用 `-c` 指定配置文件：

    ```bash
    node build -c ./config.yaml
    ```

    Docker 部署仍然使用：

    ```bash
    docker compose up -d
    ```

    `docker-compose.yml` 会把宿主机的 `config.yaml` 挂载到容器内的 `/app/config.yaml`。如果第三方机器人运行在宿主机上，容器内的 `127.0.0.1` 指向容器自身，而不是宿主机；请改用 Docker 可达的宿主机地址，或把两个服务放入同一个 Docker network 后使用服务名连接。

4. Icalingua++ 客户端仍然使用 `adapter: socketIo` 连接 Bridge；`onebot`/`milky` 只决定 Bridge 如何连接上游机器人。首次连接时按客户端提示完成数据库和会话配置。

如果日志显示连接不上上游，优先检查协议前缀（OneBot 应为 `ws://`/`wss://`，Milky 应为 API 的 `http://`/`https://`）、容器网络地址、第三方服务是否已启动，以及鉴权配置是否匹配。

## 客户端连接方法

保持 Icalingua++ 在未运行状态下，编辑 Icalingua++ 客户端的配置文件 `config.yaml`（Linux：~/.config/icalingua/config.yaml，Windows：%AppData%\icalingua\config.yaml） 或通过 `-c` 开关自定义的配置文件，修改以下配置项：

```yaml
adapter: socketIo # 将 Icalingua++ 切换到自有协议
server: http://127.0.0.1:6789 # http(s)://服务器的地址，若非 HTTP80 或 HTTPS443 需要:端口号
privateKey: # 安装的步骤中生成的私钥
```

首次运行的时候会弹出登录界面，**需要注意的是数据库是相对应服务器的地址**，所以请在服务端配置好你想连接的数据库。


## 登录握手细节

客户端与服务器建立连接后，服务器将当前时间戳的 MD5 发送给客户端。客户端使用私钥签名发送给服务端验证，服务端验证成功后开放通信

注意这是个弱安全性的认证，且流量默认明文传输，如在不可信信道（如公网）中使用，**请务必使用 HTTPS 反向代理以建立可信传输信道！**
