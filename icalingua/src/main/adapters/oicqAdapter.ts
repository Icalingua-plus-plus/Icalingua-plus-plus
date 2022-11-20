import MongoStorageProvider from '@icalingua/storage-providers/MongoStorageProvider'
import RedisStorageProvider from '@icalingua/storage-providers/RedisStorageProvider'
import SQLStorageProvider from '@icalingua/storage-providers/SQLStorageProvider'
import Adapter, { CookiesDomain } from '@icalingua/types/Adapter'
import BilibiliMiniApp from '@icalingua/types/BilibiliMiniApp'
import IgnoreChatInfo from '@icalingua/types/IgnoreChatInfo'
import LoginForm from '@icalingua/types/LoginForm'
import Message from '@icalingua/types/Message'
import RoamingStamp from '@icalingua/types/RoamingStamp'
import Room from '@icalingua/types/Room'
import SearchableFriend from '@icalingua/types/SearchableFriend'
import SendMessageParams from '@icalingua/types/SendMessageParams'
import StorageProvider from '@icalingua/types/StorageProvider'
import StructMessageCard from '@icalingua/types/StructMessageCard'
import { app, dialog, Notification as ElectronNotification } from 'electron'
import { Notification } from 'freedesktop-notifications'
import fs from 'fs'
import { base64decode } from 'nodejs-base64'
import {
    Client,
    createClient,
    DeviceEventData,
    FakeMessage,
    FriendAddEventData,
    FriendDecreaseEventData,
    FriendIncreaseEventData,
    FriendInfo,
    FriendPokeEventData,
    FriendRecallEventData,
    Gfs,
    GroupAddEventData,
    GroupAdminEventData,
    GroupInfo,
    GroupInviteEventData,
    GroupMessageEventData,
    GroupMuteEventData,
    GroupPokeEventData,
    GroupRecallEventData,
    GroupSettingEventData,
    GroupTransferEventData,
    MemberBaseInfo,
    MemberDecreaseEventData,
    MemberIncreaseEventData,
    MemberInfo,
    MessageElem,
    MessageEventData,
    OfflineEventData,
    PrivateMessageEventData,
    QrcodeEventData,
    Ret,
    SyncMessageEventData,
    SyncReadedEventData,
} from 'oicq-icalingua-plus-plus'
import path from 'path'
import createRoom from '../../utils/createRoom'
import formatDate from '../../utils/formatDate'
import getAvatarUrl from '../../utils/getAvatarUrl'
import getImageUrlByMd5 from '../../utils/getImageUrlByMd5'
import getStaticPath from '../../utils/getStaticPath'
import { newIcalinguaWindow } from '../../utils/IcalinguaWindow'
import sleep from '../../utils/sleep'
import { getUin } from '../ipc/botAndStorage'
import { download } from '../ipc/downloadManager'
import { updateAppMenu } from '../ipc/menuManager'
import socketIoProvider from '../providers/socketIoProvider'
import avatarCache from '../utils/avatarCache'
import { getConfig, saveConfigFile } from '../utils/configManager'
import errorHandler from '../utils/errorHandler'
import getBuildInfo from '../utils/getBuildInfo'
import isInlineReplySupported from '../utils/isInlineReplySupported'
import processMessage from '../utils/processMessage'
import { createTray, updateTrayIcon } from '../utils/trayManager'
import ui from '../utils/ui'
import { checkUpdate, getCachedUpdate } from '../utils/updateChecker'
import { getMainWindow, loadMainWindow, sendToLoginWindow, showRequestWindow, showWindow } from '../utils/windowManager'

let bot: Client
let storage: StorageProvider
let loginForm: LoginForm
let loginError: boolean = false

let currentLoadedMessagesCount = 0
let loggedIn = false
let stopFetching = false

let lastReceivedMessageInfo = {
    timestamp: 0,
    id: 0,
}

