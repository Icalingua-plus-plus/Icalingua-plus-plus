import type oicqAdapter from './oicqAdapter'
import { config, saveUserConfig, userConfig } from '../providers/configManager'
import LoginForm from '@icalingua/types/LoginForm'
import StorageProvider from '@icalingua/types/StorageProvider'
import MongoStorageProvider from '@icalingua/storage-providers/MongoStorageProvider'
import RedisStorageProvider from '@icalingua/storage-providers/RedisStorageProvider'
import SQLStorageProvider from '@icalingua/storage-providers/SQLStorageProvider'
import { broadcast, broadcastDatabaseUpgradeProgress } from '../providers/socketIoProvider'
import OnebotClient, { GroupMessage } from '../clients/OnebotClient'
import Room from '@icalingua/types/Room'
import ChatGroup from '@icalingua/types/ChatGroup'
import clients from '../utils/clients'
import IgnoreChatInfo from '@icalingua/types/IgnoreChatInfo'
import getSysInfo from '../utils/getSysInfo'
import {
    FakeMessage,
    FriendInfo,
    Gender,
    GfsDirStat,
    GfsFileStat,
    GroupInfo,
    GroupMessageEventData,
    GroupRole,
    MediaFile,
    MemberBaseInfo,
    MemberInfo,
    MessageElem,
    PrivateMessageEventData,
    Ret,
} from 'oicq-icalingua-plus-plus'
import Message from '@icalingua/types/Message'
import MessagePageOptions, { MessageHistoryWindow } from '@icalingua/types/MessagePage'
import createProcessMessage, { registerSilkDecodeCompleter } from '../utils/processMessage'
import {
    getMediaPartIndex,
    shiftMediaOrdersAfterTextReplacement,
    splitContentByMediaOrder,
} from '../utils/messageMediaOrder'
import formatDate from '../utils/formatDate'
import { Socket } from 'socket.io'
import SendMessageParams from '@icalingua/types/SendMessageParams'
import crypto from 'crypto'
import SearchableFriend from '@icalingua/types/SearchableFriend'
import { isArrayLike } from 'lodash'
import createRoom from '../utils/createRoom'
import md5 from 'md5'
import path from 'path'
import fsP from 'fs/promises'
import { deleteUploadedFile, getUploadedFilePath, getUploadedFileName } from '../utils/uploadFileManager'

let bot: OnebotClient
let loginForm: LoginForm
let storage: StorageProvider
let uin: number
let bkn: number = 0
let nickname: string

