import type oicqAdapter from './oicqAdapter'
import { config, saveUserConfig, userConfig } from '../providers/configManager'
import LoginForm from '@icalingua/types/LoginForm'
import StorageProvider from '@icalingua/types/StorageProvider'
import MongoStorageProvider from '@icalingua/storage-providers/MongoStorageProvider'
import RedisStorageProvider from '@icalingua/storage-providers/RedisStorageProvider'
import SQLStorageProvider from '@icalingua/storage-providers/SQLStorageProvider'
import { broadcast } from '../providers/socketIoProvider'
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
    GroupInfo,
    GroupMessageEventData,
    GroupRole,
    MemberBaseInfo,
    MemberInfo,
    MessageElem,
    PrivateMessageEventData,
    Ret,
} from 'oicq-icalingua-plus-plus'
import Message from '@icalingua/types/Message'
import createProcessMessage from '../utils/processMessage'
import formatDate from '../utils/formatDate'
import { Socket } from 'socket.io'
import SendMessageParams from '@icalingua/types/SendMessageParams'
import crypto from 'crypto'
import SearchableFriend from '@icalingua/types/SearchableFriend'
import { isArrayLike } from 'lodash'
import createRoom from '../utils/createRoom'

let bot: OnebotClient
let loginForm: LoginForm
let storage: StorageProvider
let uin: number
let nickname: string
let lastReceivedMessageInfo = {
    timestamp: 0,
    id: 0,
}

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
        await storage.connect()
        storage.getAllRooms().then((e) => {
            e.forEach(async (e) => {
                //更新群的名称
                if (e.roomId > -1) return
                const group = await bot.getGroupInfo(-e.roomId)
                if (group && group.group_name !== e.roomName) {
                    await storage.updateRoom(e.roomId, { roomName: group.group_name })
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
        const groupId = (data as GroupMessage).group_id
        const senderId = data.sender.user_id
        let roomId = groupId ? -groupId : data.user_id
        if (await storage.isChatIgnored(roomId)) return
        const isSelfMsg = uin === senderId
        let senderName: string
        if (groupId && (<GroupMessage>data).anonymous) senderName = (<GroupMessage>data).anonymous.name
        else if (groupId && isSelfMsg) senderName = 'You'
        else if (groupId) senderName = (data.sender as MemberBaseInfo).card || data.sender.nickname
        else senderName = (data.sender as FriendInfo).remark || data.sender.nickname
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
        const roomId = data.sender_id == uin ? data.user_id : data.sender_id
        if (await storage.isChatIgnored(roomId)) return
        const room = await storage.getRoom(roomId)
        if (room) {
            room.utime = data.time * 1000
            let msg = ''
            if (data.sender_id != uin) msg += room.roomName
            else msg += '你'
            msg += '戳了戳'
            // msg += data.action
            if (data.sender_id == data.target_id) msg += '自己'
            else if (data.target_id != uin) msg += room.roomName
            else msg += '你'
            // if (data.suffix) msg += data.suffix
            room.lastMessage = {
                content: msg,
                username: null,
                timestamp: formatDate('hh:mm'),
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
                files: [],
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
            const operatorObj = await bot.getGroupMemberInfo(data.group_id, data.user_id, false)
            const operator = operatorObj.card ? operatorObj.card : operatorObj.nickname
            const userObj = await bot.getGroupMemberInfo(data.group_id, data.user_id, false)
            const user = userObj.card ? userObj.card : userObj.nickname
            let msg = ''
            if (data.user_id !== uin) msg += operator
            else msg += '你'
            msg += '戳了戳'
            // msg += data.action
            if (data.user_id !== uin) msg += user
            else if (data.user_id === uin) msg += '自己'
            else msg += '你'
            // if (data.suffix) msg += data.suffix
            room.lastMessage = {
                content: msg,
                username: null,
                timestamp: formatDate('hh:mm'),
            }
            const message: Message = {
                username: '',
                content: msg,
                senderId: data.user_id,
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
        const message: Message = {
            _id: `${now.getTime()}-${groupId}-${senderId}`,
            content:
                data.user_id +
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
        }
        clients.addMessage(roomId, message)
        clients.updateRoom(room)
        storage.updateRoom(roomId, room)
        storage.addMessage(roomId, message)
    })
}

const adapter: typeof oicqAdapter = {
    loggedIn: false,
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
                `OneBot Backend: ${versionInfo.app_name} ${versionInfo.app_version}\n` +
                `${versionInfo.runtime_os} ${versionInfo.runtime_version}`,
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
                await processMessage(data.content, message, {})
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
        b64img,
        imgpath,
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
            // //群文件
            // if (roomId > 0) {
            //     clients.messageError('暂时无法向好友发送文件')
            //     return
            // }
            // const gfs = bot.acquireGfs(-roomId)
            // gfs.upload(file.path).then(ui.closeLoading)
            // ui.message('文件上传中')
            clients.messageError('Not implicated')
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

            if (roomId < 0)
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
                    url: imgpath && imgpath.startsWith('send_') ? imgpath.replace('send_', '') : b64img,
                },
            })
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
        const data = await bot.getGroupMemberInfo(group, member, noCache)
        return {
            ...data,
            rank: '',
            shutup_time: 0,
            update_time: 0,
            sex: data.sex as Gender,
            level: Number(data.level),
            role: data.role as GroupRole,
        }
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
            await bot.sendGroupForwardMessage(target, nodes)
        }
    },
    setGroupBan(gin: number, uin: number, duration?: number): any {
        bot.setGroupBan(gin, uin, duration)
    },
    setGroupAnonymousBan(gin: number, flag: string, duration?: number): any {
        bot.setGroupAnonymousBan(gin, flag, duration)
    },
    setGroupKick(gin: number, uin: number): any {
        bot.setGroupKick(gin, uin)
    },
    setGroupLeave(gin: number): any {
        bot.setGroupLeave(gin)
    },
    async getGroup(gin: number, resolve: (group: GroupInfo) => any) {
        const it = await bot.getGroupInfo(gin)
        await resolve({
            group_id: it.group_id,
            group_name: it.group_name,
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
    async fetchHistory(messageId: string, roomId: number, currentLoadedMessagesCount: number) {
        if (roomId > 0) return // 不支持
        console.log(`${roomId} 开始拉取消息`)
        clients.messageSuccess('开始拉取消息')
        const messages = []
        while (true) {
            try {
                const history = await bot.getGroupMessageHistory(-roomId, Number(messageId))
                const newMsgs: Message[] = []
                for (let i = 0; i < history.messages.length; i++) {
                    const data = history.messages[i]
                    const message: Message = {
                        senderId: data.sender.user_id,
                        username: data.group_id
                            ? data.anonymous
                                ? data.anonymous.name
                                : data.sender.nickname
                            : data.sender.nickname,
                        content: '',
                        timestamp: formatDate('hh:mm:ss', new Date(data.time * 1000)),
                        date: formatDate('yyyy/MM/dd', new Date(data.time * 1000)),
                        _id: data.message_id,
                        time: data.time * 1000,
                        role: (data.sender as MemberBaseInfo).role,
                        title: data.group_id && data.anonymous ? '匿名' : (data.sender as MemberBaseInfo).title,
                        files: [],
                        anonymousId: data.group_id && data.anonymous ? data.anonymous.id : null,
                        anonymousflag: data.group_id && data.anonymous ? data.anonymous.flag : null,
                        bubble_id: 0,
                    }
                    try {
                        await processMessage(data.message, message, {}, roomId)
                        if (await storage.isChatIgnored(message.senderId)) message.hide = true
                        messages.push(message)
                        newMsgs.push(message)
                    } catch (e) {
                        console.error(e)
                    }
                }
                if (history.messages.length < 2 || newMsgs.length === 0) break
                messageId = newMsgs[0]._id as string
                //todo 所有消息都过一遍，数据库里面都有才能结束
                const firstOwnMsg =
                    roomId < 0
                        ? newMsgs[0] //群的话只要第一条消息就行
                        : newMsgs.find((e) => e.senderId == uin)
                if (!firstOwnMsg || (await storage.getMessage(roomId, firstOwnMsg._id as string))) break
            } catch (e) {
                console.log(e)
                clients.messageError('错误：' + e.message)
                break
            }
        }
        // 私聊消息去重
        let messagesLength = messages.length
        if (roomId > 0) {
            for (let i = 0; i < messagesLength; i++) {
                if (messages[i].senderId != uin) continue
                try {
                    let messageIdBuf = Buffer.from(messages[i]._id as string, 'base64')
                    if (messageIdBuf.length != 17) continue
                    let timestamp = messageIdBuf.readUInt32BE(12)
                    const timeDiff = [0, -1, 1]
                    for (let j of timeDiff) {
                        messageIdBuf.writeUInt32BE(timestamp + j, 12)
                        if (await storage.getMessage(roomId, messageIdBuf.toString('base64'))) {
                            messages.splice(i, 1)
                            messagesLength--
                            i--
                            break
                        }
                    }
                } catch (e) {
                    console.error(e)
                }
            }
        }
        console.log(`${roomId} 已拉取 ${messages.length} 条消息`)
        clients.messageSuccess(`已拉取 ${messages.length} 条消息`)
        await storage.addMessages(roomId, messages)
        storage
            .fetchMessages(roomId, 0, currentLoadedMessagesCount + 20)
            .then((messages) => clients.setMessages(roomId, messages))
    },

    // 存储动作
    async fetchMessages(roomId: number, offset: number, client: Socket, callback: (arg0: Message[]) => void) {
        if (!offset) {
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
        const messages = (await storage.fetchMessages(roomId, offset, 20)) || []
        if (messages.length && !offset && messages.length && typeof messages[messages.length - 1]._id === 'string')
            adapter.reportRead(<string>messages[messages.length - 1]._id)
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
        clients.revealMessage(messageId)
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

    // 本地动作
    getUin: () => uin,
    async renewMessageURL(roomId: number, messageId: string | number, URL) {
        clients.renewMessageURL(messageId, URL)
    },

    // 可以做但是还没做的动作
    acquireGfs(gin: number) {
        return null
    },

    // 未支持动作
    disabledFeatures: ['IdLogin', 'WebApps', 'RemoteStickers', 'GroupFiles', 'OnlineStatus'],
    getBkn: () => 0,
    async getCookies(domain: any, resolve) {
        resolve()
    },
    async sendPacket(type: string, cmd: string, body: any, cb) {
        cb()
    },
    async preloadImages(urls: string[]) {
        return false
    },
    async getSystemMsg(cb) {
        cb({})
    },
    async getRoamingStamp(no_cache: boolean | undefined, cb) {
        cb([])
    },
    setOnlineStatus(status: number) {
        return null
    },
    async sendGroupPoke(gin: number, uin: number) {},

    // 没必要实现的动作
    logOut() {},
    randomDevice(username: number) {},
    reLogin() {},
    sliderLogin(ticket: string) {},
    submitSmsCode(smsCode: string) {},
}

const processMessage = createProcessMessage(adapter)

export default adapter
