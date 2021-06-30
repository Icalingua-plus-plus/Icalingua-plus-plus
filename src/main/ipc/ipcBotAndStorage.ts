import {BrowserWindow, ipcMain, Notification} from 'electron'
import {
    Client,
    createClient,
    FriendInfo, FriendPokeEventData, FriendRecallEventData,
    GroupMessageEventData, GroupPokeEventData, GroupRecallEventData,
    MemberBaseInfo,
    MessageEventData, OfflineEventData, OnlineEventData,
    Ret,
} from 'oicq'
import path from 'path'
import fs from 'fs'
import MongoStorageProvider from '../storageProviders/MongoStorageProvider'
import RedisStorageProvider from '../storageProviders/RedisStorageProvider'
import StorageProvider from '../../types/StorageProvider'
import {getMainWindow, loadMainWindow, sendToLoginWindow, showWindow} from '../utils/windowManager'
import {createTray} from '../utils/trayManager'
import ui from '../utils/ui'
import formatDate from '../utils/formatDate'
import Message from '../../types/Message'
import processMessage from '../utils/processMessage'
import getAvatarUrl from '../utils/getAvatarUrl'
import settings from 'electron-settings'
import avatarCache from '../utils/avatarCache'
import createRoom from '../utils/createRoom'
import Room from '../../types/Room'
import LoginForm from '../../types/LoginForm'
import {download, init as initDownloadManager} from './downloadManager'
import IgnoreChatInfo from '../../types/IgnoreChatInfo'

type SendMessageParams = {
    content: string,
    roomId: number,
    file?: {
        type: string,
        path: string,
        size: number
    },
    replyMessage?: any,
    room: Room,
    b64img?: string,
    imgpath?: string
}

let bot: Client
let storage: StorageProvider
let loginForm: LoginForm

let selectedRoomId = 0

//我希望这里面的东西是本机无关的，就是说这个文件可以整个换掉不影响其他部分，或者单独抽出来也能工作，只要接口签名都一样

