import Adapter, {CookiesDomain} from '../../types/Adapter'
import LoginForm from '../../types/LoginForm'
import Room from '../../types/Room'
import Message from '../../types/Message'
import {FileElem, MemberInfo} from 'oicq'
import IgnoreChatInfo from '../../types/IgnoreChatInfo'
import SendMessageParams from '../../types/SendMessageParams'
import {io, Socket} from 'socket.io-client'
import {getConfig} from '../utils/configManager'
import {sign} from 'noble-ed25519'
import {app, dialog} from 'electron'
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
import SearchableFriend from '../../types/SearchableFriend'
import {Notification} from 'freedesktop-notifications'
import isInlineReplySupported from '../utils/isInlineReplySupported'
import BridgeVersionInfo from '../../types/BridgeVersionInfo'
import errorHandler from '../utils/errorHandler'
import getBuildInfo from '../utils/getBuildInfo'

// 这是所对应服务端协议的版本号，如果协议有变动比如说调整了 API 才会更改。
// 如果只是功能上的变动的话就不会改这个版本号，混用协议版本相同的服务端完全没有问题
const EXCEPTED_PROTOCOL_VERSION = '1.2.5'

let socket: Socket
let uin = 0
let currentLoadedMessagesCount = 0
let cachedOnlineData: OnlineData
let versionInfo: BridgeVersionInfo
let rooms: Room[] = []

const attachSocketEvents = () => {
    socket.on('updateRoom', async (room: Room) => {
        if (room.roomId === ui.getSelectedRoomId() && getMainWindow().isFocused() && getMainWindow().isVisible()) {
            //把它点掉
            room.unreadCount = 0
            adapter.clearRoomUnread(room.roomId)
        }
        ui.updateRoom(room)
        try {
            Object.assign(rooms.find(e => e.roomId === room.roomId), room)
        } catch (e) {
            errorHandler(e, true)
        }
        await updateTrayIcon()
    })
    socket.on('addMessage', ({roomId, message}: { roomId: number, message: Message }) => {
        ui.addMessage(roomId, message)
        if (typeof message._id === 'string' &&
            roomId === ui.getSelectedRoomId() && getMainWindow().isFocused() && getMainWindow().isVisible())
            adapter.reportRead(message._id)
    })
    socket.on('deleteMessage', ui.deleteMessage)
    socket.on('setOnline', ui.setOnline)
    socket.on('setOffline', ui.setOffline)
    socket.on('onlineData', async (data: {
        online: boolean,
        nick: string,
        uin: number,
        sysInfo: string
    }) => {
        uin = data.uin
        const buildInfo = getBuildInfo()
        cachedOnlineData = {
            ...data,
            priority: getConfig().priority,
            sysInfo: buildInfo + (buildInfo ? '\n\n' : '') + data.sysInfo,
        }
        ui.sendOnlineData(cachedOnlineData)
        updateTrayIcon()
        updateAppMenu()
    })
    socket.on('setShutUp', ui.setShutUp)
    socket.on('message', ui.message)
    socket.on('messageError', ui.messageError)
    socket.on('messageSuccess', ui.messageSuccess)
    socket.on('setAllRooms', (serverRooms: Room[]) => {
        rooms = serverRooms
        ui.setAllRooms(rooms)
    })
    socket.on('closeLoading', ui.closeLoading)
    socket.on('notifyError', ui.notifyError)
    socket.on('revealMessage', ui.revealMessage)
    socket.on('syncRead', ui.clearRoomUnread)
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
            const actions = {
                default: '',
                read: '标为已读',
            }
            if (await isInlineReplySupported())
                actions['inline-reply'] = '回复...'

            const notif = new Notification({
                ...data.data,
                summary: data.data.title,
                appName: 'Icalingua',
                category: 'im.received',
                'desktop-entry': 'icalingua',
                urgency: 1,
                timeout: 5000,
                icon: await avatarCache(data.avatar),
                'x-kde-reply-placeholder-text': '发送到 ' + data.data.title,
                'x-kde-reply-submit-button-text': '发送',
                actions,
            })
            notif.on('action', (action: string) => {
                switch (action) {
                    case 'default':
                        showWindow()
                        ui.chroom(data.roomId)
                        break
                    case 'read':
                        adapter.clearRoomUnread(data.roomId)
                        break
                }
            })
            notif.on('reply', (r: string) => {
                adapter.clearRoomUnread(data.roomId)
                adapter.sendMessage({
                    content: r,
                    roomId: data.roomId,
                    at: [],
                })
            })
            notif.push()
        }
    })
}

