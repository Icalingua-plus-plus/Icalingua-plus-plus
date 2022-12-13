# Icalingua++ Bridge OICQ

[![GitHub package.json dependency version (prod)](https://img.shields.io/github/package-json/dependency-version/Icalingua-plus-plus/Icalingua-plus-plus/oicq-icalingua-plus-plus?filename=icalingua-bridge-oicq%2Fpackage.json)](https://github.com/takayama-lily/oicq)

基于 OICQ 的 Icalingua++ 中继，可以部署在自己的服务器上，服务器通过 OICQ 库与上级服务器通信，本地电脑与自己的服务器通信。这样可以实现一些原先无法实现的功能：

- 在电脑关闭时保持在线和消息同步
- 在多个地点同时使用一个帐号
- 通过创建不同实例同时登录多个账号

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

3. 进入目录 icalingua-bridge-oicq 中，运行 `pnpm compile` (Windows 用户则运行 `pnpm compile:win`) 将 ts 转换为 js

4. 前往[此页面](https://paulmillr.com/ecc/)**点击按钮**生成一组 ECC 密钥对，记录私钥和 **ed** 公钥备用

    ![ECC 密钥生成页面](https://user-images.githubusercontent.com/72498396/197397311-e07fe4fe-e1f2-4649-87c6-83917a21f88b.png)

    **注意：**

    请不要使用自带的公钥 `207a067892821e25d770f1fba0c47c11ff4b813e54162ece9eb839e076231ab6`；

    它对应的私钥为 `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`。

    **该密钥仅适用于本地环境及测试环境，暴露在公网中是非常危险的。**

    当然，如果你不信任在线服务，可以使用本地工具生成对应的密钥对。

5. 修改 `config.yaml`，内容如下：

    ```yaml
    host: 0.0.0.0          	 # 监听地址。如果有反代工具，可以改成 localhost 或者 127.0.0.1
    pubKey:					 # 上一步生成的公钥
    custom: false 			 # 自定义插件功能，默认禁用
    port: 6789 				 # 如果需要运行多个实例，可以设置不同端口
    ```

6. 执行 `node build`，然后软件将监听在你设置的端口（默认 `6789`）。可以通过 HTTP(S) 反向代理的软件（如 Caddy , Nginx 等）将端口绑定到域名（虚拟主机）上，并安装 SSL 证书；或者直接暴露 HTTP 端口（不建议，因为这样的话流量将以未加密的方式传输）

### 安装预打包的 bridge

1. 服务器需要安装 pnpm 和 `ffmpeg` 命令，选装 MongoDB / MySQL / MariaDB / PostgreSQL / Redis 作为默认数据库 SQLite 的替代

2. 从 [GitHub Actions](https://github.com/Icalingua-plus-plus/Icalingua-plus-plus/actions) 中下载所需版本的 `bridge-oicq` 并解压

3. 运行 `pnpm install` 安装必要依赖，同时自行补充缺失的依赖

4. 转到常规步骤第四步

### Docker 部署

使用 Docker 部署是一件非常简单的事情，必要的依赖已经全部打包进去，仅仅需要一份 `docker-compose.yml` 以及一份 `config.yaml` 即可。

同时，修改 `docker-compose.yml` 中的 `ports` , `network` 以及 `container_name` 即可快速地部署多个实例。

注意：该 `docker-compose.yml` 提供的数据库是 `MongoDB`，并对数据库文件进行了挂载，来实现持久化存储；

如果你需要使用其他数据库，可以自行参考 `docker-compose.yml` 的 `db` 部分修改，并持久化数据，即挂载数据库文件为数据卷（强烈建议，否则会出现数据库容器重建后丢失数据的问题）；当然，你也可以删除 DB 部分，连接宿主机本身的数据库。

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
# 下载 docker-compose.yml
wget https://fastly.jsdelivr.net/gh/Icalingua-plus-plus/Icalingua-plus-plus@develop/icalingua-bridge-oicq/docker-compose.yml

# 下载 config.yaml
wget https://fastly.jsdelivr.net/gh/Icalingua-plus-plus/Icalingua-plus-plus@develop/icalingua-bridge-oicq/config.yaml
```

#### 修改配置文件

依照上文中的方法，修改公钥即可，然后运行

具体跳转到 [常规步骤](#常规步骤) 的第 4,5 个步骤

#### 启动

使用 docker compose 来启动

```bash
docker compose up -d
```
注意：仅仅如此是不可以使用的，你需要进入容器中获取到容器的 IP 地址，然后将其填入 config.yaml 中的 `host` 选项中。

例如：

```bash
# 进入指定容器，并开启 shell
docker exec -it icalingua-bridge-oicq /bin/sh

# 展示容器的 eth0 网卡的 IP 地址，具体请根据实际情况修改
ip add show eth0
```
输出如下内容：

```bash
918: eth0@if919: <BROADCAST,MULTICAST,UP,LOWER_UP,M-DOWN> mtu 1500 qdisc noqueue state UP 
    link/ether 02:42:ac:14:00:03 brd ff:ff:ff:ff:ff:ff
    inet 172.20.0.3/16 brd 172.20.255.255 scope global eth0
       valid_lft forever preferred_lft forever
```
即，将 `172.20.0.3` 填入 `config.yaml` 中的 `host` 选项中，它看起来应该是这样的：

```yaml
host: 172.20.0.3                                                         # 请修改为你自己容器的 IP 地址
pubKey: 207a067892821e25d770f1fba0c47c11ff4b813e54162ece9eb839e076231ab6 # 请修改为你自己的公钥
custom: false
port: 6789                                                               # 构建镜像时已经写死，无需修改，可以修改容器的端口映射
```

然后重启容器即可。

```bash
docker compose restart
```
当然，仅仅如此也是比较不安全的，你仍然需要反向代理等过程，以保证安全性。

根据示例可知，反向代理时，需要代理的地址为 `http://172.20.0.3:6789`，即容器的 IP 地址和端口号，或者是 `http://127.0.0.1:6789`，即容器映射后的端口，具体请根据实际情况修改。

## 客户端连接方法

保持 Icalingua++ 在未运行状态下，编辑 `config.yaml`（Linux：~/.config/icalingua/config.yaml，Windows：%AppData%\icalingua\config.yaml） 或通过 `-c` 开关自定义的配置文件，修改以下配置项：

```yaml
adapter: socketIo 					# 将 Icalingua++ 切换到自有协议
server: http://127.0.0.1:6789		# http(s)://服务器的地址，若非 HTTP80 或 HTTPS443 需要:端口号
privateKey: 						# 安装的步骤中生成的私钥
```

首次运行的时候会弹出登录界面，**需要注意的是数据库是相对应服务器的地址**，所以请在服务端配置好你想连接的数据库。

如果你的服务端使用 Docker 部署，那么 `MongoDB` 数据库的地址如下 `mongodb://mongo`。

## 登录握手细节

客户端与服务器建立连接后，服务器将当前时间戳的 MD5 发送给客户端。客户端使用私钥签名发送给服务端验证，服务端验证成功后开放通信
