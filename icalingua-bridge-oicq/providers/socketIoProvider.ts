import { createServer } from 'http'
import { Server } from 'socket.io'
import { verify } from '@noble/ed25519'
import { randomBytes } from 'crypto'
import { config, userConfig } from './configManager'
import registerSocketHandlers from '../handlers/registerSocketHandlers'
import md5 from 'md5'
import { app, initExpress } from './expressProvider'
import { version, protocolVersion } from '../package.json'
import registerFileMgrHandler from '../handlers/registerFileMgrHandler'
import gfsTokenManager from '../utils/gfsTokenManager'
import fs from 'fs'
import type oicqAdapter from '../adapters/oicqAdapter'
import DatabaseUpgradeProgress from '@icalingua/types/DatabaseUpgradeProgress'

type ClientRoles = 'main' | 'fileMgr'

const httpServer = createServer(app)
const io = new Server(httpServer, {
    cors: {
        allowedHeaders: ['GET', 'POST'],
        origin: '*',
    },
})

const port = config.port || 6789
const host = config.host || '0.0.0.0'
let latestDatabaseUpgradeProgress: DatabaseUpgradeProgress = {
    active: false,
    step: 0,
    total: 0,
    message: '',
}

export const init = (adapter: typeof oicqAdapter) => {
    console.log('initExpress')
    initExpress(adapter)
    io.on('connection', (socket) => {
        console.log('new client connected')
        // 客户端对每个连接的随机 challenge 用私钥签名
        const salt = md5(new Date().getTime().toString() + randomBytes(16).toString('hex'))
        //socket.onAny(console.log)
        socket.emit('requireAuth', salt, {
            version,
            protocolVersion,
        })
        const authTimeout = setTimeout(() => {
            console.log('客户端验证超时')
            socket.emit('authFailed')
            socket.disconnect()
        }, 30 * 1000)
        socket.once('disconnect', () => clearTimeout(authTimeout))
        socket.once('auth', async (sign: string, role: ClientRoles = 'main') => {
            try {
                clearTimeout(authTimeout)
                switch (role) {
                    case 'main':
                        if (await verify(sign, salt, config.pubKey)) {
                            console.log('客户端验证成功')
                            socket.emit('authSucceed')
                            socket.join('authed')
                            socket.emit('dbUpgradeProgress', latestDatabaseUpgradeProgress)
                            registerSocketHandlers(io, socket, adapter)
                            if (adapter.loggedIn) adapter.sendOnlineData()
                            else socket.emit('requestSetup', userConfig.account)
                        } else {
                            console.log('客户端验证失败')
                            socket.emit('authFailed')
                            socket.disconnect()
                        }
                        break
                    case 'fileMgr':
                        const gin = gfsTokenManager.verify(sign)
                        if (gin) {
                            registerFileMgrHandler(io, socket, gin, adapter)
                            console.log('客户端验证成功')
                            adapter.getGroup(gin, (group) => socket.emit('authSucceed', gin, group))
                        } else {
                            console.log('客户端验证失败')
                            socket.emit('authFailed')
                            socket.disconnect()
                        }
                        break
                    default:
                        console.log('客户端验证失败')
                        socket.emit('authFailed')
                        socket.disconnect()
                        break
                }
            } catch (e) {
                console.log(e)
                socket.emit('authFailed')
                socket.disconnect()
            }
        })
    })
    if (config.unix) {
        if (fs.existsSync(config.unix)) fs.unlinkSync(config.unix)
        httpServer.listen(config.unix, () => console.log(`listening on Unix socket: ${config.unix}`))
    } else {
        httpServer.listen(port, host, () => console.log(`listening on http://${host}:${port}`))
    }
}

export const broadcast = (channel: string, data?: any) => io.to('authed').emit(channel, data)
export const broadcastDatabaseUpgradeProgress = (progress: DatabaseUpgradeProgress) => {
    latestDatabaseUpgradeProgress = { ...progress }
    io.to('authed').emit('dbUpgradeProgress', latestDatabaseUpgradeProgress)
}
export const getClientsCount = () => io.sockets.sockets.size