//region event handlers
const eventHandlers = {
    async onQQMessage(data: MessageEventData | SyncMessageEventData) {
        if (data.time !== lastReceivedMessageInfo.timestamp) {
            lastReceivedMessageInfo.timestamp = data.time
            lastReceivedMessageInfo.id = 0
        }
        const now = new Date(data.time * 1000)
        const groupId = (data as GroupMessageEventData).group_id
        const senderId = data.sender.user_id
        let roomId = groupId ? -groupId : data.user_id
        if (await storage.isChatIgnored(roomId)) return
        const isSelfMsg = bot.uin === senderId
        let senderName: string
        if (groupId && (<GroupMessageEventData>data).anonymous)
            senderName = (<GroupMessageEventData>data).anonymous.name
        else if (groupId && isSelfMsg) senderName = 'You'
        else if (groupId) senderName = (data.sender as MemberBaseInfo).card || data.sender.nickname
        else senderName = (data.sender as FriendInfo).remark || data.sender.nickname
        let roomName = 'group_name' in data ? data.group_name : senderName

        const message: Message = {
            senderId: senderId,
            username: senderName,
            content: '',
            timestamp: formatDate('hh:mm:ss', now),
            date: formatDate('yyyy/MM/dd', now),
            _id: data.message_id,
            role: (data.sender as MemberBaseInfo).role,
            title: groupId && (<GroupMessageEventData>data).anonymous ? '匿名' : (data.sender as MemberBaseInfo).title,
            files: [],
            anonymousId:
                groupId && (<GroupMessageEventData>data).anonymous ? (<GroupMessageEventData>data).anonymous.id : null,
            anonymousflag:
                groupId && (<GroupMessageEventData>data).anonymous
                    ? (<GroupMessageEventData>data).anonymous.flag
                    : null,
        }

        let room = await storage.getRoom(roomId)
        if (!room) {
            if (groupId) {
                const group = bot.gl.get(groupId)
                if (group && group.group_name !== roomName) roomName = group.group_name
            } else if (data.post_type === 'sync') {
                const info = await adapter.getFriendInfo(data.user_id)
                roomName = info.remark || info.nickname
            }
            // create room
            room = createRoom(roomId, roomName)
            await storage.addRoom(room)
        } else {
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

        // 鬼知道服务器改了什么，收到的语言消息有时候没有 url，尝试重新获取
        if (message.content === '[语音下载失败]undefined') {
            const regetMsg = await adapter.getMsg(data.message_id)
            if (!regetMsg.error && regetMsg.data) {
                message.content = ''
                await processMessage(regetMsg.data.message, message, lastMessage, roomId)
            }
        }

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
            (!getMainWindow().isFocused() || !getMainWindow().isVisible() || roomId !== ui.getSelectedRoomId()) &&
            (room.priority >= getConfig().priority || at) &&
            !isSelfMsg
        ) {
            //notification
            try {
                if (process.platform === 'darwin' || process.platform === 'win32') {
                    if (ElectronNotification.isSupported()) {
                        const notif = new ElectronNotification({
                            title: room.roomName,
                            body: (groupId ? senderName + ': ' : '') + lastMessage.content,
                            hasReply: true,
                            replyPlaceholder: 'Reply to ' + room.roomName,
                            icon: await avatarCache(getAvatarUrl(roomId, true)),
                            actions: [
                                {
                                    text: '标为已读',
                                    type: 'button',
                                },
                            ],
                        })
                        notif.on('click', () => {
                            notif.close()
                            showWindow()
                            ui.chroom(room.roomId)
                        })
                        notif.on('action', () => adapter.clearRoomUnread(room.roomId))
                        notif.on('reply', (e, r) => {
                            adapter.clearRoomUnread(room.roomId)
                            adapter.sendMessage({
                                content: r,
                                roomId: room.roomId,
                                at: [],
                            })
                        })
                        if (process.platform === 'win32') {
                            notif.on('close', () => {
                                notif.close()
                            })
                        }
                        notif.show()
                    }
                } else {
                    const actions = {
                        default: '',
                        read: '标为已读',
                    }
                    if (await isInlineReplySupported()) actions['inline-reply'] = '回复...'

                    const notifParams = {
                        summary: room.roomName,
                        appName: 'Icalingua++',
                        category: 'im.received',
                        'desktop-entry': 'icalingua',
                        urgency: 1,
                        timeout: 5000,
                        body: (groupId ? senderName + ': ' : '') + lastMessage.content,
                        icon: await avatarCache(getAvatarUrl(roomId, true)),
                        'x-kde-reply-placeholder-text': '发送到 ' + room.roomName,
                        'x-kde-reply-submit-button-text': '发送',
                        actions,
                    }
                    if (message.file && message.file.type.startsWith('image/'))
                        notifParams['x-kde-urls'] = await avatarCache(message.file.url)
                    const notif = new Notification(notifParams)
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
            } catch (e) {
                console.error(e)
                ui.messageError('通知发送失败' + JSON.stringify({ error: e }))
            }
        }

        if (room.roomId === ui.getSelectedRoomId() && getMainWindow().isFocused()) {
            //当前处于此会话界面
            adapter.reportRead(data.message_id)
            room.at = room.at && !isSelfMsg
        } else if (isSelfMsg) {
            room.unreadCount = 0
            room.at = false
        } else room.unreadCount++
        // 加上同一秒收到消息的id，防止消息乱序
        room.utime = data.time * 1000 + lastReceivedMessageInfo.id
        room.lastMessage = lastMessage
        if (message.file && message.file.name && room.autoDownload) {
            download(message.file.url, message.file.name, room.downloadPath)
        }
        message.time = data.time * 1000 + lastReceivedMessageInfo.id
        lastReceivedMessageInfo.id++
        if (await storage.isChatIgnored(senderId)) message.hide = true
        ui.addMessage(room.roomId, message)
        ui.updateRoom(room)
        storage.addMessage(roomId, message)
        await storage.updateRoom(roomId, room)
        updateTrayIcon()
        if (getConfig().custom) {
            if (!bot['sendPrivateMsg']) {
                bot['sendPrivateMsg'] = async (
                    user_id: number,
                    message: MessageElem[] | string,
                    auto_escape?: boolean,
                ) => {
                    let custom_room = await storage.getRoom(user_id)
                    if (typeof message === 'string') message = [{ type: 'text', data: { text: message } }]
                    const _message: Message = {
                        _id: '',
                        senderId: bot.uin,
                        username: 'You',
                        content: '',
                        timestamp: formatDate('hh:mm:ss'),
                        date: formatDate('yyyy/MM/dd'),
                        files: [],
                    }
                    let data = await bot._sendPrivateMsg(user_id, message, auto_escape)
                    await processMessage(message, _message, {}, user_id)
                    custom_room.lastMessage = {
                        content: _message.content,
                        timestamp: formatDate('hh:mm'),
                    }
                    if (user_id === bot.uin || user_id === 3636666661) return data
                    _message._id = data.data.message_id
                    const parsed = Buffer.from(data.data.message_id, 'base64')
                    const _time = parsed.readUInt32BE(12)
                    if (_time !== lastReceivedMessageInfo.timestamp) {
                        lastReceivedMessageInfo.timestamp = _time
                        lastReceivedMessageInfo.id = 0
                    }
                    custom_room.utime = _time * 1000 + lastReceivedMessageInfo.id
                    _message.time = _time * 1000 + lastReceivedMessageInfo.id
                    _message.timestamp = formatDate('hh:mm:ss', new Date(_time * 1000))
                    lastReceivedMessageInfo.id++
                    ui.updateRoom(custom_room)
                    ui.addMessage(custom_room.roomId, _message)
                    storage.addMessage(user_id, _message)
                    storage.updateRoom(custom_room.roomId, {
                        utime: custom_room.utime,
                        lastMessage: custom_room.lastMessage,
                    })
                    return data
                }
            }
            const custom_path = path.join(app.getPath('userData'), 'custom')
            const requireFunc = eval('require')
            try {
                requireFunc(custom_path).onMessage(data, bot)
            } catch (e) {
                ui.messageError('自定义插件出错')
                console.error(e)
            }
        }
    },
    friendRecall(data: FriendRecallEventData) {
        ui.deleteMessage(data.message_id)
        storage.updateMessage(data.user_id, data.message_id, { deleted: true, reveal: false })
    },
    groupRecall(data: GroupRecallEventData) {
        ui.deleteMessage(data.message_id)
        storage.updateMessage(-data.group_id, data.message_id, { deleted: true, reveal: false })
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
        if (await storage.isChatIgnored(roomId)) return
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
                timestamp: formatDate('hh:mm:ss'),
                date: formatDate('yyyy/MM/dd'),
                _id: data.time,
                system: true,
                time: data.time * 1000,
                files: [],
            }
            ui.addMessage(roomId, message)
            ui.updateRoom(room)
            storage.updateRoom(room.roomId, room)
            storage.addMessage(roomId, message)
        }
    },
    async groupPoke(data: GroupPokeEventData) {
        console.log(data)
        if (await storage.isChatIgnored(-data.group_id)) return
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
                timestamp: formatDate('hh:mm:ss'),
                date: formatDate('yyyy/MM/dd'),
                _id: data.time,
                system: true,
                time: data.time * 1000,
                files: [],
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
            timestamp: formatDate('hh:mm:ss', now),
            date: formatDate('yyyy/MM/dd', now),
            system: true,
            files: [],
        }
        let room = await storage.getRoom(roomId)
        if (!room) {
            const group = bot.gl.get(groupId)
            let roomName = groupId.toString()
            if (group && group.group_name) {
                roomName = group.group_name
            }
            // create room
            room = createRoom(roomId, roomName)
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
            content: data.dismiss
                ? '群解散了'
                : (data.member ? (data.member.card ? data.member.card : data.member.nickname) : data.user_id) +
                  (data.operator_id === data.user_id
                      ? ' 离开了本群'
                      : ` 被 ${operator.card ? operator.card : operator.nickname} 踢了`),
            username: data.member
                ? data.member.card
                    ? data.member.card
                    : data.member.nickname
                : data.user_id.toString(),
            senderId: data.operator_id,
            time: data.time * 1000,
            timestamp: formatDate('hh:mm:ss', now),
            date: formatDate('yyyy/MM/dd', now),
            system: true,
            files: [],
        }
        let room = await storage.getRoom(roomId)
        if (!room) {
            const group = bot.gl.get(groupId)
            let roomName = groupId.toString()
            if (group && group.group_name) {
                roomName = group.group_name
            }
            // create room
            room = createRoom(roomId, roomName)
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
        if (data.user_id === 0) muteAll = true
        else if (data.user_id === 80000000) mutedUserName = data.nickname
        else {
            const mutedUser = (await bot.getGroupMemberInfo(data.group_id, data.user_id)).data
            mutedUserName = mutedUser ? mutedUser.card || mutedUser.nickname : data.user_id.toString()
        }
        let content = `${operator.card || operator.nickname} `
        if (muteAll && data.duration > 0) content += '开启了全员禁言'
        else if (muteAll) content += '关闭了全员禁言'
        else if (data.duration === 0) content += `将 ${mutedUserName} 解除禁言`
        else content += `禁言 ${mutedUserName} ${data.duration / 60} 分钟`
        const message: Message = {
            _id: `mute-${now.getTime()}-${data.user_id}-${data.operator_id}`,
            content,
            username: operator.card || operator.nickname,
            senderId: data.operator_id,
            time: data.time * 1000,
            timestamp: formatDate('hh:mm:ss', now),
            date: formatDate('yyyy/MM/dd', now),
            system: true,
            files: [],
        }
        let room = await storage.getRoom(roomId)
        if (!room) {
            const group = bot.gl.get(data.group_id)
            let roomName = data.group_id.toString()
            if (group && group.group_name) {
                roomName = group.group_name
            }
            // create room
            room = createRoom(roomId, roomName)
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
    async groupSetting(data: GroupSettingEventData) {
        console.log(data)
        const roomId = -data.group_id
        if (await storage.isChatIgnored(roomId)) return
        const now = new Date(data.time * 1000)
        let content = '管理员修改了群设置： '
        content += (data.enable_anonymous ? '允许' : '禁止') + '匿名 | '
        content += (data.enable_upload_album ? '允许' : '禁止') + '群员上传相册 | '
        content += (data.enable_upload_file ? '允许' : '禁止') + '群员上传文件 | '
        content += (data.enable_temp_chat ? '允许' : '禁止') + '群内临时会话 | '
        content += (data.enable_new_group ? '允许' : '禁止') + '群员发起新群 | '
        content += (data.enable_confess ? '允许' : '禁止') + '群内坦白说 | '
        const message: Message = {
            _id: `setting-${now.getTime()}-${data.group_id}`,
            content,
            username: '群系统信息',
            senderId: 10000,
            time: data.time * 1000,
            timestamp: formatDate('hh:mm:ss', now),
            date: formatDate('yyyy/MM/dd', now),
            system: true,
            files: [],
        }
        let room = await storage.getRoom(roomId)
        if (!room) {
            const group = bot.gl.get(data.group_id)
            let roomName = data.group_id.toString()
            if (group && group.group_name) {
                roomName = group.group_name
            }
            // create room
            room = createRoom(roomId, roomName)
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
    async groupAdmin(data: GroupAdminEventData) {
        console.log(data)
        const roomId = -data.group_id
        if (await storage.isChatIgnored(roomId)) return
        const now = new Date(data.time * 1000)
        const newAdmin = (await bot.getGroupMemberInfo(data.group_id, data.user_id)).data
        let content = data.set
            ? `群主设置 ${newAdmin.card || newAdmin.nickname} 为管理员`
            : `群主取消了 ${newAdmin.card || newAdmin.nickname} 的管理员资格`
        const message: Message = {
            _id: `admin-${now.getTime()}-${data.group_id}-${data.user_id}`,
            content,
            username: '群系统信息',
            senderId: 10000,
            time: data.time * 1000,
            timestamp: formatDate('hh:mm:ss', now),
            date: formatDate('yyyy/MM/dd', now),
            system: true,
            files: [],
        }
        let room = await storage.getRoom(roomId)
        if (!room) {
            const group = bot.gl.get(data.group_id)
            let roomName = data.group_id.toString()
            if (group && group.group_name) {
                roomName = group.group_name
            }
            // create room
            room = createRoom(roomId, roomName)
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
    async groupTransfer(data: GroupTransferEventData) {
        console.log(data)
        const roomId = -data.group_id
        if (await storage.isChatIgnored(roomId)) return
        const now = new Date(data.time * 1000)
        const operator = (await bot.getGroupMemberInfo(data.group_id, data.operator_id)).data
        const transferredUser = (await bot.getGroupMemberInfo(data.group_id, data.user_id)).data
        let content = `${operator.card || operator.nickname} 将群转让给了 ${
            transferredUser.card || transferredUser.nickname
        }`
        const message: Message = {
            _id: `transfer-${now.getTime()}-${data.user_id}-${data.operator_id}`,
            content,
            username: operator.card || operator.nickname,
            senderId: data.operator_id,
            time: data.time * 1000,
            timestamp: formatDate('hh:mm:ss', now),
            date: formatDate('yyyy/MM/dd', now),
            system: true,
            files: [],
        }
        let room = await storage.getRoom(roomId)
        if (!room) {
            const group = bot.gl.get(data.group_id)
            let roomName = data.group_id.toString()
            if (group && group.group_name) {
                roomName = group.group_name
            }
            // create room
            room = createRoom(roomId, roomName)
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
            appName: 'Icalingua++',
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
            timestamp: formatDate('hh:mm:ss', now),
            date: formatDate('yyyy/MM/dd', now),
            system: true,
            files: [],
        }
        let room = await storage.getRoom(roomId)
        if (!room) {
            // create room
            room = createRoom(roomId, roomName)
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
            timestamp: formatDate('hh:mm:ss', now),
            date: formatDate('yyyy/MM/dd', now),
            system: true,
            files: [],
        }
        let room = await storage.getRoom(roomId)
        if (!room) {
            // create room
            room = createRoom(roomId, roomName)
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
        const veriWin = newIcalinguaWindow({
            height: 500,
            width: 500,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
            },
        })
        const inject = fs.readFileSync(path.join(getStaticPath(), '/sliderinj.js'), 'utf-8')
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
        loginError = true
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
            socketIoProvider.init()
        }
        if (loginForm.onlineStatus) {
            await bot.setOnlineStatus(loginForm.onlineStatus)
        }
        await updateAppMenu()
        await updateTrayIcon()
        if (!getConfig().fetchHistoryOnStart) return
        await sleep(3000)
        ui.message('正在获取历史消息')
        {
            const rooms = await storage.getAllRooms()
            for (const i of rooms) {
                if (new Date().getTime() - i.utime > 1000 * 60 * 60 * 24 * 2) break
                const roomId = i.roomId
                let buffer: Buffer
                let uid = roomId
                if (roomId < 0) {
                    buffer = Buffer.alloc(21)
                    uid = -uid
                } else buffer = Buffer.alloc(17)
                buffer.writeUInt32BE(uid, 0)
                adapter.fetchHistory(buffer.toString('base64'), roomId)
                await sleep(500)
            }
        }
        ui.messageSuccess('历史消息获取完成')
    },
    verify(data: DeviceEventData) {
        console.log(data)
        bot.sendSMSCode()
        sendToLoginWindow('smsCodeVerify', data)
    },
    qrcode(data: QrcodeEventData) {
        console.log(data)
        const url = 'data:image/png;base64,' + data.image.toString('base64')
        sendToLoginWindow('qrcodeLogin', url)
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
        storage.getAllRooms().then((e) => {
            e.forEach((e) => {
                //更新群的名称
                if (e.roomId > -1) return
                const group = bot.gl.get(-e.roomId)
                if (group && group.group_name !== e.roomName) {
                    storage.updateRoom(e.roomId, { roomName: group.group_name })
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
    bot.on('notice.group.setting', eventHandlers.groupSetting)
    bot.on('notice.group.admin', eventHandlers.groupAdmin)
    bot.on('notice.group.transfer', eventHandlers.groupTransfer)
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

    getGroupInfo(group_id: number): GroupInfo

    acquireGfs(group_id: number): Gfs
}

const adapter: OicqAdapter = {
    async getMsgNewURL(id: string): Promise<string> {
        const history = await adapter.getMsg(id)
        if (history.error) {
            errorHandler(history.error, true)
            if (history.error.message !== 'msg not exists') ui.messageError('错误：' + history.error.message)
            return 'error'
        }
        const data = history.data
        console.log(data)
        if (data) {
            const message: Message = {
                senderId: data.sender.user_id,
                username: data.sender.nickname,
                content: '',
                timestamp: formatDate('hh:mm:ss', new Date(data.time * 1000)),
                date: formatDate('yyyy/MM/dd', new Date(data.time * 1000)),
                _id: id,
                time: data.time * 1000,
                files: [],
            }
            await processMessage(data.message, message, {}, ui.getSelectedRoomId())
            if (message.file) {
                return message.file.url || 'error'
            }
        }
        return 'error'
    },
    async getGroup(gin): Promise<GroupInfo> {
        return bot.gl.get(gin)
    },
    acquireGfs(group_id: number) {
        return bot.acquireGfs(group_id)
    },
    getGroupInfo(group_id: number): GroupInfo {
        return bot.gl.get(group_id)
    },
    requestGfsToken(gin: number): Promise<string> {
        return Promise.resolve('')
    },
    async getUnreadRooms(): Promise<Room[]> {
        const rooms = await storage.getAllRooms()
        return rooms.filter((e) => e.unreadCount && e.priority >= getConfig().priority)
    },
    setGroupKick(gin: number, uin: number): any {
        bot.setGroupKick(gin, uin)
    },
    setGroupLeave(gin: number): any {
        bot.setGroupLeave(gin)
        if (ui.getSelectedRoomId() === gin) ui.setShutUp(true)
    },
    setGroupBan(gin: number, uin: number, duration?: number): any {
        bot.setGroupBan(gin, uin, duration)
    },
    setGroupAnonymousBan(gin: number, flag: string, duration?: number): any {
        bot.setGroupAnonymousBan(gin, flag, duration)
    },
    async makeForward(
        fakes: FakeMessage | Iterable<FakeMessage>,
        dm?: boolean,
        origin?: number,
        target?: number,
    ): Promise<any> {
        const xmlret = await bot.makeForwardMsg(fakes, dm, origin)
        if (xmlret.error) {
            errorHandler(xmlret.error, true)
            ui.messageError('错误：' + xmlret.error.message)
            return
        }
        if (!target) {
            ui.addMessageText(xmlret.data.data.data)
            ui.notify({
                title: '生成转发成功',
                message: '已在消息输入框中生成转发消息的 XML 对象，请使用鼠标中键单击发送按钮以发送此条转发消息。',
            })
        } else {
            adapter.sendMessage({
                content: xmlret.data.data.data,
                at: [],
                roomId: target,
                messageType: 'xml',
            })
        }
    },
    reportRead(messageId: string): any {
        bot.reportReaded(messageId)
    },
    async getGroupMembers(group: number): Promise<MemberInfo[]> {
        const data = (await bot.getGroupMemberList(group, true)).data
        if (!data) {
            ui.messageError('获取群成员列表失败')
            return []
        }
        const values = data.values()
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
                ...iterF.value,
                uin: iterF.value.user_id,
                nick: iterF.value.nickname,
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
            if (sysInfo) sysInfo += '\n\n'
            sysInfo += '新版本可用: ' + updateInfo.latestVersion
        }
        if (formatDate('MM-dd') === '11-20') {
            if (sysInfo) sysInfo += '\n\n'
            sysInfo += '11月20日是跨性别纪念日，纪念那些因暴力而不幸逝世的跨性别者们\n愿你也能被他人温柔以待'
        }
        ui.sendOnlineData({
            online: bot.isOnline(),
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
    async sendMessage({
        content,
        roomId,
        file,
        replyMessage,
        room,
        b64img,
        imgpath,
        at,
        sticker,
        messageType,
    }: SendMessageParams) {
        if (!messageType) {
            messageType = 'text'
        }
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
            //TODO: 在界面上反应上传进度
            gfs.upload(file.path, undefined, undefined, console.log).then(ui.closeLoading)
            ui.message('文件上传中')
            return
        }

        const message: Message = {
            _id: '',
            senderId: bot.uin,
            username: 'You',
            content,
            timestamp: formatDate('hh:mm:ss'),
            date: formatDate('yyyy/MM/dd'),
            files: [],
        }

        const chain: MessageElem[] = []

        if (messageType === 'anonymous') {
            if (roomId < 0)
                chain.push({
                    type: 'anonymous',
                    data: {
                        ignore: false, //匿名失败时不继续发送
                    },
                })
            messageType = 'text'
        }

        if (replyMessage) {
            message.replyMessage = {
                _id: replyMessage._id,
                username: replyMessage.username,
                content: replyMessage.content,
                files: [],
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
            for (const { text } of at) {
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
                if (at.find((e) => e.text === part)) {
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
                const atInfo = at.find((e) => e.text === part)
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
                else if (isFace) {
                    var temp: string = FACE_REGEX.exec(part)[1]
                    element = {
                        type: 'face',
                        data: {
                            id: Number.parseInt(temp, 10),
                        },
                    }
                } else if (messageType === 'text') {
                    element = {
                        type: 'text',
                        data: {
                            text: part,
                        },
                    }
                } else if (messageType === 'json') {
                    chain.length = 0
                    chain.push({
                        type: 'json',
                        data: {
                            data: content,
                        },
                    })
                    break
                } else if (messageType === 'xml') {
                    chain.length = 0
                    chain.push({
                        type: 'xml',
                        data: {
                            data: content,
                        },
                    })
                    break
                } else if (messageType === 'rps') {
                    chain.length = 0
                    chain.push({
                        type: 'rps',
                        data: {
                            id: parseInt(content),
                        },
                    })
                    break
                } else if (messageType === 'dice') {
                    chain.length = 0
                    chain.push({
                        type: 'dice',
                        data: {
                            id: parseInt(content),
                        },
                    })
                    break
                } else if (messageType === 'shake') {
                    chain.length = 0
                    chain.push({
                        type: 'shake',
                    })
                    break
                } else if (messageType === 'raw') {
                    // Only for debug
                    chain.length = 0
                    const rawMessage = JSON.parse(content)
                    chain.push(...rawMessage)
                    break
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
                url: imgpath && imgpath.startsWith('send_') ? imgpath.replace('send_', '') : b64img,
            }
            message.files.push(message.file)
        } else if (imgpath) {
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
            message.files.push(message.file)
        } else if (file) {
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
            message.files.push(message.file)
        }
        //发送消息链
        let data: Ret<{ message_id: string }>
        if (roomId > 0) data = await bot._sendPrivateMsg(roomId, chain, true)
        else data = await bot.sendGroupMsg(-roomId, chain, true)

        ui.closeLoading()
        if (data.error) {
            ui.notifyError({
                title: 'Failed to send',
                message: data.error.message,
            })
            ui.addMessageText(message.content)
            return
        }
        if (roomId > 0 && roomId !== bot.uin && roomId !== 3636666661) {
            console.log(data)
            room.lastMessage = {
                content,
                timestamp: formatDate('hh:mm'),
            }
            if (file || b64img || imgpath) room.lastMessage.content += '[Image]'
            let appurl
            let url
            if (messageType === 'xml') {
                message.code = message.content
                const urlRegex = /url="([^"]+)"/
                const resIdRegex = /m_resid="([\w+=/]+)"/
                const md5ImageRegex = /image [^<>]*md5="([A-F\d]{32})"/
                if (urlRegex.test(message.code)) appurl = message.code.match(urlRegex)[1].replace(/\\\//g, '/')
                if (message.code.includes('action="viewMultiMsg"') && resIdRegex.test(message.code)) {
                    const resId = message.code.match(resIdRegex)[1]
                    console.log(resId)
                    room.lastMessage.content = '[Forward multiple messages]'
                    message.content = `[Forward: ${resId}]`
                } else if (appurl) {
                    appurl = appurl.replace(/&amp;/g, '&')
                    room.lastMessage.content = appurl
                    message.content = appurl
                } else if (md5ImageRegex.test(message.code)) {
                    const imgMd5 = (appurl = message.code.match(md5ImageRegex)[1])
                    room.lastMessage.content = '[Image]'
                    url = getImageUrlByMd5(imgMd5)
                    message.file = {
                        type: 'image/jpeg',
                        url,
                    }
                    message.files.push(message.file)
                } else {
                    room.lastMessage.content = '[XML]'
                    message.content = '[XML]'
                }
            } else if (messageType === 'json') {
                const json: string = message.content
                message.code = json
                const jsonObj = JSON.parse(json)
                if (jsonObj.app === 'com.tencent.mannounce') {
                    try {
                        const title = base64decode(jsonObj.meta.mannounce.title)
                        const content = base64decode(jsonObj.meta.mannounce.text)
                        room.lastMessage.content = `[${title}]`
                        message.content = title + '\n\n' + content
                    } catch (err) {}
                }
                const biliRegex = /(https?:\\?\/\\?\/b23\.tv\\?\/\w*)\??/
                const zhihuRegex = /(https?:\\?\/\\?\/\w*\.?zhihu\.com\\?\/[^?"=]*)\??/
                const biliRegex2 = /(https?:\\?\/\\?\/\w*\.?bilibili\.com\\?\/[^?"=]*)\??/
                const jsonLinkRegex = /{.*"app":"com.tencent.structmsg".*"jumpUrl":"(https?:\\?\/\\?\/[^",]*)".*}/
                const jsonAppLinkRegex = /"contentJumpUrl": ?"(https?:\\?\/\\?\/[^",]*)"/
                if (biliRegex.test(json)) appurl = json.match(biliRegex)[1].replace(/\\\//g, '/')
                else if (biliRegex2.test(json)) appurl = json.match(biliRegex2)[1].replace(/\\\//g, '/')
                else if (zhihuRegex.test(json)) appurl = json.match(zhihuRegex)[1].replace(/\\\//g, '/')
                else if (jsonLinkRegex.test(json)) appurl = json.match(jsonLinkRegex)[1].replace(/\\\//g, '/')
                else if (jsonAppLinkRegex.test(json)) appurl = json.match(jsonAppLinkRegex)[1].replace(/\\\//g, '/')
                else {
                    //作为一般通过小程序解析内部 URL，像腾讯文档就可以
                    try {
                        const meta = (<BilibiliMiniApp>jsonObj).meta.detail_1
                        appurl = meta.qqdocurl
                    } catch (e) {}
                }
                if (appurl) {
                    room.lastMessage.content = ''
                    message.content = ''
                    try {
                        const meta = (<BilibiliMiniApp>jsonObj).meta.detail_1 || (<StructMessageCard>jsonObj).meta.news
                        room.lastMessage.content = meta.desc + ' '
                        message.content = meta.desc + '\n\n'

                        let previewUrl = meta.preview
                        if (!previewUrl.toLowerCase().startsWith('http')) {
                            previewUrl = 'https://' + previewUrl
                        }
                        message.file = {
                            type: 'image/jpeg',
                            url: previewUrl,
                        }
                        message.files.push(message.file)
                    } catch (e) {}

                    room.lastMessage.content += appurl
                    message.content += appurl
                } else {
                    room.lastMessage.content = '[JSON]'
                    message.content = '[JSON]'
                }
            } else if (messageType === 'rps') {
                const rps = ['石头', '剪刀', '布']
                room.lastMessage.content = '[猜拳]'
                message.content = '[猜拳]' + rps[parseInt(content) - 1]
            } else if (messageType === 'dice') {
                room.lastMessage.content = '[随机骰子]'
                message.content = '[随机骰子]点数' + content
            } else if (messageType === 'raw') {
                message.content = ''
                await processMessage(chain, message, {}, roomId)
                room.lastMessage.content = '[DEBUG]' + message.content
            }
            message._id = data.data.message_id
            const parsed = Buffer.from(data.data.message_id, 'base64')
            const _time = parsed.readUInt32BE(12)
            if (_time !== lastReceivedMessageInfo.timestamp) {
                lastReceivedMessageInfo.timestamp = _time
                lastReceivedMessageInfo.id = 0
            }
            room.utime = _time * 1000 + lastReceivedMessageInfo.id
            message.time = _time * 1000 + lastReceivedMessageInfo.id
            message.timestamp = formatDate('hh:mm:ss', new Date(_time * 1000))
            lastReceivedMessageInfo.id++
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
        if (!bot || form.username != bot.uin || loginError) {
            loginError = false
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
            const f = { ...iterG.value }
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
                const currentTimeStamp = Math.floor(Date.now() / 1000)
                if (group) ui.setShutUp(group.shutup_time_me !== 0 && group.shutup_time_me > currentTimeStamp)
                else {
                    ui.setShutUp(true)
                    ui.message('你已经不是群成员了')
                }
            } else {
                ui.setShutUp(false)
            }
        }
        currentLoadedMessagesCount = offset + 20
        const messages = (await storage.fetchMessages(roomId, offset, 20)) || []
        if (messages.length && !offset && typeof messages[messages.length - 1]._id === 'string')
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
        if (res.error?.code === 1002) ui.messageError('对方已关闭头像双击功能')
    },
    addRoom(room: Room) {
        return storage.addRoom(room)
    },
    async getForwardMsg(resId: string, fileName?: string): Promise<Message[]> {
        const history = await bot.getForwardMsg(resId, fileName)
        if (history.error) {
            console.log(history.error)
            const res: [Message] = [
                {
                    senderId: 0,
                    username: '错误',
                    content: history.error.message,
                    timestamp: formatDate('hh:mm:ss'),
                    date: formatDate('yyyy/MM/dd'),
                    _id: 0,
                    time: 0,
                    files: [],
                },
            ]
            return res
        }
        const messages = []
        for (let i = 0; i < history.data.length; i++) {
            const data = history.data[i]
            const message: Message = {
                senderId: data.user_id,
                username: data.nickname,
                content: '',
                timestamp: formatDate('hh:mm:ss', new Date(data.time * 1000)),
                date: formatDate('yyyy/MM/dd', new Date(data.time * 1000)),
                _id: data.group_id || -1,
                time: data.time * 1000,
                files: [],
            }
            await processMessage(data.message, message, {}, ui.getSelectedRoomId())
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
        if (bot) bot.logout()
    },
    getMessageFromStorage: (roomId: number, msgId: string) => storage.getMessage(roomId, msgId),
    getMsg: (id: string) => bot.getMsg(id),

    async clearCurrentRoomUnread() {
        if (!ui.getSelectedRoomId()) return
        await adapter.clearRoomUnread(ui.getSelectedRoomId())
    },
    async clearRoomUnread(roomId: number) {
        ui.clearRoomUnread(roomId)
        await storage.updateRoom(roomId, { unreadCount: 0, at: false })
        await updateTrayIcon()
    },
    async setRoomPriority(roomId: number, priority: 1 | 2 | 3 | 4 | 5) {
        await storage.updateRoom(roomId, { priority })
        ui.setAllRooms(await storage.getAllRooms())
    },
    async setRoomAutoDownload(roomId: number, autoDownload: boolean) {
        await storage.updateRoom(roomId, { autoDownload })
    },
    async setRoomAutoDownloadPath(roomId: number, downloadPath: string) {
        await storage.updateRoom(roomId, { downloadPath })
    },
    async pinRoom(roomId: number, pin: boolean) {
        await storage.updateRoom(roomId, { index: pin ? 1 : 0 })
        ui.setAllRooms(await storage.getAllRooms())
    },
    async ignoreChat(data: IgnoreChatInfo) {
        await storage.addIgnoredChat(data)
        await adapter.removeChat(data.id)
    },
    async removeChat(roomId: number) {
        await storage.removeRoom(roomId)
        ui.setAllRooms(await storage.getAllRooms())
        ui.chroom(0)
    },
    async deleteMessage(roomId: number, messageId: string) {
        const res = await bot.deleteMsg(messageId)
        console.log(res)
        if (!res.error) {
            ui.deleteMessage(messageId)
            await storage.updateMessage(roomId, messageId, { deleted: true, reveal: false })
        } else {
            ui.notifyError({
                title: 'Failed to delete message',
                message: res.error.message,
            })
        }
    },
    async hideMessage(roomId: number, messageId: string) {
        ui.hideMessage(messageId)
        await storage.updateMessage(roomId, messageId, { hide: true, reveal: false })
    },
    async revealMessage(roomId: number, messageId: string | number) {
        ui.revealMessage(messageId)
        await storage.updateMessage(roomId, messageId, { hide: false, reveal: true })
    },
    async renewMessageURL(roomId: number, messageId: string | number, URL) {
        ui.renewMessageURL(messageId, URL)
    },
    async renewMessage(roomId: number, messageId: string, message: Message) {
        const res = await adapter.getMsg(messageId)
        if (!res.error) {
            const data = res.data
            const newMessage: Message = {
                senderId: message.senderId,
                username: message.username,
                content: '',
                timestamp: message.timestamp,
                date: message.date,
                _id: messageId,
                time: message.time,
                role: message.role,
                title: message.title,
                files: [],
                anonymousId: message.anonymousId,
                anonymousflag: message.anonymousflag,
            }
            try {
                await processMessage(data.message, newMessage, {}, roomId)
                await storage.replaceMessage(roomId, messageId, newMessage)
                if (roomId === ui.getSelectedRoomId()) ui.renewMessage(roomId, messageId, newMessage)
            } catch (e) {
                errorHandler(e, true)
            }
        } else {
            errorHandler(res.error, true)
            if (res.error.message !== 'msg not exists') ui.messageError('错误：' + res.error.message)
            else ui.messageError('错误：该消息不存在。')
        }
    },
    stopFetchingHistory() {
        stopFetching = true
    },
    async fetchHistory(messageId: string, roomId: number = ui.getSelectedRoomId()) {
        let lastMessage = {}
        let lastMessageTime = 0
        const fetchLoop = async (limit?: number) => {
            const messages = []
            let done = false
            let first_loop = true
            while (true) {
                if (stopFetching) {
                    stopFetching = false
                    done = true
                    break
                }
                const history = await bot.getChatHistory(messageId)
                if (history.error) {
                    errorHandler(history.error, true)
                    if (history.error.message !== 'msg not exists') ui.messageError('错误：' + history.error.message)
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
                        timestamp: formatDate('hh:mm:ss', new Date(data.time * 1000)),
                        date: formatDate('yyyy/MM/dd', new Date(data.time * 1000)),
                        _id: data.message_id,
                        time: data.time * 1000,
                        role: (data.sender as MemberBaseInfo).role,
                        title:
                            (<GroupMessageEventData>data).group_id && (<GroupMessageEventData>data).anonymous
                                ? '匿名'
                                : (data.sender as MemberBaseInfo).title,
                        files: [],
                        anonymousId:
                            (<GroupMessageEventData>data).group_id && (<GroupMessageEventData>data).anonymous
                                ? (<GroupMessageEventData>data).anonymous.id
                                : null,
                        anonymousflag:
                            (<GroupMessageEventData>data).group_id && (<GroupMessageEventData>data).anonymous
                                ? (<GroupMessageEventData>data).anonymous.flag
                                : null,
                    }
                    try {
                        const retData = await processMessage(data.message, message, {}, roomId)

                        messages.push(message)
                        newMsgs.push(message)
                        console.log(retData)
                        if (first_loop) {
                            lastMessage = Object.assign(Object.assign({}, retData.message), retData.lastMessage, {
                                username: getUin() == retData.message.senderId ? 'You' : retData.message.username,
                                timestamp: formatDate('hh:mm', new Date(retData.message.time)),
                            })
                            lastMessageTime = retData.message.time
                        }
                    } catch (e) {
                        errorHandler(e, true)
                    }
                }
                first_loop = false
                ui.addHistoryCount(newMsgs.length)
                if (history.data.length < 2) {
                    done = true
                    break
                }
                messageId = newMsgs[0]._id as string
                const firstOwnMsg =
                    roomId < 0
                        ? newMsgs[0] //群的话只要第一条消息就行
                        : newMsgs.find((e) => e.senderId == bot.uin)
                if (!firstOwnMsg || (await storage.getMessage(roomId, firstOwnMsg._id as string))) {
                    done = true
                    break
                }
                if (limit && messages.length > limit) break
            }
            return { messages, done }
        }
        const { messages, done } = await fetchLoop(60)
        await storage.addMessages(roomId, messages)
        if (roomId === ui.getSelectedRoomId())
            storage.fetchMessages(roomId, 0, currentLoadedMessagesCount + 20).then(ui.setMessages)
        if (done) {
            ui.messageSuccess(`已拉取 ${messages.length} 条消息`)
            ui.clearHistoryCount()
        } else {
            ui.message(`已拉取 ${messages.length} 条消息，正在后台继续拉取`)
            {
                const { messages } = await fetchLoop()
                await storage.addMessages(roomId, messages)
                ui.messageSuccess(`已拉取 ${messages.length} 条消息`)
                ui.clearHistoryCount()
            }
        }

        // 更新最近消息
        if (!messages.length) return
        let room = await storage.getRoom(roomId)
        if (room.utime > lastMessageTime) return
        room.lastMessage = lastMessage
        room.utime = lastMessageTime
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
            ret_msg[flag] = { ...msgs[index] }
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
    submitSmsCode(smsCode: string) {
        bot.submitSMSCode(smsCode)
    },
    randomDevice(username: number) {
        const filepath = path.join(app.getPath('userData'), 'data', String(username))
        const devicepath = path.join(filepath, `device-${String(username)}.json`)
        const randomString = (length: number, num: boolean = false) => {
            let result = ''
            const map = num ? '0123456789' : '0123456789abcdef'
            for (let i = length; i > 0; --i) result += map[Math.floor(Math.random() * map.length)]
            return result
        }
        const device = `{
        "--begin--":    "该设备文件为尝试解决${username}的风控时随机生成。",
        "product":      "ILPP-${randomString(5).toUpperCase()}",
        "device":       "${randomString(5).toUpperCase()}",
        "board":        "${randomString(5).toUpperCase()}",
        "brand":        "${randomString(4).toUpperCase()}",
        "model":        "ILPP ${randomString(4).toUpperCase()}",
        "wifi_ssid":    "HUAWEI-${randomString(7)}",
        "bootloader":   "U-boot",
        "android_id":   "IL.${randomString(7, true)}.${randomString(4, true)}",
        "boot_id":      "${randomString(8)}-${randomString(4)}-${randomString(4)}-${randomString(4)}-${randomString(
            12,
        )}",
        "proc_version": "Linux version 5.10.101-android12-${randomString(8)}",
        "mac_address":  "2D:${randomString(2).toUpperCase()}:${randomString(2).toUpperCase()}:${randomString(
            2,
        ).toUpperCase()}:${randomString(2).toUpperCase()}:${randomString(2).toUpperCase()}",
        "ip_address":   "192.168.${randomString(2, true)}.${randomString(2, true)}",
        "imei":         "86${randomString(13, true)}",
        "incremental":  "${randomString(10).toUpperCase()}",
        "--end--":      "修改后可能需要重新验证设备。"
    }`
        if (fs.existsSync(filepath)) {
            fs.rmSync(filepath, { recursive: true, force: true })
        }
        fs.mkdirSync(filepath, { recursive: true, mode: 0o755 })
        fs.writeFileSync(devicepath, device, { mode: 0o600 })
    },
    async sendPacket(type: string, cmd: string, body: any): Promise<Buffer> {
        if (type === 'Uni') return await bot.sendUni(cmd, body)
        else return await bot.sendOidb(cmd, body)
    },
}

export default adapter
