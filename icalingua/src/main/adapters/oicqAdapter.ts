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
import { faceIdToLottie } from '@icalingua/types/LottieFaceType'
import { app, dialog, Notification as ElectronNotification } from 'electron'
import { Notification } from 'freedesktop-notifications'
import fs from 'fs'
import crypto from 'crypto'
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
    GroupEssenceEventData,
    GroupInfo,
    GroupInviteEventData,
    GroupMessageEventData,
    GroupMuteEventData,
    GroupPokeEventData,
    GroupRecallEventData,
    GroupSettingEventData,
    GroupSignEventData,
    GroupTitleEventData,
    GroupTransferEventData,
    MemberBaseInfo,
    MemberDecreaseEventData,
    MemberIncreaseEventData,
    MemberInfo,
    MessageElem,
    MessageEventData,
    OfflineEventData,
    pb,
    PrivateMessageEventData,
    QrcodeEventData,
    Ret,
    Sendable,
    SyncMessageEventData,
    SyncReadedEventData,
    SyncRemarkEventData,
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
import {
    getMainWindow,
    isAppLocked,
    loadMainWindow,
    sendToLoginWindow,
    showLoginWindow,
    showRequestWindow,
    tryToShowAllWindows,
} from '../utils/windowManager'
import ChatGroup from '@icalingua/types/ChatGroup'
import SpecialFeature from '@icalingua/types/SpecialFeature'
import { LoginErrorEventData } from 'oicq-icalingua-plus-plus'
import { SliderEventData } from 'oicq-icalingua-plus-plus'
import removeGroupNameEmotes from '../../utils/removeGroupNameEmotes'
import { spacingNotification } from '../../utils/panguSpacing'
import formatDuration from '../../utils/formatDuration'

let bot: Client
let storage: StorageProvider
let loginForm: LoginForm
let loginError: boolean = false
let _sendPrivateMsg: {
    (user_id: number, message: Sendable, auto_escape?: boolean): Promise<Ret<{ message_id: string }>>
}

let currentLoadedMessagesCount = 0
let loggedIn = false
let stopFetching = false

let lastReceivedMessageInfo = {
    timestamp: 0,
    id: 0,
}