//region event handlers
const eventHandlers = {
    async onQQMessage(data: MessageEventData) {
        console.log(data)
        const now = new Date(data.time * 1000)
        const groupId = (data as GroupMessageEventData).group_id
        const senderId = data.sender.user_id
        let roomId = groupId ? -groupId : data.user_id
        //todo
        // if ((await settings.get('ignoredChats') as Array<{ id: number, name: string }>).find((e) => e.id == roomId)) return
        const isSelfMsg = bot.uin === senderId
        const senderName = groupId
            ? ((<GroupMessageEventData>data).anonymous)
                ? (<GroupMessageEventData>data).anonymous.name
                : isSelfMsg
                    ? 'You'
                    : (data.sender as MemberBaseInfo).card || data.sender.nickname
            : (data.sender as FriendInfo).remark || data.sender.nickname
        const avatar = getAvatarUrl(roomId)
        let roomName = ('group_name' in data) ? data.group_name : senderName

        const message: Message = {
            senderId: senderId,
            username: senderName,
            content: '',
            timestamp: formatDate('hh:mm', now),
            date: formatDate('dd/MM/yyyy', now),
            _id: data.message_id,
            role: (data.sender as MemberBaseInfo).role,
        }

        let room = await storage.getRoom(roomId)
        if (room === undefined) {
            const group = bot.gl.get(groupId)
            if (group && group.group_name !== roomName) roomName = group.group_name
            // create room
            room = createRoom(roomId, roomName, avatar)
            await storage.addRoom(room)
        } else {
            if (!room.roomName.startsWith(roomName)) {
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
        const at = message.at
        if (at) room.at = at

        if (!room.priority) {
            room.priority = groupId ? 2 : 4
        }
        //notification
        if (
            (!getMainWindow().isFocused() ||
                roomId !== selectedRoomId) &&
            (room.priority >= settings.getSync('priority') || at) &&
            !isSelfMsg
        ) {
            //notification

            const notif = new Notification({
                title: room.roomName,
                body: (groupId ? senderName + ': ' : '') + lastMessage.content,
                icon: await avatarCache(avatar),
                hasReply: true,
                replyPlaceholder: 'Reply to ' + roomName,
            })
            notif.addListener('click', () => {
                showWindow()
                ui.chroom(room.roomId)
            })
            notif.addListener('reply', (e, r) => {
                sendMessage({
                    content: r,
                    room,
                    roomId: room.roomId,
                })
            })
            notif.show()
            console.log(notif)
        }

        if (
            room.roomId !== selectedRoomId ||
            !getMainWindow().isFocused()
        ) {
            if (isSelfMsg) {
                room.unreadCount = 0
                room.at = false
            } else room.unreadCount++
        }
        room.utime = data.time * 1000
        room.lastMessage = lastMessage
        //todo
        // updateTrayIcon(room.roomName);
        if (message.file && message.file.name && room.autoDownload) {
            download(message.file.url, message.file.name, room.downloadPath)
        }
        message.time = data.time * 1000
        if (selectedRoomId === room.roomId)
            ui.addMessage(room.roomId, message)
        ui.updateRoom(room)
        await storage.updateRoom(roomId, room)
        await storage.addMessage(roomId, message)
        return message
    },
    friendRecall(data: FriendRecallEventData) {
        if (data.user_id == selectedRoomId) {
            ui.deleteMessage(data.message_id)
        }
        storage.updateMessage(data.user_id, data.message_id, {deleted: new Date()})
    },
    groupRecall(data: GroupRecallEventData) {
        if (-data.group_id == selectedRoomId) {
            ui.deleteMessage(data.message_id)
        }
        storage.updateMessage(-data.group_id, data.message_id, {deleted: new Date()})
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
                date: formatDate('dd/MM/yyyy'),
                _id: data.time,
                system: true,
                time: data.time * 1000,
            }
            if (roomId === selectedRoomId)
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
                date: formatDate('dd/MM/yyyy'),
                _id: data.time,
                system: true,
                time: data.time * 1000,
            }
            if (room.roomId === selectedRoomId)
                ui.addMessage(-data.group_id, message)
            ui.updateRoom(room)
            storage.updateRoom(room.roomId, room)
            storage.addMessage(room.roomId, message)
        }
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
                enableRemoteModule: true,
                contextIsolation: false,
            },
        })
        const inject = fs.readFileSync(
            path.join(global.STATIC, '/sliderinj.js'),
            'utf-8',
        )
        console.log(inject)
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
    onSucceed() {
        //save account info
        settings.set('account', loginForm)
        if (loginForm.onlineStatus) {
            bot.setOnlineStatus(loginForm.onlineStatus)
        }
        //登录完成之后的初始化操作
        loadMainWindow()
        createTray()
        attachEventHandler()
        initStorage()
        initDownloadManager()
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
                'mqq.invoke=function(a, b, c){if(b==\'closeWebViews\'){window.close();}}',
            )
        })
        veriWin.loadURL(data.url.replace('safe/verify', 'safe/qrcode'))
    },
}
//endregion
//region utility functions
const initStorage = async () => {
    //todo: use settings manager
    try {
        if (loginForm.storageType === 'mdb')
            storage = new MongoStorageProvider(loginForm.mdbConnStr, loginForm.username)
            // else if (extra.storageType === 'idb')
        //     storage = new IndexedStorageProvider(form.username)
        else if (loginForm.storageType === 'redis')
            storage = new RedisStorageProvider(loginForm.rdsHost, loginForm.username)

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
        await settings.set('account.autologin', false)
        alert('Error connecting to database')
    }
}
const attachEventHandler = () => {
    bot.on('message', eventHandlers.onQQMessage)
    bot.on('notice.friend.recall', eventHandlers.friendRecall)
    bot.on('notice.group.recall', eventHandlers.groupRecall)
    bot.on('system.online', eventHandlers.online)
    bot.on('system.offline', eventHandlers.onOffline)
    bot.on('notice.friend.poke', eventHandlers.friendPoke)
    bot.on('notice.group.poke', eventHandlers.groupPoke)
}
const attachLoginHandler = () => {
    bot.on('system.login.slider', loginHandlers.slider)
    bot.on('system.login.error', loginHandlers.onErr)
    bot.on('system.online', loginHandlers.onSucceed)
    bot.on('system.login.device', loginHandlers.verify)
}
//endregion

