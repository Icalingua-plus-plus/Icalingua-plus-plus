import Adapter from '../../types/Adapter'
import LoginForm from '../../types/LoginForm'
import Room from '../../types/Room'
import Message from '../../types/Message'
import {FileElem, GroupMessageEventData, MessageElem, PrivateMessageEventData, Ret} from 'oicq'
import IgnoreChatInfo from '../../types/IgnoreChatInfo'
import SendMessageParams from '../../types/SendMessageParams'
import {io, Socket} from 'socket.io-client'
import {getConfig} from '../utils/configManager'
import crypto from 'crypto'
import {app, dialog} from 'electron'
import {getMainWindow, loadMainWindow} from '../utils/windowManager'
import {createTray, updateTrayIcon} from '../utils/trayManager'
import ui from '../utils/ui'
import {updateAppMenu} from '../ipc/menuManager'

let socket: Socket
let uin = 0

const attachSocketEvents = () => {
    socket.on('updateRoom', ui.updateRoom)
    socket.on('addMessage', ({roomId, message}) => ui.addMessage(roomId, message))
    socket.on('deleteMessage', ui.deleteMessage)
    socket.on('setOnline', ui.setOnline)
    socket.on('setOffline', ui.setOffline)
    socket.on('onlineData', (data: { online: boolean, nick: string, uin: number }) => {
        uin = data.uin
        ui.sendOnlineData({
            ...data,
            priority: getConfig().priority,
        })
    })
    socket.on('setShutUp', ui.setShutUp)
    socket.on('message', ui.message)
    socket.on('messageError', ui.messageError)
    socket.on('messageSuccess', ui.messageSuccess)
    socket.on('setAllRooms', ui.setAllRooms)
    socket.on('closeLoading', ui.closeLoading)
    socket.on('notifyError', ui.notifyError)
    socket.on('revealMessage', ui.revealMessage)
    socket.on('setMessages', ({roomId, messages}: { roomId: number, messages: Message[] }) => {
        if (roomId === ui.getSelectedRoomId())
            ui.setMessages(messages)
    })
}

const adapter: Adapter = {
    addRoom(room: Room) {
        socket.emit('addRoom', room)
    },
    clearCurrentRoomUnread() {
        ui.clearCurrentRoomUnread()
        socket.emit('updateRoom', ui.getSelectedRoomId(), {unreadCount: 0})
        updateTrayIcon()
    },
    async createBot(_?: LoginForm) {
        await loadMainWindow()
        createTray()
        socket = io(getConfig().server)
        socket.on('requireAuth', (salt: string) => {
            const sign = crypto.createSign('RSA-SHA1')
            sign.update(salt)
            sign.end()
            socket.emit('auth', sign.sign(getConfig().privateKey).toString('base64'))
            console.log('已向服务端提交身份验证')
        })
        socket.once('authSucceed', attachSocketEvents)
        socket.once('authFailed', async () => {
            await dialog.showMessageBox(getMainWindow(), {
                title: '错误',
                message: '认证失败',
                type: 'error',
            })
            app.quit()
        })
        await updateAppMenu()
        await updateTrayIcon()
    },
    deleteMessage(roomId: number, messageId: string) {
        socket.emit('deleteMessage', roomId, messageId)
    },
    fetchHistory(messageId: string, roomId?: number) {
        if (!roomId)
            roomId = ui.getSelectedRoomId()
        socket.emit('fetchHistory', messageId, roomId)
    },
    fetchMessages(roomId: number, offset: number): Promise<Message[]> {
        return new Promise((resolve, reject) => {
            socket.emit('fetchMessages', roomId, offset, resolve)
        })
    },
    getFirstUnreadRoom(): Promise<Room> {
        return new Promise((resolve, reject)=>{
            socket.emit('getFirstUnreadRoom', getConfig().priority, resolve)
        })
    },
    getForwardMsg(resId: string): Promise<Ret<{ group_id?: number; user_id: number; nickname: number; time: number; message: MessageElem[]; raw_message: string }[]>> {
        return Promise.resolve(undefined)
    },
    getFriendsAndGroups(): Promise<{ friendsAll: any[]; groupsAll: any[] }> {
        return Promise.resolve({friendsAll: [], groupsAll: []})
    },
    getGroupFileMeta(gin: number, fid: string): Promise<FileElem['data']> {
        return Promise.resolve(undefined)
    },
    getRoom(roomId: number): Promise<Room> {
        return Promise.resolve(undefined)
    },
    getSelectedRoom(): Promise<Room> {
        return Promise.resolve(undefined)
    },
    getUin: () => uin,
    getUnreadCount(): Promise<number> {
        return Promise.resolve(0)
    },
    ignoreChat(data: IgnoreChatInfo): Promise<void> {
        return Promise.resolve(undefined)
    },
    logOut(): void {
    },
    pinRoom(roomId: number, pin: boolean): Promise<void> {
        return Promise.resolve(undefined)
    },
    reLogin(): void {
    },
    removeChat(roomId: number): Promise<void> {
        return Promise.resolve(undefined)
    },
    revealMessage(roomId: number, messageId: string | number): Promise<void> {
        return Promise.resolve(undefined)
    },
    sendGroupPoke(gin: number, uin: number): Promise<Ret<null>> {
        return Promise.resolve(undefined)
    },
    sendMessage(data: SendMessageParams): Promise<void> {
        return Promise.resolve(undefined)
    },
    setOnlineStatus(status: number): Promise<Ret> {
        return Promise.resolve(undefined)
    },
    setRoomAutoDownload(roomId: number, autoDownload: boolean): Promise<void> {
        return Promise.resolve(undefined)
    },
    setRoomAutoDownloadPath(roomId: number, downloadPath: string): Promise<void> {
        return Promise.resolve(undefined)
    },
    setRoomPriority(roomId: number, priority: 1 | 2 | 3 | 4 | 5): Promise<void> {
        return Promise.resolve(undefined)
    },
    sliderLogin(ticket: string): void {
    },
    updateMessage(roomId: number, messageId: string, message: object): Promise<any> {
        return Promise.resolve(undefined)
    },
    updateRoom(roomId: number, room: object): Promise<any> {
        return Promise.resolve(undefined)
    },

}

export default adapter
