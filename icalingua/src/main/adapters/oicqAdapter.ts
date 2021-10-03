import SendMessageParams from '../../types/SendMessageParams'
import {
    Client,
    createClient,
    FriendInfo,
    FriendPokeEventData,
    FriendRecallEventData,
    GroupMessageEventData,
    GroupPokeEventData,
    GroupRecallEventData,
    MemberBaseInfo,
    MemberDecreaseEventData,
    MemberIncreaseEventData,
    MemberInfo,
    MessageElem,
    MessageEventData,
    OfflineEventData,
    PrivateMessageEventData,
    FriendAddEventData,
    Ret,
    GroupAddEventData,
    GroupInviteEventData,
    SyncReadedEventData,
    FriendIncreaseEventData,
    FriendDecreaseEventData,
    StrangerInfo, SyncMessageEventData, GroupMuteEventData, QrcodeEventData,
} from 'oicq'
import StorageProvider from '../../types/StorageProvider'
import LoginForm from '../../types/LoginForm'
import getAvatarUrl from '../../utils/getAvatarUrl'
import Message from '../../types/Message'
import formatDate from '../../utils/formatDate'
import createRoom from '../../utils/createRoom'
import processMessage from '../utils/processMessage'
import {getMainWindow, loadMainWindow, sendToLoginWindow, showRequestWindow, showWindow} from '../utils/windowManager'
import ui from '../utils/ui'
import {getConfig, saveConfigFile} from '../utils/configManager'
import {app, BrowserWindow, dialog, ipcMain, NativeImage} from 'electron'
import avatarCache from '../utils/avatarCache'
import {download} from '../ipc/downloadManager'
import fs from 'fs'
import path from 'path'
import getStaticPath from '../../utils/getStaticPath'
import {createTray, updateTrayIcon} from '../utils/trayManager'
import {updateAppMenu} from '../ipc/menuManager'
import MongoStorageProvider from '../../storageProviders/MongoStorageProvider'
import Room from '../../types/Room'
import IgnoreChatInfo from '../../types/IgnoreChatInfo'
import Adapter, {CookiesDomain} from '../../types/Adapter'
import RedisStorageProvider from '../../storageProviders/RedisStorageProvider'
import SQLStorageProvider from '../../storageProviders/SQLStorageProvider'
import RoamingStamp from '../../types/RoamingStamp'
import SearchableFriend from '../../types/SearchableFriend'
import errorHandler from '../utils/errorHandler'
import {getUin} from '../ipc/botAndStorage'
import {Notification} from 'freedesktop-notifications'
import isInlineReplySupported from '../utils/isInlineReplySupported'
import getBuildInfo from '../utils/getBuildInfo'
import {checkUpdate, getCachedUpdate} from '../utils/updateChecker'

let bot: Client
let storage: StorageProvider
let loginForm: LoginForm

let currentLoadedMessagesCount = 0
let loggedIn = false
let stopFetching = false

