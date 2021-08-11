import {Server, Socket} from 'socket.io'
import adapter from '../adapters/oicqAdapter'
import Message from '../types/Message'
import tokenManager from '../utils/tokenManager'

export default (io: Server, socket: Socket) => {
    socket.on('addRoom', adapter.addRoom)
    socket.on('updateRoom', adapter.updateRoom)
    socket.on('deleteMessage', adapter.deleteMessage)
    socket.on('fetchHistory', adapter.fetchHistory)
    socket.on('fetchMessages', (roomId: number, offset: number, resolve: (value: (Message[] | PromiseLike<Message[]>)) => void) =>
        adapter.fetchMessages(roomId, offset, socket, resolve))
    socket.on('getFirstUnreadRoom', adapter.getFirstUnreadRoom)
    socket.on('getForwardMsg', adapter.getForwardMsg)
    socket.on('getGroups', adapter.getGroups)
    socket.on('getGroupFileMeta', adapter.getGroupFileMeta)
    socket.on('getRoom', adapter.getRoom)
    socket.on('getUnreadCount', adapter.getUnreadCount)
    socket.on('ignoreChat', adapter.ignoreChat)
    socket.on('pinRoom', adapter.pinRoom)
    socket.on('reLogin', adapter.reLogin)
    socket.on('removeChat', adapter.removeChat)
    socket.on('revealMessage', adapter.revealMessage)
    socket.on('sendGroupPoke', adapter.sendGroupPoke)
    socket.on('sendMessage', adapter.sendMessage)
    socket.on('setOnlineStatus', adapter.setOnlineStatus)
    socket.on('setRoomAutoDownload', adapter.setRoomAutoDownload)
    socket.on('setRoomAutoDownloadPath', adapter.setRoomAutoDownloadPath)
    socket.on('setRoomPriority', adapter.setRoomPriority)
    socket.on('updateMessage', adapter.updateMessage)
    socket.on('updateRoom', adapter.updateRoom)
    socket.on('getCookies', adapter.getCookies)
    socket.on('getIgnoredChats', adapter.getIgnoredChats)
    socket.on('removeIgnoredChat', adapter.removeIgnoredChat)
    socket.on('getRoamingStamp', adapter.getRoamingStamp)
    socket.on('getFriendsFallback', adapter.getFriendsFallback)
    socket.on('requestToken', cb => cb(tokenManager.create()))
}