ipcMain.handle('createBot', async (event, form: LoginForm) => {
    bot = global.bot = createClient(Number(form.username), {
        platform: Number(form.protocol),
        data_dir: path.join(global.STORE_PATH, '/data'),
        ignore_self: false,
        brief: true,
        log_level: process.env.NODE_ENV === 'development' ? 'mark' : 'off',
    })
    bot.setMaxListeners(233)
    loginForm = form
    attachLoginHandler()
    bot.login(form.password)
})
ipcMain.handle('getFriendsAndGroups', async () => {
    const friends = bot.fl.values()
    let iterF = friends.next()
    const friendsAll = []
    while (!iterF.done) {
        const f = {...iterF.value}
        f.sc = (f.nickname + f.remark + f.user_id).toUpperCase()
        friendsAll.push(f)
        iterF = friends.next()
    }
    const groups = bot.gl.values()
    let iterG = groups.next()
    const groupsAll = []
    while (!iterG.done) {
        const f = {...iterG.value}
        f.sc = (f.group_name + f.group_id).toUpperCase()
        groupsAll.push(f)
        iterG = groups.next()
    }
    return {
        friendsAll, groupsAll,
    }
})
ipcMain.handle('sliderLogin', (_, ticket: string) => {
    bot.sliderLogin(ticket)
})
ipcMain.handle('getAllRooms', async () => {
    return await storage.getAllRooms()
})
ipcMain.handle('botLogin', (_, password: string) => {
    bot.login(password)
})
const sendMessage = async ({content, roomId, file, replyMessage, room, b64img, imgpath}: SendMessageParams) => {
    if (file && file.type && !file.type.includes('image')) {
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
        date: formatDate('dd/MM/yyyy'),
    }

    const chain = []

    if (replyMessage) {
        message.replyMessage = {
            _id: replyMessage._id,
            username: replyMessage.username,
            content: replyMessage.content,
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
    if (content)
        chain.push({
            type: 'text',
            data: {
                text: content,
            },
        })
    if (b64img) {
        chain.push({
            type: 'image',
            data: {
                file: 'base64://' + b64img.replace(/^data:.+;base64,/, ''),
            },
        })
        message.file = {
            type: 'image/jpeg',
            url: b64img,
        }
    } else if (imgpath) {
        chain.push({
            type: 'image',
            data: {
                file: imgpath,
            },
        })
        message.file = {
            type: 'image/jpeg',
            url: imgpath.replace(/\\/g, '/'),
        }
    } else if (file) {
        chain.push({
            type: 'image',
            data: {
                file: file.path,
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
}
ipcMain.handle('sendMessage', (_, data) => sendMessage(data))
ipcMain.handle('isOnline', () => bot.getStatus().data.online)
ipcMain.handle('getNick', () => bot.nickname)
ipcMain.handle('getUin', () => bot.uin)
ipcMain.handle('fetchMessage', (_, {roomId, offset}: { roomId: number, offset: number }) => {
    if (!offset) {
        storage.updateRoom(roomId, {
            unreadCount: 0,
            at: false,
        })
        if (roomId < 0) {
            const gid = -roomId
            const group = bot.gl.get(gid)
            if (group)
                ui.setShutUp(!!group.shutup_time_me)
            else {
                ui.setShutUp(true)
                ui.message('你已经不是群成员了')
            }
        } else {
            ui.setShutUp(false)
        }
    }
    return storage.fetchMessages(roomId, offset, 20)
})
ipcMain.on('setSelectedRoomId', (_, id: number) => selectedRoomId = id)
ipcMain.on('updateRoom', (_, roomId: number, room: object) => storage.updateRoom(roomId, room))
ipcMain.on('ignoreChat', (_, data: IgnoreChatInfo) => {
//todo use storage
})

export const getBot = () => bot
export const getStorage = () => storage
export const getGroupFileMeta = (gin: number, fid: string) => bot.acquireGfs(gin).download(fid)