// 群成员信息缓存
const MEMBER_CACHE_TTL = 5 * 60 * 1000 // 5分钟
const memberInfoCache = new Map<string, { info: MemberInfo; timestamp: number }>()
let lastReceivedMessageInfo = {
    timestamp: 0,
    id: 0,
}
let rkey: {
    type: 'private' | 'group'
    rkey: string
    created_at: number
    ttl: string
}[] = []

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
                    dataPath: 'data',
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
        storage.onUpgradeProgress = broadcastDatabaseUpgradeProgress
        await storage.connect()
        registerSilkDecodeCompleter({
            replaceMessage: (roomId, messageId, message) => storage.replaceMessage(roomId, messageId, message),
            renewMessage: (roomId, messageId, message) => clients.renewMessage(roomId, messageId, message),
            getMessage: (roomId, messageId) => storage.getMessage(roomId, messageId),
        })
        storage.getAllRooms().then((e) => {
            e.forEach(async (e) => {
                //更新群的名称
                if (e.roomId > -1) return
                try {
                    const group = await bot.getGroupInfo(-e.roomId)
                    if (group && group.group_name !== e.roomName) {
                        await storage.updateRoom(e.roomId, { roomName: group.group_name })
                    }
                } catch (e) {
                    console.error(e)
                }
            })
        })
    } catch (err) {
        console.log(err)
        console.log('无法连接数据库')
        broadcast('fatal', '无法连接数据库')
        process.exit(2)
    }
}
const attachEventHandler = () => {
    bot.on('message', async (data) => {
        if (data.time !== lastReceivedMessageInfo.timestamp) {
            lastReceivedMessageInfo.timestamp = data.time
            lastReceivedMessageInfo.id = 0
        }
        const now = new Date(data.time * 1000)
        const groupId = data.message_type === 'group' ? data.group_id : undefined
        const nonSelfId = data.user_id === uin ? data.target_id : data.user_id
        const senderId = data.sender.user_id
        let roomId = groupId ? -groupId : nonSelfId
        if (await storage.isChatIgnored(roomId)) return
        const isSelfMsg = uin === senderId
        let senderName: string
        if (groupId && (<GroupMessage>data).anonymous) senderName = (<GroupMessage>data).anonymous.name
        else if (groupId && isSelfMsg) senderName = 'You'
        else if (groupId) senderName = (data.sender as MemberBaseInfo).card || data.sender.nickname
        else {
            let info: Awaited<ReturnType<typeof bot.getStrangerInfo>>
            try {
                info = await bot.getStrangerInfo(senderId)
            } catch (e) {
                console.log('无法 getStrangerInfo', e)
            }
            senderName = info.remark || (data.sender as FriendInfo).remark || info.nickname || data.sender.nickname
        }
        const group = groupId ? await bot.getGroupInfo(groupId) : null
        let roomName = groupId ? group.group_name : senderName

        const message: Message = {
            senderId: senderId,
            username: senderName,
            content: '',
            timestamp: formatDate('hh:mm:ss', now),
            date: formatDate('yyyy/MM/dd', now),
            _id: data.message_id,
            role: (data.sender as MemberBaseInfo).role,
            title: groupId && (<GroupMessage>data).anonymous ? '匿名' : (data.sender as MemberBaseInfo).title,
            files: [],
            anonymousId: groupId && (<GroupMessage>data).anonymous ? (<GroupMessage>data).anonymous.id : null,
            anonymousflag: groupId && (<GroupMessage>data).anonymous ? (<GroupMessage>data).anonymous.flag : null,
        }

        let room = await storage.getRoom(roomId)
        if (!room) {
            if (data.post_type === 'message_sent') {
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
        if (message.content === '[无法处理的语音]undefined') {
            const regetMsg = await adapter.getMsg(data.message_id.toString())
            if (!regetMsg.error && regetMsg.data) {
                message.content = ''
                await processMessage(regetMsg.data.message, message, lastMessage, roomId)
            }
        }

        // 自动回复消息作为小通知短暂显示
        // if ('auto_reply' in data && data.auto_reply) {
        //     clients.message(message.content)
        //     return
        // }

        const at = message.at
        if (at) room.at = at

        if (!room.priority) {
            room.priority = groupId ? 2 : 4
        }

        //可能要发通知，所以由客户端来决定
        let image
        if (message.file && message.file.type.startsWith('image/')) image = message.file.url
        broadcast('notify', {
            priority: room.priority,
            roomId,
            at,
            isSelfMsg,
            image,
            data: {
                title: room.roomName,
                body: (groupId ? senderName + ': ' : '') + lastMessage.content,
                hasReply: true,
                replyPlaceholder: 'Reply to ' + room.roomName,
            },
        })

        if (isSelfMsg) {
            room.unreadCount = 0
            room.at = false
        } else room.unreadCount++
        // 加上同一秒收到消息的id，防止消息乱序
        room.utime = data.time * 1000 + lastReceivedMessageInfo.id
        room.lastMessage = lastMessage
        message.time = data.time * 1000 + lastReceivedMessageInfo.id
        lastReceivedMessageInfo.id++
        if (await storage.isChatIgnored(senderId)) message.hide = true
        clients.addMessage(room.roomId, message)
        await storage.updateRoom(roomId, room)
        clients.updateRoom(room)
        storage.addMessage(roomId, message)
        if (config.custom && data.post_type === 'message') {
            try {
                require('../custom').onMessage(data, bot)
            } catch (e) {
                clients.messageError('自定义插件出错')
                console.error(e)
            }
        }
    })
    bot.on('friendRecall', async (data) => {
        clients.deleteMessage(data.message_id.toString())
        storage.updateMessage(data.user_id, data.message_id, { deleted: true, reveal: false })
    })
    bot.on('groupRecall', async (data) => {
        clients.deleteMessage(data.message_id.toString())
        storage.updateMessage(-data.group_id, data.message_id, { deleted: true, reveal: false })
    })
    bot.on('friendPoke', async (data) => {
        const roomId = data.user_id == uin ? data.target_id : data.user_id
        if (await storage.isChatIgnored(roomId)) return
        const room = await storage.getRoom(roomId)
        const operator = data.sender_id || data.user_id
        const nors: any[] = data.raw_info || []
        if (room) {
            room.utime = data.time * 1000
            let msg = ''
            let qqCount = 0
            for (const nor of nors) {
                switch (nor.type) {
                    case 'qq':
                        qqCount++
                        if (qqCount === 1) {
                            if (operator != uin) msg += room.roomName
                            else msg += '你'
                            break
                        }
                        if (qqCount === 2) {
                            if (operator == data.target_id) msg += '自己'
                            else if (data.target_id != uin) msg += room.roomName
                            else msg += '你'
                            break
                        }
                        break
                    case 'img':
                        msg += '<ica:img>'
                        break
                    case 'nor':
                        msg += nor.txt
                        break
                }
            }
            room.lastMessage = {
                content: msg.replace(/<ica:img>/g, ''),
                username: null,
                timestamp: formatDate('hh:mm'),
                userId: operator,
            }
            const message: Message = {
                username: '',
                content: msg,
                senderId: data.sender_id,
                timestamp: formatDate('hh:mm:ss'),
                date: formatDate('yyyy/MM/dd'),
                _id: data.time,
                system: true,
                time: data.time * 1000,
                files: nors
                    .filter((it) => it.type === 'img')
                    .map((it) => ({
                        url: it.src,
                        type: 'image/gif',
                    })),
            }
            clients.addMessage(roomId, message)
            clients.updateRoom(room)
            storage.updateRoom(room.roomId, room)
            storage.addMessage(roomId, message)
        }
    })
    bot.on('groupPoke', async (data) => {
        if (await storage.isChatIgnored(-data.group_id)) return
        const room = await storage.getRoom(-data.group_id)
        if (room) {
            room.utime = data.time * 1000
            const operatorId = 'sender_id' in data ? (data.sender_id as number) : data.user_id
            const operatorObj = await bot.getGroupMemberInfo(data.group_id, operatorId, false)
            const operator = operatorObj.card ? operatorObj.card : operatorObj.nickname
            const userObj = await bot.getGroupMemberInfo(data.group_id, data.target_id, false)
            const user = userObj.card ? userObj.card : userObj.nickname
            const nors: any[] = data.raw_info?.filter((it) => (it.type as any) === 'nor') || []
            let msg = ''
            if (operatorId !== uin) msg += operator
            else msg += '你'
            msg += nors[0]?.txt || '戳了戳'
            if (data.target_id === operatorId) msg += '自己'
            else if (data.target_id === uin) msg += '你'
            else msg += user
            if (nors[1]?.txt) msg += nors[1]?.txt
            room.lastMessage = {
                content: msg,
                username: null,
                timestamp: formatDate('hh:mm'),
                userId: operatorId,
            }
            const message: Message = {
                username: '',
                content: msg,
                senderId: operatorId,
                timestamp: formatDate('hh:mm:ss'),
                date: formatDate('yyyy/MM/dd'),
                _id: data.time,
                system: true,
                time: data.time * 1000,
                files: [],
            }
            clients.addMessage(room.roomId, message)
            clients.updateRoom(room)
            storage.updateRoom(room.roomId, room)
            storage.addMessage(room.roomId, message)
        }
    })
    bot.on('groupIncrease', async (data) => {
        const now = new Date(data.time * 1000)
        const groupId = data.group_id
        const senderId = data.user_id
        const roomId = -groupId
        if (await storage.isChatIgnored(roomId)) return
        const userInfo = await bot.getGroupMemberInfo(data.group_id, data.user_id)
        const message: Message = {
            _id: `${now.getTime()}-${groupId}-${senderId}`,
            content: `${userInfo.nickname} 加入了本群`,
            username: userInfo.nickname,
            senderId,
            time: data.time * 1000,
            timestamp: formatDate('hh:mm:ss', now),
            date: formatDate('yyyy/MM/dd', now),
            system: true,
            files: [],
        }
        let room = await storage.getRoom(roomId)
        if (!room) {
            const group = await bot.getGroupInfo(groupId)
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
            userId: senderId,
        }
        clients.addMessage(roomId, message)
        clients.updateRoom(room)
        storage.updateRoom(roomId, room)
        storage.addMessage(roomId, message)
    })
    bot.on('groupDecrease', async (data) => {
        const now = new Date(data.time * 1000)
        const groupId = data.group_id
        const senderId = data.user_id
        let operator: Awaited<ReturnType<OnebotClient['getGroupMemberInfo']>>
        try {
            operator = await bot.getGroupMemberInfo(groupId, data.operator_id)
        } catch {}
        let roomId = -groupId
        if (await storage.isChatIgnored(roomId)) return
        let userDisplay = senderId.toString()
        try {
            const userInfo = await bot.getGroupMemberInfo(groupId, senderId)
            userDisplay = `${userInfo.card || userInfo.nickname}(${senderId})`
        } catch (e) {
            try {
                const userInfo = await bot.getStrangerInfo(senderId)
                userDisplay = `${userInfo.remark || userInfo.nickname}(${senderId})`
            } catch (e2) {
                console.log(e, e2)
            }
        }
        const message: Message = {
            _id: `${now.getTime()}-${groupId}-${senderId}`,
            content:
                userDisplay +
                (data.sub_type === 'leave'
                    ? ' 离开了本群'
                    : ` 被 ${operator?.card ? operator?.card : operator?.nickname} 踢了`),
            username: data.user_id.toString(),
            senderId: data.operator_id,
            time: data.time * 1000,
            timestamp: formatDate('hh:mm:ss', now),
            date: formatDate('yyyy/MM/dd', now),
            system: true,
            files: [],
        }
        let room = await storage.getRoom(roomId)
        if (!room) {
            const group = await bot.getGroupInfo(groupId)
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
            userId: senderId,
        }
        clients.addMessage(roomId, message)
        clients.updateRoom(room)
        storage.updateRoom(roomId, room)
        storage.addMessage(roomId, message)
    })
    bot.on('groupBan', async (data) => {
        const roomId = -data.group_id
        if (await storage.isChatIgnored(roomId)) return
        const now = new Date(data.time * 1000)
        const operator = await bot.getGroupMemberInfo(data.group_id, data.operator_id)
        let mutedUserName: string
        let muteAll = false
        if (data.user_id === 0) muteAll = true
        else if (data.user_id === 80000000) mutedUserName = '匿名用户'
        else {
            const mutedUser = await bot.getGroupMemberInfo(data.group_id, data.user_id)
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
            const group = await bot.getGroupInfo(data.group_id)
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
            timestamp: formatDate('hh:mm', new Date(data.time)),
            userId: data.operator_id,
        }
        clients.addMessage(roomId, message)
        clients.updateRoom(room)
        storage.updateRoom(roomId, room)
        storage.addMessage(roomId, message)
    })
    bot.on('groupAdmin', async (data) => {
        console.log(data)
        const roomId = -data.group_id
        if (await storage.isChatIgnored(roomId)) return
        const now = new Date(data.time * 1000)
        const newAdmin = await bot.getGroupMemberInfo(data.group_id, data.user_id)
        let content =
            data.sub_type === 'set'
                ? `群主设置 ${newAdmin.card || newAdmin.nickname}(${data.user_id}) 为管理员`
                : `群主取消了 ${newAdmin.card || newAdmin.nickname}(${data.user_id}) 的管理员资格`
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
            const group = await bot.getGroupInfo(data.group_id)
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
            timestamp: formatDate('hh:mm', new Date(data.time)),
            userId: data.user_id,
        }
        clients.addMessage(roomId, message)
        clients.updateRoom(room)
        storage.updateRoom(roomId, room)
        storage.addMessage(roomId, message)
    })
    bot.on('groupTitle', async (data) => {
        console.log(data)
        const roomId = -data.group_id
        if (await storage.isChatIgnored(roomId)) return
        const now = new Date(data.time * 1000)
        const member = await bot.getGroupMemberInfo(data.group_id, data.user_id)
        let content = `恭喜 ${member.nickname}(${data.user_id}) 获得群主授予的 ${data.title} 头衔`
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
            const group = await bot.getGroupInfo(data.group_id)
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
            userId: data.user_id,
        }
        clients.addMessage(roomId, message)
        clients.updateRoom(room)
        storage.updateRoom(roomId, room)
        storage.addMessage(roomId, message)
    })
    bot.on('friendAdd', async (data) => {
        const now = new Date(data.time * 1000)
        const senderId = data.user_id
        const roomId = senderId
        const friend = await bot.getStrangerInfo(data.user_id)
        const roomName = friend.nickname
        const message: Message = {
            _id: `${now.getTime()}-${senderId}-friendIncrease`,
            content: '你们成为了好友',
            username: friend.nickname,
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
            userId: data.user_id,
        }
        clients.addMessage(roomId, message)
        clients.updateRoom(room)
        storage.updateRoom(roomId, room)
        storage.addMessage(roomId, message)
    })
}

