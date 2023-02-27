import { createServer } from 'http'
import { Server } from 'socket.io'
import express from 'express'
import registerFileMgrHandler from '../handlers/registerFileMgrHandler'
import gfsTokenManager from '../utils/gfsTokenManager'
import oicqAdapter from '../adapters/oicqAdapter'
import * as net from 'net'
import path from 'path'
import getStaticPath from '../../utils/getStaticPath'

type ClientRoles = 'main' | 'fileMgr'

const app = express()
app.use('/file-manager', express.static(path.join(getStaticPath(), 'file-manager')))

const httpServer = createServer(app)
const io = new Server(httpServer, {
    cors: {
        allowedHeaders: ['GET', 'POST'],
        origin: '*',
    },
})
io.on('connection', (socket) => {
    console.log('new client connected')
    socket.emit('requireAuth', '', {
        version: '',
        protocolVersion: '',
    })
    socket.once('auth', async (sign: string, role: ClientRoles = 'main') => {
        switch (role) {
            case 'main':
            case 'fileMgr':
                const gin = gfsTokenManager.verify(sign)
                if (gin) {
                    registerFileMgrHandler(io, socket, gin, oicqAdapter)
                    console.log('客户端验证成功')
                    socket.emit('authSucceed', gin, oicqAdapter.getGroupInfo(gin))
                } else {
                    console.log('客户端验证失败')
                    socket.emit('authFailed')
                    socket.disconnect()
                }
                break
        }
    })
})

let port = 0
const host = '127.0.0.1'

export default {
    init() {
        httpServer.listen(port, host, () => (port = (httpServer.address() as net.AddressInfo).port))
    },
    getPort() {
        return port
    },
}
