import {createServer} from 'http'
import {Server} from 'socket.io'
import {verify} from 'noble-ed25519'
import {config} from './configManager'
import adapter from '../adapters/oicqAdapter'
import registerSocketHandlers from '../handlers/registerSocketHandlers'
import md5 from 'md5'
import {app} from './expressProvider'
import {version, protocolVersion} from '../package.json'

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
        version, protocolVersion,
    })
    socket.once('auth', async (sign: string) => {
        if (await verify(sign, salt, config.pubKey)) {
            console.log('客户端验证成功')
            socket.emit('authSucceed')
            socket.join('authed')
            registerSocketHandlers(io, socket)
            adapter.sendOnlineData()
        }
        else {
            console.log('客户端验证失败')
            socket.emit('authFailed')
            socket.disconnect()
        }
    })
})

export const init = () => httpServer.listen(config.port || 6789, '0.0.0.0', () => console.log('listening'))

export const broadcast = (channel: string, data?: any) => io.to('authed').emit(channel, data)
export const getClientsCount = () => io.sockets.sockets.size