//region event handlers
const eventHandlers = {
    async onQQMessage(data: MessageEventData | SyncMessageEventData) {
        const now = new Date(data.time * 1000)
        const groupId = (data as GroupMessageEventData).group_id
        const senderId = data.sender.user_id
        let roomId = groupId ? -groupId : data.user_id
        if (await storage.isChatIgnored(roomId)) return
        const isSelfMsg = bot.uin === senderId
        let senderName: string
        if (groupId && (<GroupMessageEventData>data).anonymous)
            senderName = (<GroupMessageEventData>data).anonymous.name
        else if (groupId && isSelfMsg)
            senderName = 'You'
        else if (groupId)
            senderName = (data.sender as MemberBaseInfo).card || data.sender.nickname
        else
            senderName = (data.sender as FriendInfo).remark || data.sender.nickname
        const avatar = getAvatarUrl(roomId)
        let roomName = ('group_name' in data) ? data.group_name : senderName

        const message: Message = {
            senderId: senderId,
            username: senderName,
            content: '',
            timestamp: formatDate('hh:mm', now),
            date: formatDate('yyyy/MM/dd', now),
            _id: data.message_id,
            role: (data.sender as MemberBaseInfo).role,
            title: (data.sender as MemberBaseInfo).title,
            files: []
        }

        let room = await storage.getRoom(roomId)
        if (!room) {
            if (groupId) {
                const group = bot.gl.get(groupId)
                if (group && group.group_name !== roomName) roomName = group.group_name
            }
            else if (data.post_type === 'sync') {
                const info = await adapter.getFriendInfo(data.user_id)
                roomName = info.remark || info.nickname
            }
            // create room
            room = createRoom(roomId, roomName, avatar)
            await storage.addRoom(room)
        }
        else {
            if (!room.roomName.startsWith(roomName) && data.post_type === 'message') {
                room.roomName = roomName
            }
        }

        //begin process msg
        const lastMessage = {
            content: '',
            timestamp: formatDate('hh:mm', now),
            username: senderName,
        }
        ////process message////
        await processMessage(data.message, message, lastMessage, roomId)

        // 自动回复消息作为小通知短暂显示
        if ('auto_reply' in data && data.auto_reply) {
            ui.message(message.content)
            return
        }

        const at = message.at
        if (at) room.at = at

        if (!room.priority) {
            room.priority = groupId ? 2 : 4
        }
        //notification
        if (
            (!getMainWindow().isFocused() ||
                !getMainWindow().isVisible() ||
                roomId !== ui.getSelectedRoomId()) &&
            (room.priority >= getConfig().priority || at) &&
            !isSelfMsg
        ) {
            //notification
            const actions = {
                default: '',
                read: '标为已读',
            }
            if (await isInlineReplySupported())
                actions['inline-reply'] = '回复...'

            const notif = new Notification({
                summary: room.roomName,
                appName: 'Icalingua',
                category: 'im.received',
                'desktop-entry': 'icalingua',
                urgency: 1,
                timeout: 5000,
                body: (groupId ? senderName + ': ' : '') + lastMessage.content,
                icon: await avatarCache(avatar),
                'x-kde-reply-placeholder-text': '发送到 ' + room.roomName,
                'x-kde-reply-submit-button-text': '发送',
                actions,
            })
            notif.on('action', (action: string) => {
                switch (action) {
                    case 'default':
                        showWindow()
                        ui.chroom(room.roomId)
                        break
                    case 'read':
                        adapter.clearRoomUnread(roomId)
                        break
                }
            })
            notif.on('reply', (r: string) => {
                adapter.clearRoomUnread(roomId)
                adapter.sendMessage({
                    content: r,
                    room,
                    roomId: room.roomId,
                    at: [],
                })
            })
            notif.push()
        }

        if (room.roomId === ui.getSelectedRoomId() && getMainWindow().isFocused()) {
            //当前处于此会话界面
            adapter.reportRead(data.message_id)
        }
        else if (isSelfMsg) {
            room.unreadCount = 0
            room.at = false
        }
        else room.unreadCount++
        room.utime = data.time * 1000
        room.lastMessage = lastMessage
        if (message.file && message.file.name && room.autoDownload) {
            download(message.file.url, message.file.name, room.downloadPath)
        }
        message.time = data.time * 1000
        ui.addMessage(room.roomId, message)
        ui.updateRoom(room)
        storage.addMessage(roomId, message)
        await storage.updateRoom(roomId, room)
        updateTrayIcon()
    },
    friendRecall(data: FriendRecallEventData) {
        ui.deleteMessage(data.message_id)
        storage.updateMessage(data.user_id, data.message_id, {deleted: true})
    },
    groupRecall(data: GroupRecallEventData) {
        ui.deleteMessage(data.message_id)
        storage.updateMessage(-data.group_id, data.message_id, {deleted: true})
    },
    online() {
        ui.setOnline()
    },
    onOffline(data: OfflineEventData) {
        console.log(data)
        ui.setOffline(data.message)
    },
    async friendPoke(data: FriendPokeEventData) {
        console.log(data)
        const roomId = data.operator_id == bot.uin ? data.user_id : data.operator_id
        const room = await storage.getRoom(roomId)
        if (room) {
            room.utime = data.time * 1000
            let msg = ''
            if (data.operator_id != bot.uin) msg += room.roomName
            else msg += '你'
            msg += data.action
            if (data.operator_id == data.target_id) msg += '自己'
            else if (data.target_id != bot.uin) msg += room.roomName
            else msg += '你'
            if (data.suffix) msg += data.suffix
            room.lastMessage = {
                content: msg,
                username: null,
                timestamp: formatDate('hh:mm'),
            }
            const message: Message = {
                username: '',
                content: msg,
                senderId: data.operator_id,
                timestamp: formatDate('hh:mm'),
                date: formatDate('yyyy/MM/dd'),
                _id: data.time,
                system: true,
                time: data.time * 1000,
                files: []
            }
            ui.addMessage(roomId, message)
            ui.updateRoom(room)
            storage.updateRoom(room.roomId, room)
            storage.addMessage(roomId, message)
        }
    },
    async groupPoke(data: GroupPokeEventData) {
        console.log(data)
        const room = await storage.getRoom(-data.group_id)
        if (room) {
            room.utime = data.time * 1000
            const operatorObj = (await bot.getGroupMemberInfo(data.group_id, data.operator_id, false)).data
            const operator = operatorObj.card ? operatorObj.card : operatorObj.nickname
            const userObj = (await bot.getGroupMemberInfo(data.group_id, data.user_id, false)).data
            const user = userObj.card ? userObj.card : userObj.nickname
            let msg = ''
            if (data.operator_id !== bot.uin) msg += operator
            else msg += '你'
            msg += data.action
            if (data.user_id !== bot.uin) msg += user
            else if (data.operator_id === bot.uin) msg += '自己'
            else msg += '你'
            if (data.suffix) msg += data.suffix
            room.lastMessage = {
                content: msg,
                username: null,
                timestamp: formatDate('hh:mm'),
            }
            const message: Message = {
                username: '',
                content: msg,
                senderId: data.operator_id,
                timestamp: formatDate('hh:mm'),
                date: formatDate('yyyy/MM/dd'),
                _id: data.time,
                system: true,
                time: data.time * 1000,
                files: []
            }
            ui.addMessage(room.roomId, message)
            ui.updateRoom(room)
            storage.updateRoom(room.roomId, room)
            storage.addMessage(room.roomId, message)
        }
    },
    async groupMemberIncrease(data: MemberIncreaseEventData) {
        console.log(data)
        const now = new Date(data.time * 1000)
        const groupId = data.group_id
        const senderId = data.user_id
        const roomId = -groupId
        if (await storage.isChatIgnored(roomId)) return
        const message: Message = {
            _id: `${now.getTime()}-${groupId}-${senderId}`,
            content: `${data.nickname} 加入了本群`,
            username: data.nickname,
            senderId,
            time: data.time * 1000,
            timestamp: formatDate('hh:mm', now),
            date: formatDate('yyyy/MM/dd', now),
            system: true,
            files: []
        }
        let room = await storage.getRoom(roomId)
        if (!room) {
            const group = bot.gl.get(groupId)
            let roomName = groupId.toString()
            if (group && group.group_name) {
                roomName = group.group_name
            }
            // create room
            room = createRoom(roomId, roomName, getAvatarUrl(roomId))
            await storage.addRoom(room)
        }
        room.utime = data.time * 1000
        room.lastMessage = {
            content: message.content,
            username: '',
            timestamp: formatDate('hh:mm', now),
        }
        ui.addMessage(roomId, message)
        ui.updateRoom(room)
        storage.updateRoom(roomId, room)
        storage.addMessage(roomId, message)
    },
    async groupMemberDecrease(data: MemberDecreaseEventData) {
        console.log(data)
        const now = new Date(data.time * 1000)
        const groupId = data.group_id
        const senderId = data.user_id
        const operator = (await bot.getGroupMemberInfo(groupId, data.operator_id)).data
        let roomId = -groupId
        if (await storage.isChatIgnored(roomId)) return
        const message: Message = {
            _id: `${now.getTime()}-${groupId}-${senderId}`,
            content: data.dismiss ? '群解散了' : (
                (data.member ?
                    (data.member.card ? data.member.card : data.member.nickname) :
                    data.user_id) +
                (data.operator_id === data.user_id ? ' 离开了本群' :
                    ` 被 ${operator.card ? operator.card : operator.nickname} 踢了`)),
            username: data.member ?
                (data.member.card ? data.member.card : data.member.nickname) :
                data.user_id.toString(),
            senderId: data.operator_id,
            time: data.time * 1000,
            timestamp: formatDate('hh:mm', now),
            date: formatDate('yyyy/MM/dd', now),
            system: true,
            files: []
        }
        let room = await storage.getRoom(roomId)
        if (!room) {
            const group = bot.gl.get(groupId)
            let roomName = groupId.toString()
            if (group && group.group_name) {
                roomName = group.group_name
            }
            // create room
            room = createRoom(roomId, roomName, getAvatarUrl(roomId))
            await storage.addRoom(room)
        }
        room.utime = data.time * 1000
        room.lastMessage = {
            content: message.content,
            username: '',
            timestamp: formatDate('hh:mm', now),
        }
        ui.addMessage(roomId, message)
        ui.updateRoom(room)
        storage.updateRoom(roomId, room)
        storage.addMessage(roomId, message)
    },
    async groupMute(data: GroupMuteEventData) {
        console.log(data)
        const roomId = -data.group_id
        if (await storage.isChatIgnored(roomId)) return
        const now = new Date(data.time * 1000)
        const operator = (await bot.getGroupMemberInfo(data.group_id, data.operator_id)).data
        let mutedUserName: string
        let muteAll = false
        if (data.user_id === 0)
            muteAll = true
        else if (data.user_id === 80000000)
            mutedUserName = data.nickname
        else {
            const mutedUser = (await bot.getGroupMemberInfo(data.group_id, data.user_id)).data
            mutedUserName = mutedUser ? mutedUser.card || mutedUser.nickname : data.user_id.toString()
        }
        let content = `${operator.card || operator.nickname} `
        if (muteAll && data.duration > 0)
            content += '开启了全员禁言'
        else if (muteAll)
            content += '关闭了全员禁言'
        else if (data.duration === 0)
            content += `将 ${mutedUserName} 解除禁言`
        else
            content += `禁言 ${mutedUserName} ${data.duration / 60} 分钟`
        const message: Message = {
            _id: `mute-${now.getTime()}-${data.user_id}-${data.operator_id}`,
            content,
            username: operator.card || operator.nickname,
            senderId: data.operator_id,
            time: data.time * 1000,
            timestamp: formatDate('hh:mm', now),
            date: formatDate('yyyy/MM/dd', now),
            system: true,
            files: []
        }
        let room = await storage.getRoom(roomId)
        if (!room) {
            const group = bot.gl.get(data.group_id)
            let roomName = data.group_id.toString()
            if (group && group.group_name) {
                roomName = group.group_name
            }
            // create room
            room = createRoom(roomId, roomName, getAvatarUrl(roomId))
            await storage.addRoom(room)
        }
        room.utime = data.time * 1000
        room.lastMessage = {
            content: message.content,
            username: '',
            timestamp: formatDate('hh:mm', now),
        }
        ui.addMessage(roomId, message)
        ui.updateRoom(room)
        storage.updateRoom(roomId, room)
        storage.addMessage(roomId, message)

    },
    async requestAdd(data: FriendAddEventData | GroupAddEventData | GroupInviteEventData) {
        //console.log(data)
        ui.sendAddRequest(data)

        //notification
        const notif = new Notification({
            summary: data.nickname,
            appName: 'Icalingua',
            category: 'im.received',
            'desktop-entry': 'icalingua',
            urgency: 1,
            timeout: 0,
            body: data.request_type === 'friend' ? '申请添加你为好友' : '申请加入：' + data.group_name,
            icon: await avatarCache(getAvatarUrl(data.user_id)),
            actions: {
                default: '',
            },
        })
        notif.on('action', () => {
            showRequestWindow()
        })
        notif.push()
    },
    syncRead(data: SyncReadedEventData) {
        const roomId = data.sub_type === 'group' ? -data.group_id : data.user_id
        adapter.clearRoomUnread(roomId)
    },
    //TODO 这里应该有好多重复代码的说，应该可以合并一下
    async friendIncrease(data: FriendIncreaseEventData) {
        const now = new Date(data.time * 1000)
        const senderId = data.user_id
        const roomId = senderId
        const roomName = data.nickname
        const message: Message = {
            _id: `${now.getTime()}-${senderId}-friendIncrease`,
            content: '你们成为了好友',
            username: data.nickname,
            senderId,
            time: data.time * 1000,
            timestamp: formatDate('hh:mm', now),
            date: formatDate('yyyy/MM/dd', now),
            system: true,
            files: []
        }
        let room = await storage.getRoom(roomId)
        if (!room) {
            // create room
            room = createRoom(roomId, roomName, getAvatarUrl(roomId))
            await storage.addRoom(room)
        }
        room.utime = data.time * 1000
        room.lastMessage = {
            content: message.content,
            username: '',
            timestamp: formatDate('hh:mm', now),
        }
        ui.addMessage(roomId, message)
        ui.updateRoom(room)
        storage.updateRoom(roomId, room)
        storage.addMessage(roomId, message)
    },
    async friendDecrease(data: FriendDecreaseEventData) {
        const now = new Date(data.time * 1000)
        const senderId = data.user_id
        const roomId = senderId
        const roomName = data.nickname
        const message: Message = {
            _id: `${now.getTime()}-${senderId}-friendIncrease`,
            content: '好友已删除',
            username: data.nickname,
            senderId,
            time: data.time * 1000,
            timestamp: formatDate('hh:mm', now),
            date: formatDate('yyyy/MM/dd', now),
            system: true,
            files: []
        }
        let room = await storage.getRoom(roomId)
        if (!room) {
            // create room
            room = createRoom(roomId, roomName, getAvatarUrl(roomId))
            await storage.addRoom(room)
        }
        room.utime = data.time * 1000
        room.lastMessage = {
            content: message.content,
            username: '',
            timestamp: formatDate('hh:mm', now),
        }
        ui.addMessage(roomId, message)
        ui.updateRoom(room)
        storage.updateRoom(roomId, room)
        storage.addMessage(roomId, message)
    },
}
const loginHandlers = {
    slider(data) {
        console.log(data)
        const veriWin = new BrowserWindow({
            height: 500,
            width: 500,
            webPreferences: {
                nativeWindowOpen: true,
                nodeIntegration: true,
                contextIsolation: false,
            },
        })
        const inject = fs.readFileSync(
            path.join(getStaticPath(), '/sliderinj.js'),
            'utf-8',
        )
        veriWin.webContents.on('did-finish-load', function () {
            veriWin.webContents.executeJavaScript(inject)
        })
        veriWin.loadURL(data.url, {
            userAgent:
                'Mozilla/5.0 (Linux; Android 7.1.1; MIUI ONEPLUS/A5000_23_17; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/77.0.3865.120 MQQBrowser/6.2 TBS/045426 Mobile Safari/537.36 V1_AND_SQ_8.3.9_0_TIM_D QQ/3.1.1.2900 NetType/WIFI WebP/0.3.0 Pixel/720 StatusBarHeight/36 SimpleUISwitch/0 QQTheme/1015712',
        })
    },
    onErr(data) {
        console.log(data)
        sendToLoginWindow('error', data.message)
    },
    async onSucceed() {
        if (!loggedIn) {
            //不是二次登录
            loggedIn = true
            //save account info
            getConfig().account = loginForm
            saveConfigFile()
            //登录完成之后的初始化操作
            await initStorage()
            await loadMainWindow()
            createTray()
            attachEventHandler()
        }
        if (loginForm.onlineStatus) {
            await bot.setOnlineStatus(loginForm.onlineStatus)
        }
        await updateAppMenu()
        await updateTrayIcon()
    },
    verify(data) {
        const veriWin = new BrowserWindow({
            height: 500,
            width: 500,
            webPreferences: {
                nativeWindowOpen: true,
            },
        })
        veriWin.on('close', () => {
            bot.login(loginForm.password)
        })
        veriWin.webContents.on('did-finish-load', function () {
            veriWin.webContents.executeJavaScript(
                'console.log=(a)=>{' +
                'if(typeof a === "string"&&' +
                'a.includes("手Q扫码验证[新设备] - 验证成功页[兼容老版本] - 点击「前往登录QQ」"))' +
                'window.close()}',
            )
        })
        veriWin.loadURL(data.url.replace('safe/verify', 'safe/qrcode'))
    },
    qrcode(data: QrcodeEventData) {
        console.log(data)
        sendToLoginWindow('qrcodeLogin', getUin())
    },
}
//endregion
//region utility functions
const initStorage = async () => {
    try {
        switch (loginForm.storageType) {
            case 'mdb':
                storage = new MongoStorageProvider(loginForm.mdbConnStr, loginForm.username)
                break
            case 'redis':
                storage = new RedisStorageProvider(loginForm.rdsHost, `${loginForm.username}`)
                break
            case 'sqlite':
                storage = new SQLStorageProvider(`${loginForm.username}`, 'sqlite3', {
                    dataPath: app.getPath('userData'),
                })
                break
            case 'mysql':
                storage = new SQLStorageProvider(`${loginForm.username}`, 'mysql', {
                    host: loginForm.sqlHost,
                    user: loginForm.sqlUsername,
                    password: loginForm.sqlPassword,
                    database: loginForm.sqlDatabase,
                })
                break
            case 'pg':
                storage = new SQLStorageProvider(`${loginForm.username}`, 'pg', {
                    host: loginForm.sqlHost,
                    user: loginForm.sqlUsername,
                    password: loginForm.sqlPassword,
                    database: loginForm.sqlDatabase,
                })
                break
            default:
                break
        }
        await storage.connect()
        storage.getAllRooms()
            .then(e => {
                e.forEach((e) => {
                    //更新群的名称
                    if (e.roomId > -1) return
                    const group = bot.gl.get(-e.roomId)
                    if (group && group.group_name !== e.roomName) {
                        storage.updateRoom(e.roomId, {roomName: group.group_name})
                    }
                })
            })
    } catch (err) {
        console.log(err)
        getConfig().account.autologin = false
        saveConfigFile()
        await dialog.showMessageBox(getMainWindow(), {
            title: '错误',
            message: '无法连接数据库',
            type: 'error',
        })
        app.quit()
    }
}
const attachEventHandler = () => {
    bot.on('message', eventHandlers.onQQMessage)
    bot.on('sync.message', eventHandlers.onQQMessage)
    bot.on('notice.friend.recall', eventHandlers.friendRecall)
    bot.on('notice.group.recall', eventHandlers.groupRecall)
    bot.on('system.online', eventHandlers.online)
    bot.on('system.offline', eventHandlers.onOffline)
    bot.on('notice.friend.poke', eventHandlers.friendPoke)
    bot.on('notice.group.poke', eventHandlers.groupPoke)
    bot.on('notice.group.increase', eventHandlers.groupMemberIncrease)
    bot.on('notice.group.decrease', eventHandlers.groupMemberDecrease)
    bot.on('notice.group.ban', eventHandlers.groupMute)
    bot.on('notice.friend.increase', eventHandlers.friendIncrease)
    bot.on('notice.friend.decrease', eventHandlers.friendDecrease)
    bot.on('request.friend.add', eventHandlers.requestAdd)
    bot.on('request.group.invite', eventHandlers.requestAdd)
    bot.on('request.group.add', eventHandlers.requestAdd)
    bot.on('sync.readed', eventHandlers.syncRead)
}
const attachLoginHandler = () => {
    bot.on('system.login.slider', loginHandlers.slider)
    bot.on('system.login.error', loginHandlers.onErr)
    bot.on('system.online', loginHandlers.onSucceed)
    bot.on('system.login.device', loginHandlers.verify)
    bot.on('system.login.qrcode', loginHandlers.qrcode)
}

