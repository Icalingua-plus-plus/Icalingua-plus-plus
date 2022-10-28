import { createServer } from 'http'
import { Server } from 'socket.io'
import { verify } from '@noble/ed25519'
import { config, userConfig } from './configManager'
import adapter, { getBot, loggedIn } from '../adapters/oicqAdapter'
import registerSocketHandlers from '../handlers/registerSocketHandlers'
import md5 from 'md5'
import { app } from './expressProvider'
import { version, protocolVersion } from '../package.json'
import registerFileMgrHandler from '../handlers/registerFileMgrHandler'
import gfsTokenManager from '../utils/gfsTokenManager'
import fs from 'fs'

type ClientRoles = 'main' | 'fileMgr'

const httpServer = createServer(app)
const io = new Server(httpServer, {
    cors: {
        allowedHeaders: ['GET', 'POST'],
        origin: '*',
    },
})
io.on('connection', (socket) => {
    console.log('new client connected')
    //客户端对这个服务器发来的时间用私钥签名给服务端验证
    const salt = md5(new Date().getTime().toString())
    socket.emit('requireAuth', salt, {
        version,
        protocolVersion,
    })
    socket.once('auth', async (sign: string, role: ClientRoles = 'main') => {
        switch (role) {
            case 'main':
                if (await verify(sign, salt, config.pubKey)) {
                    console.log('客户端验证成功')
                    socket.emit('authSucceed')
                    socket.join('authed')
                    registerSocketHandlers(io, socket)
                    if (loggedIn) adapter.sendOnlineData()
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
                    registerFileMgrHandler(io, socket, gin)
                    console.log('客户端验证成功')
                    socket.emit('authSucceed', gin, getBot().gl.get(gin))
                } else {
                    console.log('客户端验证失败')
                    socket.emit('authFailed')
                    socket.disconnect()
                }
                break
        }
    })
})

const port = config.port || 6789
const host = config.host || '0.0.0.0'

export const init = () => {
    if (config.unix) {
        if (fs.existsSync(config.unix)) fs.unlinkSync(config.unix)
        httpServer.listen(config.unix, () => console.log(`listening on Unix socket: ${config.unix}`))
    } else {
        httpServer.listen(port, host, () => console.log(`listening on http://${host}:${port}`))
    }
}

export const broadcast = (channel: string, data?: any) => io.to('authed').emit(channel, data)
export const getClientsCount = () => io.sockets.sockets.size
