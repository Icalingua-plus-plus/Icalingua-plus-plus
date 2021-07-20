import {createServer} from 'http'
import {Server} from 'socket.io'
import crypto from 'crypto'
import {config} from './configManager'
import adapter from '../adapters/oicqAdapter'
import registerSocketHandlers from '../handlers/registerSocketHandlers'

const httpServer = createServer()
const io = new Server(httpServer, {
    cors: {
        allowedHeaders: ['GET', 'POST'],
        origin: '*',
    },
})
io.on('connection', (socket) => {
    console.log('new client connected')
    //客户端对这个服务器发来的时间用私钥签名给服务端验证
    const salt = new Date().getTime().toString()
    socket.emit('requireAuth', salt)
    socket.once('auth', (sign: string) => {
        const verify = crypto.createVerify('RSA-SHA1')
        verify.update(salt)
        verify.end()
        if (verify.verify(config.pubKey, Buffer.from(sign, 'base64'))) {
            console.log('客户端验证成功')
            socket.emit('authSucceed')
            socket.join('authed')
            registerSocketHandlers(io, socket)
            adapter.sendOnlineData()
        } else {
            console.log('客户端验证失败')
            socket.emit('authFailed')
            socket.disconnect()
        }
    })
})

httpServer.listen(6789, '0.0.0.0', () => console.log('listening'))

export const broadcast = (channel: string, data?: any) => io.to('authed').emit(channel, data)