let isAutoFetching = false

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
        let roomName = 'group_name' in data ? data.group_remark || data.group_name : senderName

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
            bubble_id: data.bubble_id,
            subid: data.sender['subid'],
        }

        let room = await storage.getRoom(roomId)
        if (!room) {
            if (groupId) {
                const group = bot.gl.get(groupId)
                if (group) {
                    roomName = group.group_remark || group.group_name
                }
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
            userId: senderId,
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

        if (
            !isAppLocked() &&
            (!getMainWindow().isFocused() || !getMainWindow().isVisible() || roomId !== ui.getSelectedRoomId()) &&
            (room.priority >= getConfig().priority || at === true || (at && !getConfig().disableAtAll)) &&
            !isSelfMsg &&
            !getConfig().disableNotification
        ) {
            const notifRoomName =
                room.roomId < 0 && getConfig().removeGroupNameEmotes
                    ? removeGroupNameEmotes(room.roomName)
                    : room.roomName
            const notifMessageContent = getConfig().usePanguJsRecv
                ? spacingNotification(lastMessage.content)
                : lastMessage.content
            // notification
            if (lastMessage.content === '[窗口抖动]') {
                tryToShowAllWindows()
                ui.chroom(room.roomId)
            }
            try {
                if (process.platform === 'darwin' || process.platform === 'win32') {
                    if (ElectronNotification.isSupported()) {
                        const notif = new ElectronNotification({
                            title: notifRoomName,
                            body: (groupId ? senderName + ': ' : '') + notifMessageContent,
                            hasReply: true,
                            replyPlaceholder: 'Reply to ' + notifRoomName,
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
                            tryToShowAllWindows()
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
                        summary: notifRoomName,
                        appName: 'Icalingua++',
                        category: 'im.received',
                        'desktop-entry': 'icalingua',
                        urgency: 1,
                        timeout: 5000,
                        body: (groupId ? senderName + ': ' : '') + notifMessageContent,
                        icon: await avatarCache(getAvatarUrl(roomId, true)),
                        'x-kde-reply-placeholder-text': '发送到 ' + notifRoomName,
                        'x-kde-reply-submit-button-text': '发送',
                        actions,
                    }
                    if (message.file && message.file.type.startsWith('image/'))
                        notifParams['x-kde-urls'] = await avatarCache(message.file.url)
                    const notif = new Notification(notifParams)
                    notif.on('action', (action: string) => {
                        switch (action) {
                            case 'default':
                                tryToShowAllWindows()
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
                errorHandler(e, true)
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
        if (
            message.file &&
            message.file.name &&
            room.autoDownload &&
            !(message.file.url === message.file.name && (message.file.type || '').toLowerCase().includes('audio/'))
        ) {
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
        if (getConfig().custom && data.post_type === 'message') {
            const custom_path = path.join(app.getPath('userData'), 'custom')
            const requireFunc = eval('require')
            try {
                requireFunc(custom_path).onMessage(data, bot, { storage, ui })
            } catch (e) {
                ui.messageError('自定义插件出错')
                errorHandler(e, true)
            }
        }
    },
    friendRecall(data: FriendRecallEventData) {
        const recallInfo = {
            time: Date.now(),
            operator_id: String(data.operator_id),
        }
        //ui.deleteMessage(data.message_id)
        ui.renewMessage(data.user_id, data.message_id, {
            deleted: true,
            reveal: false,
            recallInfo: JSON.stringify(recallInfo),
        })
        storage.updateMessage(data.user_id, data.message_id, {
            deleted: true,
            reveal: false,
            recallInfo: JSON.stringify(recallInfo),
        })
    },
    async groupRecall(data: GroupRecallEventData) {
        const operator = (await bot.getGroupMemberInfo(data.group_id, data.operator_id)).data
        const recallInfo = {
            time: Date.now(),
            operator_id: String(data.operator_id),
        }
        if (operator) {
            recallInfo.operator_id = `${operator.card || operator.nickname}(${data.operator_id})`
        }
        //ui.deleteMessage(data.message_id)
        ui.renewMessage(-data.group_id, data.message_id, {
            deleted: true,
            reveal: false,
            recallInfo: JSON.stringify(recallInfo),
        })
        storage.updateMessage(-data.group_id, data.message_id, {
            deleted: true,
            reveal: false,
            recallInfo: JSON.stringify(recallInfo),
        })
    },
    online() {
        ui.setOnline()
    },
    onOffline(data: OfflineEventData) {
        console.log(data)
        ui.setOffline(data.message)
        const onlineInterval = setInterval(() => {
            if (bot.isOnline()) {
                ui.setOnline()
                clearInterval(onlineInterval)
            }
        }, 1000 * 10)
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
                userId: data.operator_id,
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
            const operator = operatorObj
                ? operatorObj.card
                    ? operatorObj.card
                    : operatorObj.nickname
                : data.operator_id
            const userObj = (await bot.getGroupMemberInfo(data.group_id, data.user_id, false)).data
            const user = userObj ? (userObj.card ? userObj.card : userObj.nickname) : data.user_id
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
                userId: data.operator_id,
            }
            const message: Message = {
                username: '',
                content: msg,
                senderId: data.operator_id,
                timestamp: formatDate('hh:mm:ss'),
                date: formatDate('yyyy/MM/dd'),
                _id: `poke-${data.time * 1000}-${data.group_id}-${data.user_id}`,
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
    async groupSign(data: GroupSignEventData) {
        console.log(data)
        if (await storage.isChatIgnored(-data.group_id)) return
        const room = await storage.getRoom(-data.group_id)
        if (room) {
            room.utime = data.time * 1000
            let msg = `${data.nickname} (${data.user_id}) ${data.sign_text}`
            room.lastMessage = {
                content: msg,
                username: null,
                timestamp: formatDate('hh:mm'),
                userId: data.user_id,
            }
            const message: Message = {
                username: '',
                content: msg,
                senderId: data.user_id,
                timestamp: formatDate('hh:mm:ss'),
                date: formatDate('yyyy/MM/dd'),
                _id: `sign-${data.time * 1000}-${data.group_id}-${data.user_id}`,
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
    async groupEssence(data: GroupEssenceEventData) {
        console.log(data)
        if (await storage.isChatIgnored(-data.group_id)) return
        const room = await storage.getRoom(-data.group_id)
        if (room) {
            room.utime = data.time * 1000
            let msg = `${data.user_name} (${data.user_id}) 的消息被 ${data.operator_name} (${data.operator_id}) ${
                data.add ? '设为' : '移出'
            }精华消息`
            room.lastMessage = {
                content: msg,
                username: null,
                timestamp: formatDate('hh:mm'),
                userId: data.user_id,
            }
            const message: Message = {
                username: '',
                content: msg,
                senderId: 10000,
                timestamp: formatDate('hh:mm:ss'),
                date: formatDate('yyyy/MM/dd'),
                _id: `essence-${data.time * 1000}-${data.group_id}-${data.user_id}-${data.seq}`,
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
            content: `${data.nickname} (${data.user_id}) 加入了本群`,
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
            if (group && (group.group_remark || group.group_name)) {
                roomName = group.group_remark || group.group_name
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
            userId: senderId,
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
                      ? ` (${data.user_id}) 离开了本群`
                      : ` (${data.user_id}) 被 ${
                            operator ? (operator.card ? operator.card : operator.nickname) : data.operator_id
                        } (${data.operator_id}) 踢了`),
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
            if (group && (group.group_remark || group.group_name)) {
                roomName = group.group_remark || group.group_name
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
            userId: data.operator_id,
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
        let content = `${operator ? operator.card || operator.nickname : data.operator_id}(${data.operator_id}) `
        if (muteAll && data.duration > 0) content += '开启了全员禁言'
        else if (muteAll) content += '关闭了全员禁言'
        else if (data.duration === 0) content += `将 ${mutedUserName}(${data.user_id}) 解除禁言`
        else content += `禁言 ${mutedUserName}(${data.user_id}) ${formatDuration(data.duration)}`
        const message: Message = {
            _id: `mute-${now.getTime()}-${data.user_id}-${data.operator_id}`,
            content,
            username: operator ? operator.card || operator.nickname : data.operator_id.toString(),
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
            if (group && (group.group_remark || group.group_name)) {
                roomName = group.group_remark || group.group_name
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
            userId: data.operator_id,
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
        const enableMap = new Map<string, string>([
            ['enable_guest', '游客查看消息'],
            ['enable_anonymous', '群内匿名聊天'],
            ['enable_upload_album', '群员上传相册'],
            ['enable_upload_file', '群员上传文件'],
            ['enable_temp_chat', '群内临时会话'],
            ['enable_new_group', '群员发起新群'],
            ['enable_show_honor', '显示群员荣誉'],
            ['enable_show_level', '显示群员等级'],
            ['enable_show_title', '显示群员头衔'],
            ['enable_confess', '群内坦白说'],
        ])
        const now = new Date(data.time * 1000)
        const enableKeys = Object.keys(data).filter((key) => enableMap.has(key))
        let content = '管理员修改了群设置:'
        if (data.user_id) {
            try {
                const operator = (await bot.getGroupMemberInfo(data.group_id, data.user_id)).data
                content = `${operator ? operator.card || operator.nickname : data.user_id}(${
                    data.user_id
                }) 修改了群设置:`
            } catch (e) {}
        }
        let keys = ''
        for (const key of enableKeys) {
            content += ` ${data[key] ? '允许' : '禁止'}${enableMap.get(key)}`
            keys += key
        }
        if (data.avatar) {
            content += ' 群头像已变更'
        }
        const message: Message = {
            _id: `setting-${now.getTime()}-${data.group_id}-${keys}`,
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
            if (group && (group.group_remark || group.group_name)) {
                roomName = group.group_remark || group.group_name
            }
            // create room
            room = createRoom(roomId, roomName)
            await storage.addRoom(room)
        }
        if (data.group_name && data.group_name !== room.roomName) {
            room.roomName = data.group_name
            message.content += ` 群名变更为 ${data.group_name}`
        } else if (data.group_name && data.group_name === room.roomName) return
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
    async groupTitle(data: GroupTitleEventData) {
        console.log(data)
        const roomId = -data.group_id
        if (await storage.isChatIgnored(roomId)) return
        const now = new Date(data.time * 1000)
        let content = `恭喜 ${data.nickname}(${data.user_id}) 获得群主授予的 ${data.title} 头衔`
        const message: Message = {
            _id: `title-${now.getTime()}-${data.group_id}-${data.user_id}`,
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
            if (group && (group.group_remark || group.group_name)) {
                roomName = group.group_remark || group.group_name
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
            ? `群主设置 ${newAdmin ? newAdmin.card || newAdmin.nickname : data.user_id} 为管理员`
            : `群主取消了 ${newAdmin ? newAdmin.card || newAdmin.nickname : data.user_id} 的管理员资格`
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
            if (group && (group.group_remark || group.group_name)) {
                roomName = group.group_remark || group.group_name
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
        let content = `${operator ? operator.card || operator.nickname : data.operator_id}(${
            data.operator_id
        }) 将群转让给了 ${transferredUser ? transferredUser.card || transferredUser.nickname : data.user_id}(${
            data.user_id
        })`
        const message: Message = {
            _id: `transfer-${now.getTime()}-${data.user_id}-${data.operator_id}`,
            content,
            username: operator ? operator.card || operator.nickname : data.operator_id.toString(),
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
            if (group && (group.group_remark || group.group_name)) {
                roomName = group.group_remark || group.group_name
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
            userId: data.operator_id,
        }
        ui.addMessage(roomId, message)
        ui.updateRoom(room)
        storage.updateRoom(roomId, room)
        storage.addMessage(roomId, message)
    },
    async requestAdd(data: FriendAddEventData | GroupAddEventData | GroupInviteEventData) {
        //console.log(data)
        ui.sendAddRequest(data)
        let notifBody
        if (data.request_type === 'friend') {
            notifBody = '申请添加你为好友'
        } else {
            const groupName = getConfig().removeGroupNameEmotes
                ? removeGroupNameEmotes(data.group_name)
                : data.group_name
            notifBody = '申请加入：' + groupName
        }

        //notification
        const notif = new Notification({
            summary: data.nickname,
            appName: 'Icalingua++',
            category: 'im.received',
            'desktop-entry': 'icalingua',
            urgency: 1,
            timeout: 0,
            body: notifBody,
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
    async syncRemark(data: SyncRemarkEventData) {
        if (data.sub_type === 'group') {
            const roomId = -data.group_id
            const room = await storage.getRoom(roomId)
            if (room) {
                room.roomName = data.remark || bot.gl.get(data.group_id).group_name
                ui.updateRoom(room)
                storage.updateRoom(roomId, room)
            }
        } else {
            const roomId = data.user_id
            const room = await storage.getRoom(roomId)
            if (room) {
                room.roomName = data.remark || bot.fl.get(data.user_id).nickname
                ui.updateRoom(room)
                storage.updateRoom(roomId, room)
            }
        }
    },
    //TODO 这里应该有好多重复代码的说，应该可以合并一下
    async friendIncrease(data: FriendIncreaseEventData) {
        const now = new Date(data.time * 1000)
        const senderId = data.user_id
        const roomId = senderId
        if (!roomId) return
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
            userId: senderId,
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
        if (!roomId) return
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
            userId: senderId,
        }
        ui.addMessage(roomId, message)
        ui.updateRoom(room)
        storage.updateRoom(roomId, room)
        storage.addMessage(roomId, message)
    },
}
const loginHandlers = {
    slider(data: SliderEventData) {
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
                'Mozilla/5.0 (Linux; Android 7.1.1; MIUI ONEPLUS/A5000_23_17; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/98.0.4758.102 MQQBrowser/6.2 TBS/046403 Mobile Safari/537.36 V1_AND_SQ_8.9.50_3898_YYB_D QQ/8.9.50.10650 NetType/WIFI WebP/0.3.0 AppId/537155599 Pixel/720 StatusBarHeight/36 SimpleUISwitch/0 QQTheme/1000 StudyMode/0 CurrentMode/0 CurrentFontScale/1.0 GlobalDensityScale/1.0285714 AllowLandscape/false InMagicWin/0',
        })
    },
    onErr(data: LoginErrorEventData) {
        console.log(data)
        showLoginWindow()
        sendToLoginWindow('error', data.message + ` (${data.code})`)
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
        await updateTrayIcon(true)
        if (!getConfig().fetchHistoryOnStart) return
        await sleep(3000)
        ui.message('正在获取历史消息')
        await adapter.fetch7DaysHistory()
        ui.messageSuccess('历史消息获取完成')
    },
    verify(data: DeviceEventData) {
        console.log(data)
        showLoginWindow()
        sendToLoginWindow('smsCodeVerify', JSON.stringify(data))
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
                storage = new SQLStorageProvider(
                    `${loginForm.username}`,
                    'sqlite3',
                    {
                        dataPath: path.join(app.getPath('userData'), 'data'),
                    },
                    errorHandler,
                )
                break
            case 'mysql':
                storage = new SQLStorageProvider(
                    `${loginForm.username}`,
                    'mysql',
                    {
                        host: loginForm.sqlHost,
                        user: loginForm.sqlUsername,
                        password: loginForm.sqlPassword,
                        database: loginForm.sqlDatabase,
                    },
                    errorHandler,
                )
                break
            case 'pg':
                storage = new SQLStorageProvider(
                    `${loginForm.username}`,
                    'pg',
                    {
                        host: loginForm.sqlHost,
                        user: loginForm.sqlUsername,
                        password: loginForm.sqlPassword,
                        database: loginForm.sqlDatabase,
                    },
                    errorHandler,
                )
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
                if (group && (group.group_remark || group.group_name) !== e.roomName) {
                    storage.updateRoom(e.roomId, { roomName: group.group_remark || group.group_name })
                }
            })
        })
    } catch (err) {
        errorHandler(err, true)
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
    bot.on('notice.group.sign', eventHandlers.groupSign)
    bot.on('notice.group.essence', eventHandlers.groupEssence)
    bot.on('notice.group.increase', eventHandlers.groupMemberIncrease)
    bot.on('notice.group.decrease', eventHandlers.groupMemberDecrease)
    bot.on('notice.group.ban', eventHandlers.groupMute)
    bot.on('notice.group.setting', eventHandlers.groupSetting)
    bot.on('notice.group.title', eventHandlers.groupTitle)
    bot.on('notice.group.admin', eventHandlers.groupAdmin)
    bot.on('notice.group.transfer', eventHandlers.groupTransfer)
    bot.on('notice.friend.increase', eventHandlers.friendIncrease)
    bot.on('notice.friend.decrease', eventHandlers.friendDecrease)
    bot.on('request.friend.add', eventHandlers.requestAdd)
    bot.on('request.group.invite', eventHandlers.requestAdd)
    bot.on('request.group.add', eventHandlers.requestAdd)
    bot.on('sync.readed', eventHandlers.syncRead)
    bot.on('sync.remark', eventHandlers.syncRemark)
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

    preloadImages(urls: string[]): Promise<boolean>
}

const adapter: OicqAdapter = {
    getDisabledFeatures(): Promise<SpecialFeature[]> {
        return Promise.resolve([])
    },
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
                bubble_id: data.bubble_id,
            }
            await processMessage(data.message, message, {}, ui.getSelectedRoomId())
            if (message.file) {
                return message.file.url || 'error'
            }
        }
        return 'error'
    },
    async getFriend(uin: number): Promise<FriendInfo> {
        return bot.fl.get(uin)
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
    setGroupRemark(gin: number, remark: string): any {
        bot.setGroupRemark(gin, remark)
    },
    setFriendRemark(uin: number, remark: string): any {
        bot.setFriendRemark(uin, remark)
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
                messageType: 'forward',
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
        return bot.setGroupCard(group, bot.uin, nick)
    },
    async getGroupMemberInfo(group: number, member: number, noCache: boolean = true): Promise<MemberInfo> {
        return (await bot.getGroupMemberInfo(group, member, noCache)).data
    },
    async _getGroupMemberInfo(group: number, member: number, noCache: boolean = true): Promise<MemberInfo> {
        const data = (await bot.getGroupMemberList(group, noCache)).data
        if (!data) return
        return data.get(member)
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
        ui.setAllChatGroups(await storage.getAllChatGroups())
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
        if (file && typeof file.type === 'string' && !file.type.includes('image') && !file.type.startsWith('audio')) {
            const uiProgress = ui.notifyProgress(
                'uploadFile-' + file.path,
                `正在上传文件 ${file.path.split('/').pop().split('\\').pop()}`,
            )
            //群文件
            if (roomId > 0) {
                bot.sendFile(roomId, file.path, undefined, (v) => uiProgress.value(Number(v))).then(async (data) => {
                    if (data.error) {
                        ui.notifyError({ title: '文件上传失败', message: data.error.message })
                        ui.closeLoading()
                        uiProgress.close()
                        return
                    }
                    ui.messageSuccess('文件上传成功')
                    const message: Message = {
                        _id: data.data.message_id,
                        senderId: bot.uin,
                        username: 'You',
                        content,
                        timestamp: formatDate('hh:mm:ss'),
                        date: formatDate('yyyy/MM/dd'),
                        files: [],
                    }
                    message.file = {
                        type: file.type,
                        size: file.size,
                        url: file.path,
                        name: file.path.split('/').pop().split('\\').pop(),
                    }
                    message.files.push(message.file)
                    const parsed = Buffer.from(data.data.message_id, 'base64')
                    const _time = parsed.readUInt32BE(12)
                    if (_time !== lastReceivedMessageInfo.timestamp) {
                        lastReceivedMessageInfo.timestamp = _time
                        lastReceivedMessageInfo.id = 0
                    }
                    message.time = _time * 1000 + lastReceivedMessageInfo.id
                    message.timestamp = formatDate('hh:mm:ss', new Date(_time * 1000))
                    lastReceivedMessageInfo.id++
                    ui.addMessage(roomId, message)
                    storage.addMessage(roomId, message)
                    ui.closeLoading()
                    uiProgress.close()
                })
            } else {
                const gfs = bot.acquireGfs(-roomId)
                gfs.upload(file.path, undefined, undefined, (v) => uiProgress.value(Number(v)))
                    .then(() => {
                        ui.closeLoading()
                        uiProgress.close()
                    })
                    .catch((e) => {
                        ui.messageError(e.message + '(' + e.code + ')')
                        ui.closeLoading()
                    })
            }
            ui.message('文件上传中')
            return
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
            chain.push({
                type: 'reply',
                data: {
                    id: replyMessage._id,
                    text: replyMessage.content,
                },
            })

            let replyUin = replyMessage.senderId
            if (!replyUin) {
                const parsed = Buffer.from(replyMessage._id, 'base64')
                replyUin = parsed.readUInt32BE(roomId < 0 ? 4 : 0)
            }

            if (roomId < 0 && replyUin !== 80000000)
                chain.push(
                    {
                        type: 'at',
                        data: {
                            qq: replyUin,
                        },
                    },
                    {
                        type: 'text',
                        data: {
                            text: ' ',
                        },
                    },
                )
        }
        if (content) {
            // 转换新 @
            const icalinguaAtRegex = /<IcalinguaAt qq=(\d+)>([^<]*)<\/IcalinguaAt>/
            while (icalinguaAtRegex.test(content)) {
                const icalinguaAt = icalinguaAtRegex.exec(content)
                try {
                    const atQQ = Number(icalinguaAt[1])
                    const name = decodeURIComponent(icalinguaAt[2])
                    if (!name) break
                    at.push({
                        id: atQQ === 1 ? 'all' : atQQ,
                        text: name,
                    })
                    content = content.replace(icalinguaAt[0], name)
                } catch (e) {
                    console.error(e)
                    break
                }
            }
            //这里是处理@人和表情 markup 的逻辑
            const FACE_REGEX = /\[Face: (\d+)]/
            let splitContent = [content]
            // 把 @xxx 的部分单独分割开
            // '喵@小A @小B呜' -> ['喵', '@小A', ' ', '@小B', '呜']
            for (const { text } of at) {
                if (!text) continue
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
                } else if (messageType === 'forward') {
                    chain.length = 0
                    chain.push({
                        type: 'xml',
                        data: {
                            data: content,
                            type: 35,
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
            if (file && file.type.startsWith('audio')) {
                chain.push({
                    type: 'record',
                    data: {
                        file: Buffer.from(b64img.replace(/^data:.+;base64,/, ''), 'base64'),
                    },
                })
            } else {
                chain.push({
                    type: 'image',
                    data: {
                        file: 'base64://' + b64img.replace(/^data:.+;base64,/, ''),
                        type: sticker ? 'face' : 'image',
                        url: imgpath && imgpath.startsWith('send_') ? imgpath.replace('send_', '') : b64img,
                    },
                })
            }
        } else if (imgpath) {
            chain.push({
                type: 'image',
                data: {
                    file: imgpath,
                    type: sticker ? 'face' : 'image',
                    url: imgpath.replace(/\\/g, '/'),
                },
            })
        } else if (file) {
            chain.push({
                type: 'image',
                data: {
                    file: file.path,
                    type: sticker ? 'face' : 'image',
                    url: file.path,
                },
            })
        }
        if (messageType === 'text') {
            const idReg =
                content.match(/\[QLottie: (\d+)\,(\d+)\]/) || content.match(/\[QLottie: (\d+)\,(\d+)\,(\d+)\]/)
            if (idReg && idReg.length >= 3 && content === idReg[0]) {
                const qlottie = idReg[1]
                const faceId = idReg[2]
                const resultId = idReg[3]
                const lottieFace = faceIdToLottie.get(Number.parseInt(faceId, 10)) || { packId: '1', lottieId: qlottie }
                const packId = lottieFace.packId
                let extra = {
                    lottieType: 1,
                    packId: packId,
                    resultId: '',
                }
                if (resultId) {
                    extra.lottieType = 2
                    extra.resultId = resultId
                }
                lottieFace.lottieId = qlottie
                Object.assign(extra, lottieFace)
                chain.length = chain[0].type === 'anonymous' ? 1 : 0
                chain.push({
                    type: 'face',
                    data: {
                        id: Number.parseInt(faceId, 10),
                        qlottie: qlottie,
                        extra: JSON.stringify(extra),
                    },
                })
            }
        }
        //发送消息链
        let data: Ret<{ message_id: string }>
        if (roomId > 0) data = await bot.sendPrivateMsg(roomId, chain, true)
        else data = await bot.sendGroupMsg(-roomId, chain, true)

        ui.closeLoading()
        if (data.error) {
            if (messageType === 'json') {
                const md5 = (data) => crypto.createHash('md5').update(data).digest()
                const hash = md5(md5(content).toString() + String(Math.abs(roomId))).toString()
                const retData = await bot.sendJsonMsg(Math.abs(roomId), content, roomId < 0, hash)
                if (retData.error) {
                    ui.notifyError({
                        title: 'Failed to send',
                        message: retData.error.message,
                    })
                    ui.addMessageText(content)
                }
                return
            }
            ui.notifyError({
                title: 'Failed to send',
                message: data.error.message,
            })
            ui.addMessageText(content)
            return
        }
    },
    createBot(form: LoginForm) {
        if (!bot || form.username != bot.uin || loginError) {
            loginError = false
            const filepath = path.join(app.getPath('userData'), 'data', String(form.username))
            const devicepath = path.join(filepath, `device-${String(form.username)}.json`)
            if (!fs.existsSync(devicepath)) adapter.randomDevice(Number(form.username))
            bot = createClient(Number(form.username), {
                platform: Number(form.protocol),
                data_dir: path.join(app.getPath('userData'), '/data'),
                ignore_self: false,
                brief: true,
                log_level: process.env.NODE_ENV === 'development' ? 'warn' : 'error',
                sign_api_addr: form.signAPIAddress,
                sign_api_key: form.signAPIKey,
                force_algo_T544: form.forceAlgoT544,
                useNT: form.useNT,
            })
            _sendPrivateMsg = bot.sendPrivateMsg
            bot.sendPrivateMsg = async (user_id: number, message: MessageElem[] | string, auto_escape?: boolean) => {
                if (typeof message === 'string') message = [{ type: 'text', data: { text: message } }]
                let data = await _sendPrivateMsg.call(bot, user_id, message, auto_escape)
                if (user_id === bot.uin || user_id === 3636666661 || data.error) return data

                let custom_room = await storage.getRoom(user_id)
                if (!custom_room) {
                    // create room
                    const fl = bot.fl.get(user_id)
                    const roomName = fl ? fl.remark || fl.nickname : String(user_id)
                    custom_room = createRoom(user_id, roomName)
                    await storage.addRoom(custom_room)
                }
                const _message: Message = {
                    _id: '',
                    senderId: bot.uin,
                    username: 'You',
                    content: '',
                    timestamp: formatDate('hh:mm:ss'),
                    date: formatDate('yyyy/MM/dd'),
                    files: [],
                }
                const lastMessage = {
                    content: '',
                    timestamp: formatDate('hh:mm'),
                    username: 'You',
                    userId: bot.uin,
                }
                try {
                    await processMessage(message, _message, lastMessage, user_id)
                } catch (e) {
                    errorHandler(e, true)
                }
                custom_room.lastMessage = lastMessage
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
            f.sc = (f.group_name + f.group_remark + f.group_id).toUpperCase()
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
        if (!storage) return
        return storage.updateRoom(roomId, room)
    },
    updateChatGroup(name: string, chatGroup: ChatGroup) {
        return storage.updateChatGroup(name, chatGroup)
    },
    updateMessage(roomId: number, messageId: string, message: object) {
        return storage.updateMessage(roomId, messageId, message)
    },
    async sendGroupPoke(gin: number, uin: number) {
        const res = await bot.sendGroupPoke(gin, uin)
        if (res.error?.code === 1002) ui.messageError('对方已关闭头像双击功能')
    },
    async sendGroupSign(gin: number) {
        await bot.sendGroupSign(gin)
    },
    addRoom(room: Room) {
        return storage.addRoom(room)
    },
    addChatGroup(chatGroup: ChatGroup) {
        return storage.addChatGroup(chatGroup)
    },
    async getForwardMsg(resId: string, fileName?: string): Promise<Message[]> {
        const history = await bot.getForwardMsg(resId, fileName)
        if (history.error) {
            errorHandler(history.error, true)
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
            data.time = Number(data.time)
            let message: Message
            try {
                message = {
                    senderId: data.user_id,
                    username: data.nickname,
                    content: '',
                    timestamp: formatDate('hh:mm:ss', new Date(data.time * 1000)),
                    date: formatDate('yyyy/MM/dd', new Date(data.time * 1000)),
                    _id: String(data.group_id || -1) + '|' + data.seq,
                    time: data.time * 1000,
                    files: [],
                    bubble_id: data.bubble_id,
                    head_img: data.head_img,
                }
                await processMessage(data.message, message, {}, ui.getSelectedRoomId())
            } catch (e) {
                message = {
                    senderId: 0,
                    username: '错误',
                    content: JSON.stringify(data),
                    code: JSON.stringify(e),
                    timestamp: formatDate('hh:mm:ss'),
                    date: formatDate('yyyy/MM/dd'),
                    _id: Date.now(),
                    time: Date.now(),
                    files: [],
                }
                errorHandler(e)
            }
            messages.push(message)
        }
        return messages
    },

    getBkn: () => bot.bkn,
    getUin: () => bot.uin,
    getNickname: () => bot.nickname,
    getGroupFileMeta: (gin: number, fid: string) => {
        let meta
        try {
            meta = bot.acquireGfs(gin).download(fid)
        } catch (e) {
            errorHandler(e, true)
            meta = {
                name: e.message + '(' + e.code + ')',
                url: 'error',
            }
        }
        return meta
    },
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
    async removeChatGroup(name: string) {
        await storage.removeChatGroup(name)
        ui.setAllChatGroups(await storage.getAllChatGroups())
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
        let res = await adapter.getMsg(messageId)
        let messageIdBuf = Buffer.from(messageId, 'base64')
        if (res.error && roomId > 0 && messageIdBuf.length === 17) {
            const timestamp = messageIdBuf.readUInt32BE(12)
            const timeDiff = [2, 1, -1, -2]
            for (let j of timeDiff) {
                messageIdBuf.writeUInt32BE(timestamp + j, 12)
                res = await adapter.getMsg(messageIdBuf.toString('base64'))
                if (!res.error) break
            }
        }
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
                bubble_id: message.bubble_id,
            }
            try {
                await processMessage(data.message, newMessage, {}, roomId)
                await storage.replaceMessage(roomId, messageId, newMessage)
                if (roomId === ui.getSelectedRoomId()) ui.renewMessage(roomId, messageId, newMessage)
            } catch (e) {
                errorHandler(e, true)
            }
        } else {
            if (message.files.length) {
                let flag = false
                for (let i in message.files) {
                    if (message.files[i].type.startsWith('image') && message.files[i].url.includes('fileid=')) {
                        const fileId = message.files[i].url.match(/fileid=([^&]+)/)[1]
                        const res = await bot.getNTPicURLbyFileid(fileId)
                        if (!res.error) {
                            message.files[i].url = res.data
                            flag = true
                        }
                    }
                }
                if (flag) {
                    message.file = message.files[message.files.length - 1]
                    await storage.replaceMessage(roomId, messageId, message)
                    if (roomId === ui.getSelectedRoomId()) ui.renewMessage(roomId, messageId, message)
                    errorHandler(res.error, true)
                    if (res.error.message !== 'msg not exists')
                        ui.messageError('错误：' + res.error.message + '，但已尝试刷新图片链接。')
                    else ui.messageError('错误：该消息不存在，但已尝试刷新图片链接。')
                    return
                }
            }
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
                if (stopFetching && !isAutoFetching) {
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
                        bubble_id: (<GroupMessageEventData>data).bubble_id,
                    }
                    try {
                        const retData = await processMessage(data.message, message, {}, roomId)
                        if (await storage.isChatIgnored(message.senderId)) message.hide = true
                        messages.push(message)
                        newMsgs.push(message)
                        if (first_loop && retData.message.time > lastMessageTime) {
                            lastMessage = Object.assign(Object.assign({}, retData.message), retData.lastMessage, {
                                username: bot.uin == retData.message.senderId ? 'You' : retData.message.username,
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
                if (history.data.length < 2 || newMsgs.length === 0) {
                    done = true
                    break
                }
                messageId = newMsgs[0]._id as string
                if (await storage.getMessage(roomId, messageId)) {
                    done = true
                    break
                }
                if (limit && messages.length > limit) break
                await sleep(100)
            }
            // 私聊消息去重
            let messagesLength = messages.length
            if (roomId > 0) {
                for (let i = 0; i < messagesLength; i++) {
                    //if (messages[i].senderId != bot.uin) continue
                    try {
                        let messageIdBuf = Buffer.from(messages[i]._id as string, 'base64')
                        if (messageIdBuf.length != 17) continue
                        let timestamp = messageIdBuf.readUInt32BE(12)
                        const timeDiff = [0, -1, 1, -2, 2]
                        for (let j of timeDiff) {
                            messageIdBuf.writeUInt32BE(timestamp + j, 12)
                            const mid = messageIdBuf.toString('base64')
                            if (await storage.getMessage(roomId, mid)) {
                                if (j !== 0) {
                                    await storage.replaceMessage(roomId, mid, messages[i])
                                    if (roomId === ui.getSelectedRoomId()) ui.renewMessage(roomId, mid, messages[i])
                                }
                                messages.splice(i, 1)
                                messagesLength--
                                i--
                                break
                            }
                        }
                    } catch (e) {
                        errorHandler(e, true)
                    }
                }
            }
            return { messages, done }
        }
        const { messages, done } = await fetchLoop(60)
        await storage.addMessages(roomId, messages)
        let room = await storage.getRoom(roomId)
        if (roomId === ui.getSelectedRoomId())
            storage.fetchMessages(roomId, 0, currentLoadedMessagesCount + 20).then(ui.setMessages)
        if (done) {
            ui.messageSuccess(`${room.roomName}(${Math.abs(roomId)}) 已拉取 ${messages.length} 条消息`)
            ui.clearHistoryCount()
        } else {
            ui.message(`${room.roomName}(${Math.abs(roomId)}) 后台拉取中，已拉取 ${messages.length} 条消息`)
            {
                const { messages } = await fetchLoop()
                await storage.addMessages(roomId, messages)
                ui.messageSuccess(`${room.roomName}(${Math.abs(roomId)}) 已拉取 ${messages.length} 条消息`)
                ui.clearHistoryCount()
            }
        }

        //刷新未读数量
        if (!isAutoFetching && roomId < 0) {
            try {
                const body = pb.encode({
                    1: bot['apk'].subid,
                    2: {
                        1: -roomId,
                        2: {
                            22: 0,
                            53: 0,
                        },
                    },
                })
                const blob = await bot.sendOidb('OidbSvc.0x88d_0', body)
                const o = pb.decode(blob)[4][1][3]
                const unread = parseInt(o[22]) - parseInt(o[53])
                await storage.updateRoom(roomId, { unreadCount: unread })
            } catch (e) {
                errorHandler(e, true)
            }
        }

        // 更新最近消息
        if (!messages.length) return
        room = await storage.getRoom(roomId)
        if (room.utime >= lastMessageTime) return
        room.lastMessage = lastMessage
        room.utime = lastMessageTime
        ui.updateRoom(room)
        await storage.updateRoom(roomId, {
            utime: room.utime,
            lastMessage: room.lastMessage,
        })
    },

    async fetch7DaysHistory() {
        const getSeqInfos = async (group_ids: number[]) => {
            try {
                const gids = group_ids.map((e) => ({ 1: e, 2: { 22: 0, 53: 0 } }))
                const body = pb.encode({
                    1: bot['apk'].subid,
                    2: gids,
                })
                const blob = await bot.sendOidb('OidbSvc.0x88d_0', body)
                let gInfos = pb.decode(blob)[4][1]
                const ret = []
                if (!Array.isArray(gInfos)) gInfos = [gInfos]
                for (const gInfo of gInfos) {
                    const gid = gInfo[1]
                    const o = gInfo[3]
                    if (!o) continue
                    ret.push({
                        groupId: gid,
                        lastSeq: parseInt(o[22]),
                        unread: parseInt(o[22]) - parseInt(o[53]),
                    })
                }
                return ret
            } catch (e) {
                errorHandler(e, true)
                return []
            }
        }
        const rooms = await storage.getAllRooms()
        const msgIds2Fetch: { id: string; roomId: number; unread?: number }[] = []
        isAutoFetching = true
        // 先私聊后群聊
        const now = Date.now() - 3000
        for (const i of rooms) {
            if (now - i.utime > 1000 * 60 * 60 * 24 * 2) continue
            if (i.roomId <= 0) continue
            const roomId = i.roomId
            const buffer = Buffer.alloc(17)
            const uin = roomId
            buffer.writeUInt32BE(uin, 0)
            buffer.writeUInt32BE(Math.floor(now / 1000), 12)
            msgIds2Fetch.push({
                id: buffer.toString('base64'),
                roomId,
            })
        }
        const gRooms = rooms
            .filter((e) => e.roomId < 0 && now - e.utime <= 1000 * 60 * 60 * 24 * 7)
            .map((e) => -e.roomId)
        // 每次取30个群的seq信息
        for (let i = 0; i < gRooms.length; i += 30) {
            const seqInfos = await getSeqInfos(gRooms.slice(i, i + 30))
            for (const j of seqInfos) {
                const buffer = Buffer.alloc(21)
                buffer.writeUInt32BE(j.groupId, 0)
                buffer.writeUInt32BE(j.lastSeq, 8)
                msgIds2Fetch.push({
                    id: buffer.toString('base64'),
                    roomId: -j.groupId,
                    unread: j.unread,
                })
            }
            await sleep(50)
        }
        for (const i of msgIds2Fetch) {
            await adapter.fetchHistory(i.id, i.roomId)
            if (i.unread) {
                try {
                    const room = await storage.getRoom(i.roomId)
                    const unread_change_local = room.unreadCount - rooms.find((e) => e.roomId === i.roomId).unreadCount
                    if (unread_change_local >= 0) {
                        room.unreadCount = i.unread + unread_change_local
                        ui.updateRoom(room)
                        storage.updateRoom(i.roomId, room)
                    }
                } catch (e) {
                    errorHandler(e, true)
                }
            }
            await sleep(100)
        }
        isAutoFetching = false
    },

    async getRoamingStamp(no_cache?: boolean): Promise<RoamingStamp[]> {
        const roaming_stamp = (await bot.getRoamingStamp(no_cache)).data || []
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
        if (smsCode === 'sendSmsCode') bot.sendSMSCode()
        else bot.submitSMSCode(smsCode)
    },
    randomDevice(username: number) {
        const filepath = path.join(app.getPath('userData'), 'data', String(username))
        const devicepath = path.join(filepath, `device-${String(username)}.json`)
        const randomString = (length: number, num: boolean = false) => {
            let result = ''
            const map = num ? '0123456789' : '0123456789abcdef'
            for (let i = length; i > 0; --i) result += map[crypto.randomInt(0, map.length)]
            return result
        }
        const _genIMEI = () => {
            const imei = `86${randomString(12, true)}`
            function calcSP(imei: string) {
                let sum = 0
                for (let i = 0; i < imei.length; ++i) {
                    if (i % 2) {
                        let j = parseInt(imei[i]) * 2
                        sum += (j % 10) + Math.floor(j / 10)
                    } else {
                        sum += parseInt(imei[i])
                    }
                }
                return (100 - sum) % 10
            }
            return imei + calcSP(imei)
        }
        const imei = _genIMEI()
        const md5 = (data: string) => crypto.createHash('md5').update(data).digest()
        const device = `{
        "--begin--":    "该设备文件为尝试解决${username}的风控时随机生成。",
        "--version--":  2,
        "product":      "M2012K11AC",
        "device":       "alioth",
        "board":        "alioth",
        "brand":        "Redmi",
        "model":        "ILPP ${randomString(4).toUpperCase()}",
        "wifi_ssid":    "Redmi-${randomString(7).toUpperCase()}",
        "bootloader":   "U-boot",
        "android_ver":  "${randomString(4)}.${randomString(6, true)}.${randomString(4, true)}",
        "boot_id":      "${crypto.randomUUID()}",
        "proc_version": "Linux version 4.19.157-${randomString(13)} (android-build@xiaomi.com)",
        "mac_address":  "02:00:00:00:00:00",
        "ip_address":   "192.168.${randomString(2, true)}.${randomString(2, true)}",
        "imei":         "${imei}",
        "android_id":   "${md5(imei).toString('hex').slice(0, 16)}",
        "incremental":  "${randomString(10, true)}",
        "--end--":      "修改后可能需要重新验证设备。"
    }`
        if (fs.existsSync(filepath)) {
            fs.rmSync(filepath, { recursive: true, force: true })
        }
        fs.mkdirSync(filepath, { recursive: true, mode: 0o755 })
        fs.writeFileSync(devicepath, device, { mode: 0o600 })
    },
    async sendPacket(type: string, cmd: string, body: any): Promise<Buffer> {
        if (type === 'Uni') return await bot.sendUni(cmd, pb.encode(body))
        else return await bot.sendOidb(cmd, pb.encode(body))
    },
    async preloadImages(urls: string[]) {
        const ret = await bot.preloadImages(urls)
        if (ret.error) return false
        else return true
    },
}

export default adapter
