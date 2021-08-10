import Adapter, {CookiesDomain} from '../../types/Adapter'
import LoginForm from '../../types/LoginForm'
import Room from '../../types/Room'
import Message from '../../types/Message'
import {FileElem} from 'oicq'
import IgnoreChatInfo from '../../types/IgnoreChatInfo'
import SendMessageParams from '../../types/SendMessageParams'
import {io, Socket} from 'socket.io-client'
import {getConfig} from '../utils/configManager'
import {sign} from 'noble-ed25519'
import {app, dialog, Notification} from 'electron'
import {getMainWindow, loadMainWindow, showWindow} from '../utils/windowManager'
import {createTray, updateTrayIcon} from '../utils/trayManager'
import ui from '../utils/ui'
import {updateAppMenu} from '../ipc/menuManager'
import avatarCache from '../utils/avatarCache'
import fs from 'fs'
import fileType from 'file-type'
import axios from 'axios'
import RoamingStamp from '../../types/RoamingStamp'
import OnlineData from '../../types/OnlineData'

let socket: Socket
let uin = 0
let cachedOnlineData: OnlineData
const attachSocketEvents = () => {
    socket.on('updateRoom', async (room: Room) => {
        if (room.roomId === ui.getSelectedRoomId() && getMainWindow().isFocused() && getMainWindow().isVisible()) {
            //把它点掉
            room.unreadCount = 0
            socket.emit('updateRoom', room.roomId, {unreadCount: 0})
        }
        ui.updateRoom(room)
        await updateTrayIcon()
    })
    socket.on('addMessage', ({roomId, message}) => ui.addMessage(roomId, message))
    socket.on('deleteMessage', ui.deleteMessage)
    socket.on('setOnline', ui.setOnline)
    socket.on('setOffline', ui.setOffline)
    socket.on('onlineData', async (data: { online: boolean, nick: string, uin: number }) => {
        uin = data.uin
        cachedOnlineData = {
            ...data,
            priority: getConfig().priority,
        }
        ui.sendOnlineData(cachedOnlineData)
        updateTrayIcon()
        updateAppMenu()
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
    socket.on('notify', async (data: {
        avatar: string,
        priority: 1 | 2 | 3 | 4 | 5,
        roomId: number,
        at: string | boolean,
        data: { title: string, body: string, hasReply: boolean, replyPlaceholder: string },
        isSelfMsg: boolean
    }) => {
        if (
            (!getMainWindow().isFocused() ||
                !getMainWindow().isVisible() ||
                data.roomId !== ui.getSelectedRoomId()) &&
            (data.priority >= getConfig().priority || data.at) &&
            !data.isSelfMsg
        ) {
            //notification

            const notif = new Notification({
                ...data.data,
                icon: await avatarCache(data.avatar),
            })
            notif.addListener('click', () => {
                showWindow()
                ui.chroom(data.roomId)
            })
            notif.addListener('reply', (e, r) => {
                adapter.sendMessage({
                    content: r,
                    roomId: data.roomId,
                    at: [],
                })
            })
            notif.show()
        }
    })
}

const adapter: Adapter = {
    sendOnlineData() {
        ui.sendOnlineData(cachedOnlineData)
    },
    getIgnoredChats(): Promise<IgnoreChatInfo[]> {
        return new Promise(resolve => socket.emit('getIgnoredChats', resolve))
    },
    removeIgnoredChat(roomId: number): any {
        socket.emit('removeIgnoredChat', roomId)
    },
    getCookies(domain: CookiesDomain): Promise<string> {
        return new Promise((resolve, reject) => {
            socket.emit('getCookies', domain, resolve)
        })
    },
    addRoom(room: Room) {
        socket.emit('addRoom', room)
    },
    clearCurrentRoomUnread() {
        if (!(socket && ui.getSelectedRoomId()))
            return
        ui.clearCurrentRoomUnread()
        socket.emit('updateRoom', ui.getSelectedRoomId(), {unreadCount: 0})
        updateTrayIcon()
    },
    async createBot(_?: LoginForm) {
        await loadMainWindow()
        createTray()
        socket = io(getConfig().server, {
            transports: ['websocket'],
        })
        socket.once('connect_error', async () => {
            await dialog.showMessageBox(getMainWindow(), {
                title: '错误',
                message: '连接失败',
                type: 'error',
            })
            app.quit()
        })
        socket.on('requireAuth', async (salt: string) => {
            socket.emit('auth', await sign(salt, getConfig().privateKey))
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
    stopFetchingHistory() {
        socket.emit('stopFetchingHistory')
    },
    fetchMessages(roomId: number, offset: number): Promise<Message[]> {
        updateTrayIcon()
        return new Promise((resolve, reject) => {
            socket.emit('fetchMessages', roomId, offset, resolve)
        })
    },
    getFirstUnreadRoom(): Promise<Room> {
        return new Promise((resolve, reject) => {
            socket.emit('getFirstUnreadRoom', getConfig().priority, resolve)
        })
    },
    getForwardMsg(resId: string) {
        return new Promise((resolve, reject) => {
            socket.emit('getForwardMsg', resId, resolve)
        })
    },
    getGroups() {
        return new Promise((resolve, reject) => {
            socket.emit('getGroups', resolve)
        })
    },
    getGroupFileMeta(gin: number, fid: string): Promise<FileElem['data']> {
        return new Promise((resolve, reject) => {
            socket.emit('getGroupFileMeta', gin, fid, resolve)
        })
    },
    getRoom(roomId: number): Promise<Room> {
        return new Promise((resolve, reject) => {
            socket.emit('getRoom', roomId, resolve)
        })
    },
    getSelectedRoom(): Promise<Room> {
        return adapter.getRoom(ui.getSelectedRoomId())
    },
    getUin: () => uin,
    getUnreadCount(): Promise<number> {
        return new Promise((resolve, reject) => {
            socket.emit('getUnreadCount', getConfig().priority, resolve)
        })
    },
    ignoreChat(data: IgnoreChatInfo) {
        socket.emit('ignoreChat', data)
    },
    logOut(): void {
    },
    pinRoom(roomId: number, pin: boolean) {
        socket.emit('pinRoom', roomId, pin)
    },
    reLogin(): void {
        socket.emit('reLogin')
    },
    removeChat(roomId: number) {
        socket.emit('removeChat', roomId)
    },
    revealMessage(roomId: number, messageId: string | number) {
        socket.emit('revealMessage', roomId, messageId)
    },
    sendGroupPoke(gin: number, uin: number) {
        socket.emit('sendGroupPoke', gin, uin)
    },
    async sendMessage(data: SendMessageParams) {
        if (!data.roomId && !data.room)
            data.roomId = ui.getSelectedRoomId()
        if (data.imgpath) {
            const fileContent = fs.readFileSync(data.imgpath)
            const type = await fileType.fromBuffer(fileContent)
            data.b64img = 'data:' + type.mime + ';base64,' + fileContent.toString('base64')
            data.imgpath = null
        }
        data.b64img ?
            socket.emit('requestToken', (token: string) =>
                axios.post(getConfig().server + `/api/${token}/sendMessage`, data, {
                    proxy: false,
                })
                    .catch(console.log),
            ) :
            socket.emit('sendMessage', data)
    },
    setOnlineStatus(status: number) {
        socket.emit('setOnlineStatus', status)
    },
    setRoomAutoDownload(roomId: number, autoDownload: boolean) {
        socket.emit('setRoomAutoDownload', roomId, autoDownload)
    },
    setRoomAutoDownloadPath(roomId: number, downloadPath: string) {
        socket.emit('setRoomAutoDownloadPath', roomId, downloadPath)
    },
    setRoomPriority(roomId: number, priority: 1 | 2 | 3 | 4 | 5) {
        socket.emit('setRoomPriority', roomId, priority)
    },
    sliderLogin(ticket: string): void {
    },
    updateMessage(roomId: number, messageId: string, message: object) {
        socket.emit('updateMessage', roomId, messageId, message)
    },
    updateRoom(roomId: number, room: object) {
        socket.emit('updateRoom', roomId, room)
    },
    getRoamingStamp(no_cache?: boolean): Promise<RoamingStamp[]> {
        return new Promise((resolve, reject) => {
            socket.emit('getRoamingStamp', no_cache, resolve)
        })
    },
}

export default adapter