//endregion

interface OicqAdapter extends Adapter {
    getMessageFromStorage(roomId: number, msgId: string): Promise<Message>

    getMsg(id: string): Promise<Ret<PrivateMessageEventData | GroupMessageEventData>>

    getFriendInfo(user_id: number): Promise<FriendInfo>
}

const adapter: OicqAdapter = {
    async getUnreadRooms(): Promise<Room[]> {
        const rooms = await storage.getAllRooms()
        return rooms.filter(e => e.unreadCount && e.priority >= getConfig().priority)
    },
    setGroupKick(gin: number, uin: number): any {
        bot.setGroupKick(gin, uin)
    },
    setGroupLeave(gin: number): any {
        bot.setGroupLeave(gin)
        if (ui.getSelectedRoomId() === gin)
            ui.setShutUp(true)
    },
    reportRead(messageId: string): any {
        bot.reportReaded(messageId)
    },
    async getGroupMembers(group: number): Promise<MemberInfo[]> {
        const values = (await bot.getGroupMemberList(group, true)).data.values()
        let iter: IteratorResult<MemberInfo, MemberInfo> = values.next()
        const all: MemberInfo[] = []
        while (!iter.done) {
            all.push(iter.value)
            iter = values.next()
        }
        return all
    },
    setGroupNick(group: number, nick: string): any {
        return bot.setGroupCard(group, getUin(), nick)
    },
    async getGroupMemberInfo(group: number, member: number, noCache: boolean = true): Promise<MemberInfo> {
        return (await bot.getGroupMemberInfo(group, member, noCache)).data
    },
    async getFriendsFallback(): Promise<SearchableFriend[]> {
        const friends = bot.fl.values()
        let iterF: IteratorResult<FriendInfo, FriendInfo> = friends.next()
        const friendsAll: SearchableFriend[] = []
        while (!iterF.done) {
            const f: SearchableFriend = {
                uin: iterF.value.user_id,
                nick: iterF.value.nickname,
                remark: iterF.value.remark,
                sc: iterF.value.nickname + iterF.value.remark + iterF.value.user_id,
            }
            friendsAll.push(f)
            iterF = friends.next()
        }
        return friendsAll
    },
    async getFriendInfo(user_id: number): Promise<FriendInfo> {
        const friend = bot.fl.get(user_id)
        return friend || ((await bot.getStrangerInfo(user_id)).data as FriendInfo)
    },
    async sendOnlineData() {
        let sysInfo = getBuildInfo()
        const updateInfo = getCachedUpdate()
        if (updateInfo && updateInfo.hasUpdate) {
            if (sysInfo)
                sysInfo += '\n\n'
            sysInfo += '新版本可用: ' + updateInfo.latestVersion
        }
        ui.sendOnlineData({
            online: bot.getStatus().data.online,
            nick: bot.nickname,
            uin: bot.uin,
            priority: getConfig().priority,
            sysInfo,
            updateCheck: getConfig().updateCheck,
        })
        ui.setAllRooms(await storage.getAllRooms())
        if (!updateInfo) {
            checkUpdate().then(adapter.sendOnlineData)
        }
    },
    getIgnoredChats(): Promise<IgnoreChatInfo[]> {
        return storage.getIgnoredChats()
    },
    removeIgnoredChat(roomId: number): any {
        return storage.removeIgnoredChat(roomId)
    },
    async getCookies(domain: CookiesDomain) {
        return (await bot.getCookies(domain)).data.cookies
    },
    async sendMessage({content, roomId, file, replyMessage, room, b64img, imgpath, at, sticker}: SendMessageParams) {
        if (!room && !roomId) {
            roomId = ui.getSelectedRoomId()
            room = await storage.getRoom(roomId)
        }
        if (!room) room = await storage.getRoom(roomId)
        if (!roomId) roomId = room.roomId
        if (file && typeof file.type === 'string' && !file.type.includes('image')) {
            //群文件
            if (roomId > 0) {
                ui.messageError('暂时无法向好友发送文件')
                return
            }
            const gfs = bot.acquireGfs(-roomId)
            gfs.upload(file.path).then(ui.closeLoading)
            ui.message('文件上传中')
            return
        }

        const message: Message = {
            _id: '',
            senderId: bot.uin,
            username: 'You',
            content,
            timestamp: formatDate('hh:mm'),
            date: formatDate('yyyy/MM/dd'),
            files: []
        }

        const chain: MessageElem[] = []

        if (replyMessage) {
            message.replyMessage = {
                _id: replyMessage._id,
                username: replyMessage.username,
                content: replyMessage.content,
                files: []
            }
            if (replyMessage.file) {
                message.replyMessage.file = replyMessage.file
            }

            chain.push({
                type: 'reply',
                data: {
                    id: replyMessage._id,
                },
            })
        }
        if (content) {
            //这里是处理@人和表情 markup 的逻辑
            const FACE_REGEX = /\[Face: (\d+)]/
            let splitContent = [content]
            // 把 @xxx 的部分单独分割开
            // '喵@小A @小B呜' -> ['喵', '@小A', ' ', '@小B', '呜']
            for (const {text} of at) {
                const newParts: string[] = []
                for (let part of splitContent) {
                    while (part.includes(text)) {
                        const index = part.indexOf(text)
                        const before = part.substr(0, index)
                        part = part.substr(index + text.length)
                        before && newParts.push(before)
                        newParts.push(text)
                    }
                    part && newParts.push(part)
                }
                splitContent = newParts
            }
            // 分离类似 [Face: 265] 的表情
            const newParts: string[] = []
            for (let part of splitContent) {
                if (at.find(e => e.text === part)) {
                    // @的成分不做处理
                    newParts.push(part)
                    continue
                }
                while (FACE_REGEX.test(part)) {
                    const exec = FACE_REGEX.exec(part)
                    const index = exec.index
                    const before = part.substr(0, index)
                    const text = exec[0]
                    part = part.substr(index + text.length)
                    before && newParts.push(before)
                    newParts.push(text)
                }
                part && newParts.push(part)
            }
            splitContent = newParts
            // 最后根据每个 string 元素判断类型并且换成对应的 MessageElem
            for (const part of splitContent) {
                const atInfo = at.find(e => e.text === part)
                const isFace = FACE_REGEX.test(part)
                let element: MessageElem
                if (atInfo)
                    element = {
                        type: 'at',
                        data: {
                            qq: atInfo.id,
                            text: atInfo.text,
                        },
                    }
                else if (isFace)
                    element = {
                        type: 'face',
                        data: {
                            id: Number(FACE_REGEX.exec(part)[1]),
                        },
                    }
                else
                    element = {
                        type: 'text',
                        data: {
                            text: part,
                        },
                    }
                chain.push(element)
            }
        }
        if (b64img) {
            chain.push({
                type: 'image',
                data: {
                    file: 'base64://' + b64img.replace(/^data:.+;base64,/, ''),
                    type: sticker ? 'face' : 'image',
                },
            })
            message.file = {
                type: 'image/jpeg',
                url: b64img,
            }
        }
        else if (imgpath) {
            chain.push({
                type: 'image',
                data: {
                    file: imgpath,
                    type: sticker ? 'face' : 'image',
                },
            })
            message.file = {
                type: 'image/jpeg',
                url: imgpath.replace(/\\/g, '/'),
            }
        }
        else if (file) {
            chain.push({
                type: 'image',
                data: {
                    file: file.path,
                    type: sticker ? 'face' : 'image',
                },
            })
            message.file = {
                url: file.path,
                size: file.size,
                type: file.type,
            }
        }
        //发送消息链
        let data: Ret<{ message_id: string }>
        if (roomId > 0) data = await bot.sendPrivateMsg(roomId, chain, true)
        else data = await bot.sendGroupMsg(-roomId, chain, true)

        ui.closeLoading()
        if (data.error) {
            ui.notifyError({
                title: 'Failed to send',
                message: data.error.message,
            })
            return
        }
        if (roomId > 0) {
            console.log(data)
            room.lastMessage = {
                content,
                timestamp: formatDate('hh:mm'),
            }
            if (file || b64img || imgpath) room.lastMessage.content += '[Image]'
            message._id = data.data.message_id
            room.utime = new Date().getTime()
            message.time = new Date().getTime()
            ui.updateRoom(room)
            ui.addMessage(room.roomId, message)
            storage.addMessage(roomId, message)
            storage.updateRoom(room.roomId, {
                utime: room.utime,
                lastMessage: room.lastMessage,
            })
        }
    },
    createBot(form: LoginForm) {
        if (!bot || form.username != bot.uin) {
            bot = createClient(Number(form.username), {
                platform: Number(form.protocol),
                data_dir: path.join(app.getPath('userData'), '/data'),
                ignore_self: false,
                brief: true,
                log_level: process.env.NODE_ENV === 'development' ? 'mark' : 'off',
            })
            bot.setMaxListeners(233)
            attachLoginHandler()
        }
        loginForm = form
        bot.login(form.password)
    },
    async getGroups() {
        const groups = bot.gl.values()
        let iterG = groups.next()
        const groupsAll = []
        while (!iterG.done) {
            const f = {...iterG.value}
            f.sc = (f.group_name + f.group_id).toUpperCase()
            groupsAll.push(f)
            iterG = groups.next()
        }
        return groupsAll
    },
    async fetchMessages(roomId: number, offset: number) {
        if (!offset) {
            adapter.clearRoomUnread(roomId).then(updateTrayIcon)
            if (roomId < 0) {
                const gid = -roomId
                const group = bot.gl.get(gid)
                if (group)
                    ui.setShutUp(!!group.shutup_time_me)
                else {
                    ui.setShutUp(true)
                    ui.message('你已经不是群成员了')
                }
            }
            else if (roomId === bot.uin) {
                ui.setShutUp(true)
            }
            else {
                ui.setShutUp(false)
            }
        }
        currentLoadedMessagesCount = offset + 20
        const messages = await storage.fetchMessages(roomId, offset, 20)
        if (!offset && typeof messages[messages.length - 1]._id === 'string')
            adapter.reportRead(<string>messages[messages.length - 1]._id)
        return messages
    },
    sliderLogin(ticket: string) {
        bot.sliderLogin(ticket)
    },
    reLogin() {
        bot.login()
    },
    updateRoom(roomId: number, room: object) {
        return storage.updateRoom(roomId, room)
    },
    updateMessage(roomId: number, messageId: string, message: object) {
        return storage.updateMessage(roomId, messageId, message)
    },
    async sendGroupPoke(gin: number, uin: number) {
        const res = await bot.sendGroupPoke(gin, uin)
        if (res.error?.code === 1002)
            ui.messageError('对方已关闭头像双击功能')
    },
    addRoom(room: Room) {
        return storage.addRoom(room)
    },
    async getForwardMsg(resId: string): Promise<Message[]> {
        const history = await bot.getForwardMsg(resId)
        if (history.error) {
            console.log(history.error)
            return
        }
        const messages = []
        for (let i = 0; i < history.data.length; i++) {
            const data = history.data[i]
            const message: Message = {
                senderId: data.user_id,
                username: data.nickname,
                content: '',
                timestamp: formatDate('hh:mm', new Date(data.time * 1000)),
                date: formatDate('yyyy/MM/dd', new Date(data.time * 1000)),
                _id: i,
                time: data.time * 1000,
                files: []
            }
            await processMessage(
                data.message,
                message,
                {},
                ui.getSelectedRoomId(),
            )
            messages.push(message)
        }
        return messages
    },

    getUin: () => bot.uin,
    getNickname: () => bot.nickname,
    getGroupFileMeta: (gin: number, fid: string) => bot.acquireGfs(gin).download(fid),
    getUnreadCount: async () => await storage.getUnreadCount(getConfig().priority),
    getFirstUnreadRoom: async () => await storage.getFirstUnreadRoom(getConfig().priority),
    getSelectedRoom: async () => await storage.getRoom(ui.getSelectedRoomId()),
    getRoom: (roomId: number) => storage.getRoom(roomId),
    getAccount: () => getConfig().account,

    setOnlineStatus: (status: number) => bot.setOnlineStatus(status),
    logOut() {
        if (bot)
            bot.logout()
    },
    getMessageFromStorage: (roomId: number, msgId: string) => storage.getMessage(roomId, msgId),
    getMsg: (id: string) => bot.getMsg(id),

    async clearCurrentRoomUnread() {
        if (!ui.getSelectedRoomId())
            return
        await adapter.clearRoomUnread(ui.getSelectedRoomId())
    },
    async clearRoomUnread(roomId: number) {
        ui.clearRoomUnread(roomId)
        await storage.updateRoom(roomId, {unreadCount: 0, at: false})
        await updateTrayIcon()
    },
    async setRoomPriority(roomId: number, priority: 1 | 2 | 3 | 4 | 5) {
        await storage.updateRoom(roomId, {priority})
        ui.setAllRooms(await storage.getAllRooms())
    },
    async setRoomAutoDownload(roomId: number, autoDownload: boolean) {
        await storage.updateRoom(roomId, {autoDownload})
    },
    async setRoomAutoDownloadPath(roomId: number, downloadPath: string) {
        await storage.updateRoom(roomId, {downloadPath})
    },
    async pinRoom(roomId: number, pin: boolean) {
        await storage.updateRoom(roomId, {index: pin ? 1 : 0})
        ui.setAllRooms(await storage.getAllRooms())
    },
    async ignoreChat(data: IgnoreChatInfo) {
        await storage.addIgnoredChat(data)
        await adapter.removeChat(data.id)
    },
    async removeChat(roomId: number) {
        await storage.removeRoom(roomId)
        ui.setAllRooms(await storage.getAllRooms())
    },
    async deleteMessage(roomId: number, messageId: string) {
        const res = await bot.deleteMsg(messageId)
        console.log(res)
        if (!res.error) {
            ui.deleteMessage(messageId)
            await storage.updateMessage(roomId, messageId, {deleted: true})
        }
        else {
            ui.notifyError({
                title: 'Failed to delete message',
                message: res.error.message,
            })
        }
    },
    async revealMessage(roomId: number, messageId: string | number) {
        ui.revealMessage(messageId)
        await storage.updateMessage(roomId, messageId, {reveal: true})
    },
    stopFetchingHistory() {
        stopFetching = true
    },
    async fetchHistory(messageId: string, roomId: number = ui.getSelectedRoomId()) {
        let lastMessage = {}
        const fetchLoop = async (limit?: number) => {
            const messages = []
            let done = false
            while (true) {
                if (stopFetching) {
                    stopFetching = false
                    done = true
                    break
                }
                const history = await bot.getChatHistory(messageId)
                if (history.error) {
                    errorHandler(history.error, true)
                    if (history.error.message !== 'msg not exists')
                        ui.messageError('错误：' + history.error.message)
                    done = true
                    break
                }
                const newMsgs: Message[] = []
                for (let i = 0; i < history.data.length; i++) {
                    const data = history.data[i]
                    const message: Message = {
                        senderId: data.sender.user_id,
                        username: (<GroupMessageEventData>data).group_id
                            ? (<GroupMessageEventData>data).anonymous
                                ? (<GroupMessageEventData>data).anonymous.name
                                : (<GroupMessageEventData>data).sender.card || data.sender.nickname
                            : (<PrivateMessageEventData>data).sender.remark || data.sender.nickname,
                        content: '',
                        timestamp: formatDate('hh:mm', new Date(data.time * 1000)),
                        date: formatDate('yyyy/MM/dd', new Date(data.time * 1000)),
                        _id: data.message_id,
                        time: data.time * 1000,
                        files: []
                    }
                    try {
                        const retData = await processMessage(
                            data.message,
                            message,
                            {},
                            roomId,
                        )

                        messages.push(message)
                        newMsgs.push(message)
                        console.log(retData)
                        lastMessage = retData.message
                    } catch (e) {
                        errorHandler(e, true)
                    }
                }
                ui.addHistoryCount(newMsgs.length)
                if (history.data.length < 2) {
                    done = true
                    break
                }
                messageId = newMsgs[0]._id as string
                const firstOwnMsg = roomId < 0 ?
                    newMsgs[0] : //群的话只要第一条消息就行
                    newMsgs.find(e => e.senderId == bot.uin)
                if (!firstOwnMsg || await storage.getMessage(roomId, firstOwnMsg._id as string)) {
                    done = true
                    break
                }
                if (limit && messages.length > limit)
                    break
            }
            return {messages, done}
        }
        const {messages, done} = await fetchLoop(60)
        await storage.addMessages(roomId, messages)
        if (roomId === ui.getSelectedRoomId())
            storage.fetchMessages(roomId, 0, currentLoadedMessagesCount + 20)
                .then(ui.setMessages)
        if (done) {
            ui.messageSuccess(`已拉取 ${messages.length} 条消息`)
            ui.clearHistoryCount()
        }
        else {
            ui.message(`已拉取 ${messages.length} 条消息，正在后台继续拉取`)
            {
                const {messages} = await fetchLoop()
                await storage.addMessages(roomId, messages)
                ui.messageSuccess(`已拉取 ${messages.length} 条消息`)
                ui.clearHistoryCount()
            }
        }

        let room = await storage.getRoom(roomId)
        room.lastMessage = lastMessage
        ui.updateRoom(room)
    },

    async getRoamingStamp(no_cache?: boolean): Promise<RoamingStamp[]> {
        const roaming_stamp = (await bot.getRoamingStamp(no_cache)).data
        let stamps = []

        for (let index: number = roaming_stamp.length - 1; index >= 0; index--) {
            const stamp: RoamingStamp = {
                id: index,
                url: roaming_stamp[index],
            }

            stamps.push(stamp)
        }

        return stamps
    },

    async getSystemMsg() {
        const msgs = (await bot.getSystemMsg()).data
        let ret_msg = {}
        for (let index in msgs) {
            const flag = msgs[index].flag
            ret_msg[flag] = {...msgs[index]}
            //ret_msg.push({flag: {...msgs[index]}})
        }

        return ret_msg
    },

    async handleRequest(type: 'friend' | 'group', flag: string, accept: boolean = true) {
        switch (type) {
            case 'friend':
                return await bot.setFriendAddRequest(flag, accept)
            case 'group':
                return await bot.setGroupAddRequest(flag, accept)
        }
    },
}

export default adapter
