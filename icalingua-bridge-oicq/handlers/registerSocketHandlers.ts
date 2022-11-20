import Message from '@icalingua/types/Message'
import { Server, Socket } from 'socket.io'
import adapter from '../adapters/oicqAdapter'
import gfsTokenManager from '../utils/gfsTokenManager'
import sendImgTokenManager from '../utils/sendImgTokenManager'

export default (io: Server, socket: Socket) => {
    socket.on('addRoom', adapter.addRoom)
    socket.on('updateRoom', adapter.updateRoom)
    socket.on('deleteMessage', adapter.deleteMessage)
    socket.on('hideMessage', adapter.hideMessage)
    socket.on('fetchHistory', adapter.fetchHistory)
    socket.on(
        'fetchMessages',
        (roomId: number, offset: number, resolve: (value: Message[] | PromiseLike<Message[]>) => void) =>
            adapter.fetchMessages(roomId, offset, socket, resolve),
    )
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
    socket.on('renewMessage', adapter.renewMessage)
    socket.on('renewMessageURL', adapter.renewMessageURL)
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
    socket.on('getGroupMemberInfo', adapter.getGroupMemberInfo)
    socket.on('setGroupNick', adapter.setGroupNick)
    socket.on('getGroupMembers', adapter.getGroupMembers)
    socket.on('getSystemMsg', adapter.getSystemMsg)
    socket.on('handleRequest', adapter.handleRequest)
    socket.on('setGroupLeave', adapter.setGroupLeave)
    socket.on('setGroupKick', adapter.setGroupKick)
    socket.on('setGroupBan', adapter.setGroupBan)
    socket.on('setGroupAnonymousBan', adapter.setGroupAnonymousBan)
    socket.on('makeForward', adapter.makeForward)
    socket.on('login', adapter.createBot)
    socket.on('submitSmsCode', adapter.submitSmsCode)
    socket.on('randomDevice', adapter.randomDevice)
    socket.on('requestToken', (cb) => cb(sendImgTokenManager.create()))
    socket.on('requestGfsToken', (gin: number, cb) => cb(gfsTokenManager.create(gin)))
    socket.on('login-verify-reLogin', adapter.reLogin)
    socket.on('login-slider-ticket', adapter.sliderLogin)
    socket.on('getGroup', adapter.getGroup)
    socket.on('getMsgNewURL', adapter.getMsgNewURL)
    socket.on('sendPacket', adapter.sendPacket)
}