const adapter: Adapter = {
    async getUnreadRooms(): Promise<Room[]> {
        return rooms.filter(e => e.unreadCount && e.priority >= getConfig().priority)
    },
    setGroupKick(gin: number, uin: number): any {
        socket.emit('setGroupKick', gin, uin)
    },
    setGroupLeave(gin: number): any {
        socket.emit('setGroupLeave', gin)
    },
    reportRead(messageId: string): any {
        socket.emit('reportRead', messageId)
    },
    getGroupMembers(group: number): Promise<MemberInfo[]> {
        return new Promise(resolve => socket.emit('getGroupMembers', group, resolve))
    },
    setGroupNick(group: number, nick: string): any {
        socket.emit('setGroupNick', group, nick)
    },
    getGroupMemberInfo(group: number, member: number, noCache = true): Promise<MemberInfo> {
        return new Promise(resolve => socket.emit('getGroupMemberInfo', group, member, noCache, resolve))
    },
    sendOnlineData() {
        ui.sendOnlineData(cachedOnlineData)
    },
    getIgnoredChats(): Promise<IgnoreChatInfo[]> {
        return new Promise(resolve => socket.emit('getIgnoredChats', resolve))
    },
    getFriendsFallback(): Promise<SearchableFriend[]> {
        return new Promise(resolve => socket.emit('getFriendsFallback', resolve))
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
        if (!ui.getSelectedRoomId())
            return
        adapter.clearRoomUnread(ui.getSelectedRoomId())
    },
    clearRoomUnread(roomId: number) {
        if (!socket)
            return
        ui.clearRoomUnread(roomId)
        adapter.updateRoom(roomId, {unreadCount: 0})
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
        socket.on('requireAuth', async (salt: string, version: BridgeVersionInfo) => {
            versionInfo = version
            if (version.protocolVersion !== EXCEPTED_PROTOCOL_VERSION) {
                const action = await dialog.showMessageBox(getMainWindow(), {
                    title: '提示',
                    message: `当前版本的 Icalingua 要求 Bridge 的协议版本为 ${EXCEPTED_PROTOCOL_VERSION}，而服务器的协议版本为 ${version.protocolVersion}`,
                    buttons: ['继续', '退出'],
                    defaultId: 1,
                })
                if (action.response === 1) {
                    app.quit()
                    return
                }
            }
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
        socket.emit('fetchHistory', messageId, roomId, currentLoadedMessagesCount)
    },
    stopFetchingHistory() {
        socket.emit('stopFetchingHistory')
    },
    fetchMessages(roomId: number, offset: number): Promise<Message[]> {
        updateTrayIcon()
        currentLoadedMessagesCount = offset + 20
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
        if (data.imgpath && !/^https?:\/\//.test(data.imgpath)) {
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
        try {
            Object.assign(rooms.find(e => e.roomId === roomId), room)
        } catch (e) {
            errorHandler(e, true)
        }
        socket.emit('updateRoom', roomId, room)
    },
    getRoamingStamp(no_cache?: boolean): Promise<RoamingStamp[]> {
        return new Promise((resolve, reject) => {
            socket.emit('getRoamingStamp', no_cache, resolve)
        })
    },
    getSystemMsg(): any {
        return new Promise((resolve, reject) => {
            socket.emit('getSystemMsg', resolve)
        })
    },
    handleRequest(type: 'friend' | 'group', flag: string, accept?: boolean): any {
        socket.emit('handleRequest', type, flag, accept)
    },
}

export default adapter