const refreshRkey = async () => {
    const rkeyy = await bot.getRkey()
    if (isArrayLike(rkeyy)) {
        rkey = rkeyy
    }
    console.log('Rkey 已刷新', rkeyy)
}

const replaceRkey = (url: string) => {
    if (!rkey.length) return url
    if (!url) return url
    if (
        !url.startsWith('https://multimedia.nt.qq.com.cn/download') &&
        !url.startsWith('https://gchat.qpic.cn/download')
    ) {
        return url
    }

    const u = new URL(url)
    let r = ''
    switch (u.searchParams.get('appid')) {
        case '1406':
            r = rkey.find((it) => it.type === 'private')?.rkey
            break
        case '1407':
            r = rkey.find((it) => it.type === 'group')?.rkey
            break
        default:
            return url
    }
    if (!r) return url
    if (r.startsWith('&rkey=')) r = r.slice('&rkey='.length)
    u.searchParams.set('rkey', r)
    return u.toString()
}

const adapter: typeof oicqAdapter = {
    loggedIn: false,
    isMessageSearchIndexReady: () => storage?.isMessageSearchIndexReady?.() === true,
    validateMessageSearchIndex: async () => {
        await storage?.validateMessageSearchIndex?.()
    },
    async createBot(form: LoginForm) {
        bot = new OnebotClient(config.onebot)
        await bot.connect()
        adapter.loggedIn = true
        const loginInfo = await bot.getLoginInfo()
        uin = loginInfo.user_id
        nickname = loginInfo.nickname
        loginForm = form
        loginForm.username = loginInfo.user_id
        await initStorage()
        attachEventHandler()
        setInterval(adapter.sendOnlineData, 1000 * 60)
        userConfig.account = loginForm
        saveUserConfig()
        adapter.sendOnlineData()
        refreshRkey()
        setInterval(refreshRkey, 1000 * 60 * 10)
    },
    async sendOnlineData() {
        const versionInfo = await bot.getVersionInfo()
        clients.sendOnlineData({
            online: (await bot.getStatus()).online,
            nick: nickname,
            uin,
            sysInfo:
                getSysInfo() +
                '\n\n' +
                `OneBot Backend: ${versionInfo.app_name} ${versionInfo.app_version}` +
                (versionInfo.runtime_os && versionInfo.runtime_version
                    ? `\n${versionInfo.runtime_os} ${versionInfo.runtime_version}`
                    : ''),
            bkn: 0,
        })
        clients.setAllRooms(await storage.getAllRooms())
        clients.setAllChatGroups(await storage.getAllChatGroups())
    },
    async getMsg(id: string) {
        const message = await bot.getMessage(Number(id))
        return {
            data:
                message.message_type === 'group'
                    ? ({
                          message: message.message,
                          message_id: message.message_id.toString(),
                          sub_type: 'normal',
                          message_type: 'group',
                          atme: false,
                          block: false,
                          group_id: message.group_id,
                          group_name: '',
                          font: '',
                          anonymous: null,
                          sender: {
                              user_id: message.sender.user_id,
                              age: 0,
                              nickname: message.sender.nickname,
                              card: '',
                              sex: 'unknown',
                              role: 'member',
                              title: '',
                              area: '',
                              level: 0,
                          },
                          user_id: message.sender.user_id,
                          bubble_id: 0,
                          time: message.time,
                          post_type: 'message',
                          reply(...args: any) {},
                          seqid: 0,
                          self_id: uin,
                          raw_message: message.raw_message,
                      } as GroupMessageEventData)
                    : ({
                          user_id: message.sender.user_id,
                          message: message.message,
                          message_id: message.message_id.toString(),
                          self_id: uin,
                          raw_message: message.raw_message,
                          time: message.time,
                          post_type: 'message',
                          reply(...args: any) {},
                          sub_type: 'friend',
                          font: '',
                          bubble_id: 0,
                          sender: {
                              user_id: message.sender.user_id,
                              age: 0,
                              sex: 'unknown',
                              nickname: message.sender.nickname,
                              remark: message.sender.nickname,
                          },
                          auto_reply: false,
                          message_type: 'private',
                      } as PrivateMessageEventData),
            error: null,
            status: 'ok',
            retcode: 0,
        }
    },
    async handleRequest(type: 'friend' | 'group', flag: string, accept: boolean = true) {
        switch (type) {
            case 'friend':
                await bot.setFriendAddRequest(flag, accept)
                break
            case 'group':
                await bot.setGroupAddRequest(flag, accept)
                break
        }
        return null
    },
    async getGroupFileMeta(gin: number, fid: string, resolve) {
        const data = await bot.getGroupFileUrl(gin, fid, 0)
        resolve({ url: data.url })
    },
    async getForwardMsg(resId: string, fileName: string, resolve) {
        try {
            const history = await bot.getForwardMessage(resId)
            const messages = []
            for (let i = 0; i < history.messages.length; i++) {
                const data = history.messages[i]
                const message: Message = {
                    senderId: data.sender.user_id,
                    username: data.sender.nickname,
                    content: '',
                    timestamp: formatDate('hh:mm:ss', new Date(data.time * 1000)),
                    date: formatDate('yyyy/MM/dd', new Date(data.time * 1000)),
                    _id: i.toString(),
                    time: data.time * 1000,
                    files: [],
                    bubble_id: 0,
                }
                await processMessage(data.content || (data as any).message, message, {})
                messages.push(message)
            }
            resolve(messages)
        } catch (e) {
            console.log(e)
            const res: [Message] = [
                {
                    senderId: 0,
                    username: '错误',
                    content: e.message,
                    timestamp: formatDate('hh:mm:ss'),
                    date: formatDate('yyyy/MM/dd'),
                    _id: 0,
                    time: 0,
                    files: [],
                },
            ]
            resolve(res)
        }
    },
    async sendGroupSign(gin: number) {
        await bot.sendGroupSign(gin)
    },
    async getGroups(resolve) {
        const groups = await bot.getGroupList()
        const groupsAll: Array<GroupInfo & { sc: string }> = groups.map((it) => ({
            group_id: it.group_id,
            group_name: it.group_name,
            group_remark: '',
            shutup_time_me: 0,
            grade: it.group_level,
            create_time: it.group_create_time,
            active_member_count: 0,
            last_join_time: 0,
            last_sent_time: 0,
            max_admin_count: 0,
            owner_id: 0,
            max_member_count: it.max_member_count,
            member_count: it.member_count,
            shutup_time_whole: 0,
            update_time: 0,
            sc: (it.group_name + it.group_id).toUpperCase(),
        }))
        resolve(groupsAll)
    },
    //roomId 和 room 必有一个
    async sendMessage({
        content,
        roomId,
        file,
        replyMessage,
        room,
        media,
        at,
        sticker,
        messageType,
    }: SendMessageParams) {
        if (!messageType) {
            messageType = 'text'
        }
        if (!room) room = await storage.getRoom(roomId)
        if (!roomId) roomId = room.roomId
        if (file && ((file.type && !file.type.includes('image')) || !file.type)) {
            const filePath = getUploadedFilePath(file.path)
            const fileName = getUploadedFileName(file.path)
            if (!filePath || !fileName) {
                clients.messageError('文件上传失败：找不到已上传的文件')
                clients.closeLoading()
                return
            }
            if (roomId > 0) {
                bot.sendPrivateFile(roomId, filePath, fileName)
                    .then(() => {
                        clients.messageSuccess('文件上传成功')
                    })
                    .catch((e) => {
                        clients.messageError('文件上传失败 ' + e.message)
                        console.error(e)
                    })
                    .finally(() => {
                        clients.closeLoading()
                        deleteUploadedFile(file.path)
                    })
            } else {
                bot.gfsUpload(-roomId, filePath, fileName, '/')
                    .then(() => {
                        clients.messageSuccess('文件上传成功')
                    })
                    .catch((e) => {
                        clients.messageError('文件上传失败 ' + e.message)
                        console.error(e)
                    })
                    .finally(() => {
                        clients.closeLoading()
                        deleteUploadedFile(file.path)
                    })
            }
            clients.message('文件上传中')
            return
        }

        const chain: MessageElem[] = []
        const consumedMedia = new Set<number>()
        const appendMedia = (index: number) => {
            const img = media?.[index]
            if (!img || consumedMedia.has(index)) return
            const rawB64 = img.b64 ? img.b64.replace(/^data:.+;base64,/, '') : null
            if (img.b64) {
                chain.push({
                    type: 'image',
                    data: {
                        file: 'base64://' + rawB64,
                        type: sticker ? 'face' : 'image',
                        // @ts-ignore
                        sub_type: sticker ? 1 : 0,
                    },
                })
            } else if (img.url) {
                chain.push({
                    type: 'image',
                    data: {
                        file: img.url,
                        type: sticker ? 'face' : 'image',
                        // @ts-ignore
                        sub_type: sticker ? 1 : 0,
                        url: img.url.replace(/\\/g, '/'),
                    },
                })
            }
            consumedMedia.add(index)
        }

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
                    shiftMediaOrdersAfterTextReplacement(media, icalinguaAt.index, icalinguaAt[0].length, name.length)
                    content = content.replace(icalinguaAt[0], name)
                } catch (e) {
                    console.error(e)
                    break
                }
            }
            //这里是处理@人和表情 markup 的逻辑
            const FACE_REGEX = /\[Face: (\d+)]/
            let splitContent = messageType === 'text' ? splitContentByMediaOrder(content, media || []) : [content]
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
                const mediaIndex = getMediaPartIndex(part)
                if (mediaIndex !== null) {
                    appendMedia(mediaIndex)
                    continue
                }
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
        if (media && media.length) {
            media.forEach((_, index) => appendMedia(index))
        } else if (file) {
            chain.push({
                type: 'image',
                data: {
                    file: file.path,
                    type: sticker ? 'face' : 'image',
                    // @ts-ignore
                    sub_type: sticker ? 1 : 0,
                    url: file.path,
                },
            })
        }
        if (messageType === 'text') {
            const idReg = content.match(/\[QLottie: (\d+)\,(\d+)\]/)
            if (idReg && idReg.length >= 3 && content === idReg[0]) {
                const qlottie = idReg[1]
                const faceId = idReg[2]
                chain.length = 0
                chain.push({
                    type: 'face',
                    data: {
                        id: Number.parseInt(faceId, 10),
                        qlottie: qlottie,
                    },
                })
            }
        }
        //发送消息链
        try {
            let data: { message_id: number }
            if (roomId > 0) data = await bot.sendPrivateMessage(roomId, chain)
            else data = await bot.sendGroupMessage(-roomId, chain)
        } catch (e) {
            clients.notifyError({
                title: 'Failed to send',
                message: e.message,
            })
            clients.addMessageText(content)
        }

        clients.closeLoading()
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
                bubble_id: message.bubble_id,
            }
            try {
                await processMessage(data.message, newMessage, {}, roomId)
                await storage.replaceMessage(roomId, messageId, newMessage)
                clients.renewMessage(roomId, messageId, newMessage)
            } catch (e) {
                console.error(e)
            }
        } else {
            if (res.error.message !== 'msg not exists') clients.messageError('错误：' + res.error.message)
            else clients.messageError('错误：该消息不存在。')
        }
    },
    async deleteMessage(roomId: number, messageId: string) {
        const res = await bot.deleteMessage(Number(messageId))
        clients.deleteMessage(messageId)
        await storage.updateMessage(roomId, messageId, { deleted: true, reveal: false })
    },
    async getFriendInfo(user_id: number): Promise<FriendInfo> {
        const data = await bot.getStrangerInfo(user_id)
        return {
            remark: data.nickname,
            sex: data.sex as Gender,
            user_id: data.user_id,
            age: data.age,
            nickname: data.nickname,
        }
    },
    async getFriendsFallback(cb) {
        const friends = await bot.getFriendList()
        const list: SearchableFriend[] = friends.map((them) => ({
            user_id: them.user_id,
            age: 0,
            sex: 'unknown',
            nickname: them.nickname,
            remark: them.remark,
            uin: them.user_id,
            nick: them.nickname,
            sc: (them.nickname + them.remark + them.user_id).toUpperCase(),
        }))
        cb(list)
    },
    async _getGroupMemberInfo(group: number, member: number, noCache: boolean) {
        const cacheKey = `${group}:${member}`
        if (!noCache) {
            const cached = memberInfoCache.get(cacheKey)
            if (cached && Date.now() - cached.timestamp < MEMBER_CACHE_TTL) {
                return cached.info
            }
        }
        const data = await bot.getGroupMemberInfo(group, member, noCache)
        const info = {
            ...data,
            rank: '',
            shutup_time: 0,
            update_time: 0,
            sex: data.sex as Gender,
            level: Number(data.level),
            role: data.role as GroupRole,
        }
        memberInfoCache.set(cacheKey, { info, timestamp: Date.now() })
        return info
    },
    async getGroupMemberInfo(group: number, member: number, noCache: boolean, resolve) {
        resolve(await adapter._getGroupMemberInfo(group, member, noCache))
    },
    setGroupNick(group: number, nick: string) {
        bot.setGroupCard(group, uin, nick)
    },
    async getGroupMembers(group: number, resolve) {
        try {
            const data = await bot.getGroupMemberList(group, true)
            const all: MemberInfo[] = data.map((them) => ({
                ...them,
                rank: '',
                shutup_time: 0,
                update_time: 0,
                sex: them.sex as Gender,
                level: Number(them.level),
                role: them.role as GroupRole,
            }))
            resolve(all)
        } catch (e) {
            clients.messageError('获取群成员列表失败')
            resolve([])
            return
        }
    },
    reportRead(messageId: string): any {
        bot.markMessageAsRead(Number(messageId))
    },
    async makeForward(
        fakes: FakeMessage | Iterable<FakeMessage>,
        dm?: boolean,
        origin?: number,
        target?: number,
    ): Promise<any> {
        if (!target) {
            clients.notify({
                title: '未实现',
                message: '未实现',
            })
        }
        if (!isArrayLike(fakes)) {
            fakes = [fakes as FakeMessage]
        }
        if (!Array.isArray(fakes)) {
            fakes = Array.from(fakes as Iterable<FakeMessage>)
        }
        const nodes = (fakes as Array<FakeMessage>).map((data) => ({
            type: 'node',
            data,
        })) as { type: 'node'; data: any }[]
        if (dm) {
            await bot.sendPrivateForwardMessage(target, nodes)
        } else {
            await bot.sendGroupForwardMessage(-target, nodes)
        }
    },
    setGroupBan(gin: number, uin: number, duration?: number): any {
        if (uin === 0) bot.setGroupWholeBan(gin, duration > 0)
        else bot.setGroupBan(gin, uin, duration)
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
    setGroupKick(gin: number, uin: number): any {
        bot.setGroupKick(gin, uin)
    },
    setGroupLeave(gin: number): any {
        bot.setGroupLeave(gin)
    },
    async getFriend(uin: number, resolve: (friend: FriendInfo) => any) {
        const list = await bot.getFriendList()
        const friend = list.find((f) => f.user_id === uin)
        resolve(friend && { ...friend, age: 0, sex: 'unknown' })
    },
    async getGroup(gin: number, resolve: (group: GroupInfo) => any) {
        const it = await bot.getGroupInfo(gin)
        await resolve({
            group_id: it.group_id,
            group_name: it.group_name,
            group_remark: '',
            shutup_time_me: 0,
            grade: it.group_level,
            create_time: it.group_create_time,
            active_member_count: 0,
            last_join_time: 0,
            last_sent_time: 0,
            max_admin_count: 0,
            owner_id: 0,
            max_member_count: it.max_member_count,
            member_count: it.member_count,
            shutup_time_whole: 0,
            update_time: 0,
        })
    },
    async getMsgNewURL(id: string, resolve): Promise<string> {
        const history = await adapter.getMsg(id)
        if (history.error) {
            console.log(history.error)
            if (history.error.message !== 'msg not exists') clients.messageError('错误：' + history.error.message)
            resolve('error')
            return
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
            await processMessage(data.message, message, {})
            if (message.file) {
                resolve(message.file.url || 'error')
                return
            }
        }
        resolve('error')
        return
    },
    getNTPicURLbyFileid(fileId: string, appid: string, resolve): Promise<string> {
        resolve(replaceRkey(`https://multimedia.nt.qq.com.cn/download?appid=${appid}&fileid=${fileId}`))
        return
    },
    async fetchHistory(messageId: string, roomId: number, loadedWindow?: MessageHistoryWindow) {
        console.log(`${roomId} 开始拉取消息`)
        clients.messageSuccess('开始拉取消息')
        let totalCount = 0
        const minDate = config.fetchHistoryMinDate ? new Date(config.fetchHistoryMinDate).getTime() : null
        let reachedMinDate = false
        while (true) {
            try {
                const history = await (roomId > 0
                    ? bot.getPrivateMessageHistory(roomId, Number(messageId))
                    : bot.getGroupMessageHistory(-roomId, Number(messageId)))
                const batchMessages: Message[] = []
                for (let i = 0; i < history.messages.length; i++) {
                    const data = history.messages[i]
                    // 检查日期限制
                    if (minDate && data.time * 1000 < minDate) {
                        reachedMinDate = true
                        break
                    }
                    const message: Message = {
                        senderId: data.sender.user_id,
                        username:
                            'group_id' in data
                                ? data.group_id
                                    ? data.anonymous
                                        ? data.anonymous.name
                                        : data.sender.nickname
                                    : data.sender.nickname
                                : data.sender.nickname,
                        content: '',
                        timestamp: formatDate('hh:mm:ss', new Date(data.time * 1000)),
                        date: formatDate('yyyy/MM/dd', new Date(data.time * 1000)),
                        _id: data.message_id,
                        time: data.time * 1000,
                        role: (data.sender as MemberBaseInfo).role,
                        title:
                            (data as GroupMessage).group_id && (data as GroupMessage).anonymous
                                ? '匿名'
                                : (data.sender as MemberBaseInfo).title,
                        files: [],
                        anonymousId:
                            (data as GroupMessage).group_id && (data as GroupMessage).anonymous
                                ? (data as GroupMessage).anonymous.id
                                : null,
                        anonymousflag:
                            (data as GroupMessage).group_id && (data as GroupMessage).anonymous
                                ? (data as GroupMessage).anonymous.flag
                                : null,
                        bubble_id: 0,
                    }
                    try {
                        await processMessage(data.message, message, {}, roomId, true)
                        if (await storage.isChatIgnored(message.senderId)) message.hide = true
                        batchMessages.push(message)
                    } catch (e) {
                        console.error(e)
                    }
                }
                // 检查第一条消息是否已存在（在存储之前检查）
                const firstOwnMsg =
                    roomId < 0
                        ? batchMessages[0] //群的话只要第一条消息就行
                        : batchMessages.find((e) => e.senderId == uin)
                const firstMsgExists = firstOwnMsg && (await storage.getMessage(roomId, firstOwnMsg._id as string))
                // 边拉边存：每批消息立即存入数据库
                if (batchMessages.length > 0) {
                    await storage.addMessages(roomId, batchMessages)
                    totalCount += batchMessages.length
                }
                if (reachedMinDate) break
                if (history.messages.length < 2 || batchMessages.length === 0) break
                messageId = batchMessages[0]._id as string
                //todo 所有消息都过一遍，数据库里面都有才能结束
                if (!firstOwnMsg || firstMsgExists) break
            } catch (e) {
                console.log(e)
                clients.messageError('错误：' + e.message)
                break
            }
        }
        console.log(`${roomId} 已拉取 ${totalCount} 条消息`)
        clients.messageSuccess(`已拉取 ${totalCount} 条消息`)
        storage
            .fetchMessagesInTimeRange(
                roomId,
                loadedWindow?.oldestTime,
                loadedWindow?.endTime ?? Date.now(),
                (loadedWindow?.loadedCount || 0) + 20,
            )
            .then((messages) => clients.setMessages(roomId, messages))
    },

    async fetch7DaysHistory() {
        clients.messageError('暂不支持该操作')
    },
    async getCookies(domain: any, resolve) {
        const res = await bot.getCookies(domain)
        bkn = Number(res.bkn)
        resolve(res.cookies)
    },
    async getRoamingStamp(no_cache: boolean | undefined, cb) {
        cb((await bot.getCustomStickers()).map((url, id) => ({ url, id })))
    },

    // 存储动作
    async fetchMessages(
        roomId: number,
        options: MessagePageOptions,
        client: Socket,
        callback: (arg0: Message[]) => void,
    ) {
        if (!options?.before) {
            storage.updateRoom(roomId, {
                unreadCount: 0,
                at: false,
            })
            if (roomId < 0) {
                const gid = -roomId
                const group = await bot.getGroupInfo(gid)
                if (group) client.emit('setShutUp', false)
                else {
                    client.emit('setShutUp', true)
                    client.emit('message', '你已经不是群成员了')
                }
            } else {
                client.emit('setShutUp', false)
            }
        }
        const messages = (await storage.fetchMessages(roomId, options || {}, 20)) || []
        if (messages.length && !options?.before && typeof messages[messages.length - 1]._id === 'string')
            adapter.reportRead(<string>messages[messages.length - 1]._id)
        for (const message of messages) {
            if (message.file?.url) {
                message.file.url = replaceRkey(message.file?.url)
            }
            if (Array.isArray(message.files)) {
                for (const file of message.files) {
                    if (file.url) {
                        file.url = replaceRkey(file.url)
                    }
                }
            }
            if (message.replyMessage?.file?.url) {
                message.replyMessage.file.url = replaceRkey(message.replyMessage.file?.url)
            }
        }
        callback(messages)
    },
    async fetchImageMessages(
        roomId: number,
        options: MessagePageOptions,
        client: Socket,
        callback: (arg0: Message[]) => void,
    ) {
        const messages = (await storage.fetchImageMessages(roomId, options || {}, 30)) || []
        for (const message of messages) {
            if (message.file?.url) {
                message.file.url = replaceRkey(message.file?.url)
            }
            if (Array.isArray(message.files)) {
                for (const file of message.files) {
                    if (file.url) {
                        file.url = replaceRkey(file.url)
                    }
                }
            }
        }
        callback(messages)
    },
    async fetchMessagesAround(
        roomId: number,
        messageId: string,
        before: number,
        after: number,
        client: Socket,
        callback: (arg0: Message[]) => void,
    ) {
        const messages = (await storage.fetchMessagesAround(roomId, messageId, before, after)) || []
        for (const message of messages) {
            if (message.file?.url) {
                message.file.url = replaceRkey(message.file?.url)
            }
            if (Array.isArray(message.files)) {
                for (const file of message.files) {
                    if (file.url) {
                        file.url = replaceRkey(file.url)
                    }
                }
            }
        }
        callback(messages)
    },
    async fetchMessagesBySender(
        roomId: number,
        senderId: number,
        options: MessagePageOptions,
        client: Socket,
        callback: (arg0: Message[]) => void,
    ) {
        const messages = (await storage.fetchMessagesBySender(roomId, String(senderId), options || {}, 20)) || []
        for (const message of messages) {
            if (message.file?.url) {
                message.file.url = replaceRkey(message.file?.url)
            }
            if (Array.isArray(message.files)) {
                for (const file of message.files) {
                    if (file.url) {
                        file.url = replaceRkey(file.url)
                    }
                }
            }
        }
        callback(messages)
    },
    async searchMessages(
        roomId: number,
        keyword: string,
        options: MessagePageOptions,
        client: Socket,
        callback: (arg0: Message[]) => void,
    ) {
        const messages = (await storage.searchMessages(roomId, keyword, options || {}, 20)) || []
        for (const message of messages) {
            if (message.file?.url) {
                message.file.url = replaceRkey(message.file?.url)
            }
            if (Array.isArray(message.files)) {
                for (const file of message.files) {
                    if (file.url) {
                        file.url = replaceRkey(file.url)
                    }
                }
            }
        }
        callback(messages)
    },
    addRoom(room: Room) {
        return storage.addRoom(room)
    },
    addChatGroup(chatGroup: ChatGroup) {
        return storage.addChatGroup(chatGroup)
    },
    async setRoomPriority(roomId: number, priority: 1 | 2 | 3 | 4 | 5) {
        await storage.updateRoom(roomId, { priority })
        clients.setAllRooms(await storage.getAllRooms())
    },
    async setRoomAutoDownload(roomId: number, autoDownload: boolean) {
        await storage.updateRoom(roomId, { autoDownload })
    },
    async setRoomAutoDownloadPath(roomId: number, downloadPath: string) {
        await storage.updateRoom(roomId, { downloadPath })
    },
    async pinRoom(roomId: number, pin: boolean) {
        await storage.updateRoom(roomId, { index: pin ? 1 : 0 })
        clients.setAllRooms(await storage.getAllRooms())
    },
    async ignoreChat(data: IgnoreChatInfo) {
        await storage.addIgnoredChat(data)
        await adapter.removeChat(data.id)
    },
    async removeChat(roomId: number) {
        await storage.removeRoom(roomId)
        clients.setAllRooms(await storage.getAllRooms())
    },
    async removeChatGroup(name: string) {
        await storage.removeChatGroup(name)
        clients.setAllChatGroups(await storage.getAllChatGroups())
    },
    async hideMessage(roomId: number, messageId: string) {
        await storage.updateMessage(roomId, messageId, { hide: true, reveal: false })
    },
    async revealMessage(roomId: number, messageId: string | number) {
        await storage.updateMessage(roomId, messageId, { hide: false, reveal: true })
    },
    getUnreadCount: async (priority: 1 | 2 | 3 | 4 | 5, resolve) => resolve(await storage.getUnreadCount(priority)),
    getFirstUnreadRoom: async (priority: 1 | 2 | 3 | 4 | 5, resolve) =>
        resolve(await storage.getFirstUnreadRoom(priority)),
    getRoom: async (roomId: number, resolve) => resolve(await storage.getRoom(roomId)),
    getMessageFromStorage: (roomId: number, msgId: string) => storage.getMessage(roomId, msgId),
    async getIgnoredChats(resolve) {
        resolve(await storage.getIgnoredChats())
    },
    removeIgnoredChat(roomId: number): any {
        return storage.removeIgnoredChat(roomId)
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
        if (gin == uin) {
            await bot.sendFriendPoke(uin)
            return
        }
        await bot.sendGroupPoke(gin, uin)
    },

    // 本地动作
    getUin: () => uin,
    async renewMessageURL(roomId: number, messageId: string | number, URL) {
        clients.renewMessageURL(messageId, URL)
    },
    getBkn: () => bkn,

    acquireGfs(gid: number) {
        const ls = async (fid?: string) => {
            let res: Awaited<ReturnType<typeof bot.gfsListDir>>
            if (!fid || fid === '/') {
                res = await bot.gfsListRoot(gid)
            } else {
                res = await bot.gfsListDir(gid, fid)
            }
            return [
                ...res.folders.map(
                    (it) =>
                        ({
                            fid: it.folder_id,
                            pid: fid || '/',
                            name: it.folder_name,
                            user_id: Number(it.creator),
                            create_time: Number(it.create_time),
                            file_count: Number(it.total_file_count),
                            is_dir: true,
                        }) satisfies GfsDirStat,
                ),
                ...res.files.map(
                    (it) =>
                        ({
                            fid: it.file_id,
                            pid: fid || '/',
                            name: it.file_name,
                            user_id: Number(it.uploader),
                            create_time: Number(it.modify_time),
                            size: Number(it.size),
                            duration: it.dead_time,
                            busid: it.busid,
                            md5: '',
                            sha1: '',
                            download_times: it.download_times,
                        }) satisfies GfsFileStat,
                ),
            ]
        }
        const download = (fid) => {
            return bot.gfsDownloadUrl(gid, fid)
        }
        return {
            gid,
            ls,
            dir: ls,
            stat: download,
            mkdir: (name) => {
                return bot.gfsMkdir(gid, name)
            },
            upload: async (file: MediaFile, pid?: string, name?: string) => {
                if (typeof file === 'object') {
                    const p = path.join('/app/.config/QQ/NapCat/temp', md5(file as Uint8Array))
                    await fsP.writeFile(p, file as any)
                    file = p
                }
                await bot.gfsUpload(gid, file, pid, name)
                if (file.startsWith('/app/.config/QQ/NapCat/temp')) {
                    await fsP.unlink(file)
                }
            },
            download,
        } as any
    },
    getPrivateFileUrl: async (fileId: string, cb) => {
        const { url } = await bot.getPrivateFileUrl(fileId)
        cb(url)
    },

    // 未支持动作
    disabledFeatures: ['IdLogin', 'OnlineStatus'],
    async sendPacket(type: string, cmd: string, body: any, cb) {
        cb()
    },
    async preloadImages(urls: string[]) {
        return false
    },
    async getSystemMsg(cb) {
        cb({})
    },
    setOnlineStatus(status: number) {
        return null
    },
    async getLoginDevices(cb) {
        cb([])
    },
    async deleteLoginDevice(flag: string) {
        return null
    },

    // 没必要实现的动作
    logOut() {
        broadcastDatabaseUpgradeProgress({ active: false, step: 0, total: 0, message: '' })
        return storage?.close()
    },
    randomDevice(username: number) {},
    reLogin() {},
    sliderLogin(ticket: string) {},
    submitSmsCode(smsCode: string) {},
}

const processMessage = createProcessMessage(adapter)

export default adapter
