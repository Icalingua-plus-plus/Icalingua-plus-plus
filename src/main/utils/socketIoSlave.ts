import {getConfig} from './configManager'
import {io, Socket} from 'socket.io-client'

let socketIo: Socket

if (getConfig().socketIo) {
    socketIo = io(getConfig().socketIo, {transports: ['websocket']})
    console.log('socketIo 从端连接成功')
}

export const pushUnreadCount = (count: number) => {
    if (socketIo)
        socketIo.send('qqCount', count)
}
