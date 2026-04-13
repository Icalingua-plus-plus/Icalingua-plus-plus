import type oicqAdapter from './oicqAdapter'
import { config, saveUserConfig, userConfig } from '../providers/configManager'
import LoginForm from '@icalingua/types/LoginForm'
import StorageProvider from '@icalingua/types/StorageProvider'
import MongoStorageProvider from '@icalingua/storage-providers/MongoStorageProvider'
import RedisStorageProvider from '@icalingua/storage-providers/RedisStorageProvider'
import SQLStorageProvider from '@icalingua/storage-providers/SQLStorageProvider'
import { broadcast } from '../providers/socketIoProvider'
import MilkyClient, { IncomingMessage } from '../clients/MilkyClient'
import Room from '@icalingua/types/Room'
import axios from 'axios'
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
    MemberBaseInfo,
    MemberInfo,
    MessageElem,
    PrivateMessageEventData,
} from 'oicq-icalingua-plus-plus'
import Message from '@icalingua/types/Message'
import createProcessMessage from '../utils/processMessage'
import formatDate from '../utils/formatDate'
import { Socket } from 'socket.io'
import SendMessageParams from '@icalingua/types/SendMessageParams'
import SearchableFriend from '@icalingua/types/SearchableFriend'
import { isArrayLike } from 'lodash'
import createRoom from '../utils/createRoom'
import { encodeGroupMessageId, encodePrivateMessageId, decodeMessageId } from '../utils/milkyMessageId'
import { milkySegmentsToOicq, oicqSegmentsToMilky, oicqToMilkySegment } from '../utils/milkySegmentConverter'
import { OutgoingSegment } from '@saltify/milky-types'
import { deleteUploadedFile, getUploadedFileUri, getUploadedFileName, getTempDir } from '../utils/uploadFileManager'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

let bot: MilkyClient
let loginForm: LoginForm
let storage: StorageProvider
let uin: number
let bkn: number = 0
let nickname: string
let lastReceivedMessageInfo = {
    timestamp: 0,
    id: 0,
}

// 群成员信息缓存
const MEMBER_CACHE_TTL = 5 * 60 * 1000 // 5分钟
const memberInfoCache = new Map<string, { info: MemberInfo; timestamp: number }>()
const debug = process.env.MILKY_DEBUG === 'true' ? console.log : () => {}

// ==================== Rkey 管理 ====================
const RKEY_SERVICES = ['https://ss.xingzhige.com/music_card/rkey', 'https://secret-service.bietiaop.com/rkeys']

interface RkeyResponse {
    private_rkey: string
    group_rkey: string
    expired_time: number
    name?: string
}

let rkeyData: RkeyResponse | null = null

const fetchRkey = async (): Promise<RkeyResponse | null> => {
    try {
        const result = await new Promise<RkeyResponse>((resolve, reject) => {
            let rejected = 0
            const errors: Error[] = []
            RKEY_SERVICES.forEach((url) => {
                axios
                    .get<RkeyResponse>(url, { timeout: 5000 })
                    .then((res) => resolve(res.data))
                    .catch((e) => {
                        errors.push(e)
                        rejected++
                        if (rejected === RKEY_SERVICES.length) {
                            reject(new Error('All rkey services failed'))
                        }
                    })
            })
        })
        console.log('Rkey 已获取:', result.name || 'unknown')
        return result
    } catch (e) {
        console.error('获取 Rkey 失败:', e)
        return null
    }
}

const refreshRkeyIfNeeded = async () => {
    const now = Math.floor(Date.now() / 1000)
    if (!rkeyData || rkeyData.expired_time - now < 600) {
        rkeyData = await fetchRkey()
    }
}

const replaceRkey = (url: string): string => {
    if (!url) return url
    if (!rkeyData) return url
    if (!url.startsWith('https://multimedia.nt.qq.com.cn/download')) return url

    try {
        const u = new URL(url)
        let r = ''
        switch (u.searchParams.get('appid')) {
            case '1406': // private
                r = rkeyData.private_rkey
                break
            case '1407': // group
                r = rkeyData.group_rkey
                break
            default:
                return url
        }
        if (!r) return url
        if (r.startsWith('&rkey=')) r = r.slice('&rkey='.length)
        u.searchParams.set('rkey', r)
        return u.toString()
    } catch (e) {
        return url
    }
}

const processMessageRkey = (message: Message): void => {
    if (message.file?.url) {
        message.file.url = replaceRkey(message.file.url)
    }
    if (Array.isArray(message.files)) {
        for (const file of message.files) {
            if (file.url) {
                file.url = replaceRkey(file.url)
            }
        }
    }
    if (message.replyMessage?.file?.url) {
        message.replyMessage.file.url = replaceRkey(message.replyMessage.file.url)
    }
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
                if (e.roomId > -1) return
                try {
                    const group = await bot.getGroupInfo(-e.roomId)
                    if (group && group.group.group_name !== e.roomName) {
                        await storage.updateRoom(e.roomId, { roomName: group.group.group_name })
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
        const isGroup = data.message_scene === 'group'
        const groupId = isGroup ? Number(data.peer_id) : undefined
        const senderId = Number(data.sender_id)
        const isSelfMsg = uin === senderId
        let roomId = groupId ? -groupId : Number(data.peer_id)
        if (await storage.isChatIgnored(roomId)) return

        // 构造消息 ID（time 固定为 0，确保撤回事件能匹配）
        const messageId = isGroup
            ? encodeGroupMessageId(groupId, senderId, Number(data.message_seq), 0)
            : encodePrivateMessageId(Number(data.peer_id), Number(data.message_seq), 0, isSelfMsg)

        let senderName: string
        if (isGroup && isSelfMsg) {
            senderName = 'You'
        } else if (isGroup && data.group_member) {
            senderName = data.group_member.card || data.group_member.nickname
        } else if (data.friend) {
            senderName = data.friend.remark || data.friend.nickname
        } else {
            senderName = String(senderId)
        }

        let roomName: string
        if (isGroup && data.group) {
            roomName = data.group.group_name
        } else if (!isGroup) {
            roomName = data.friend?.remark || data.friend?.nickname || String(roomId)
        }

        const message: Message = {
            senderId: senderId,
            username: senderName,
            content: '',
            timestamp: formatDate('hh:mm:ss', now),
            date: formatDate('yyyy/MM/dd', now),
            _id: messageId,
            role: isGroup && data.group_member ? data.group_member.role : undefined,
            title: isGroup && data.group_member ? data.group_member.title : undefined,
            files: [],
        }

        let room = await storage.getRoom(roomId)
        if (!room) {
            room = createRoom(roomId, roomName)
            await storage.addRoom(room)
        } else {
            if (roomName && !room.roomName.startsWith(roomName)) {
                room.roomName = roomName
            }
        }

        // 转换消息段并处理
        debug('segments', data.segments)
        const oicqMessage = milkySegmentsToOicq(data.segments)
        debug('oicqMessage', oicqMessage)

        // 处理 reply 消息段中的 message_seq 转换为完整的 messageId
        // 以及私聊文件消息段补充 user_id
        for (let i = 0; i < oicqMessage.length; i++) {
            const seg = oicqMessage[i]
            if (seg.type === 'reply') {
                const replySeq = Number(seg.data.id)
                // 构造回复消息的 ID
                if (isGroup) {
                    seg.data.id = encodeGroupMessageId(groupId, 0, replySeq, 0)
                } else {
                    seg.data.id = encodePrivateMessageId(Number(data.peer_id), replySeq, 0, false)
                }
            } else if (seg.type === 'file' && !isGroup && seg.data.fid) {
                // 私聊文件：在 fid 前面加上 user_id，格式变为 user_id|file_id|file_hash
                seg.data.fid = `${roomId}|${seg.data.fid}`
            }
        }

        const lastMessage = {
            content: '',
            timestamp: formatDate('hh:mm', now),
            username: senderName,
            userId: senderId,
        }

        await processMessage(oicqMessage, message, lastMessage, roomId)
        processMessageRkey(message)

        const at = message.at
        if (at) room.at = at

        if (!room.priority) {
            room.priority = groupId ? 2 : 4
        }

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

        room.utime = data.time * 1000 + lastReceivedMessageInfo.id
        room.lastMessage = lastMessage
        message.time = data.time * 1000 + lastReceivedMessageInfo.id
        lastReceivedMessageInfo.id++
        if (await storage.isChatIgnored(senderId)) message.hide = true
        clients.addMessage(room.roomId, message)
        await storage.updateRoom(roomId, room)
        clients.updateRoom(room)
        storage.addMessage(roomId, message)
    })

    bot.on('messageRecall', async (data) => {
        const isGroup = data.message_scene === 'group'
        const roomId = isGroup ? -Number(data.peer_id) : Number(data.peer_id)
        const isSelf = Number(data.sender_id) === uin
        const messageId = isGroup
            ? encodeGroupMessageId(Number(data.peer_id), Number(data.sender_id), Number(data.message_seq), 0)
            : encodePrivateMessageId(Number(data.peer_id), Number(data.message_seq), 0, isSelf)
        clients.deleteMessage(messageId)
        storage.updateMessage(roomId, messageId, { deleted: true, reveal: false })
    })

    bot.on('friendNudge', async (data) => {
        debug('friendNudge', data)
        const roomId = data.user_id
        if (await storage.isChatIgnored(roomId)) return
        const room = await storage.getRoom(roomId)
        if (room) {
            room.utime = Date.now()
            let msg = ''
            if (data.is_self_send) msg += '你'
            else msg += room.roomName
            msg += data.display_action
            if (data.is_self_receive === data.is_self_send) msg += '自己'
            else if (data.is_self_receive) msg += '你'
            else if (data.is_self_send) msg += room.roomName
            msg += data.display_suffix
            room.lastMessage = {
                content: msg,
                username: null,
                timestamp: formatDate('hh:mm'),
                userId: data.is_self_send ? uin : data.user_id,
            }
            const message: Message = {
                username: '',
                content: msg,
                senderId: data.is_self_send ? uin : data.user_id,
                timestamp: formatDate('hh:mm:ss'),
                date: formatDate('yyyy/MM/dd'),
                _id: Date.now(),
                system: true,
                time: Date.now(),
                files: [],
            }
            clients.addMessage(roomId, message)
            clients.updateRoom(room)
            storage.updateRoom(room.roomId, room)
            storage.addMessage(roomId, message)
        }
    })

    bot.on('groupNudge', async (data) => {
        const roomId = -Number(data.group_id)
        if (await storage.isChatIgnored(roomId)) return
        const room = await storage.getRoom(roomId)
        if (room) {
            room.utime = Date.now()
            const senderId = Number(data.sender_id)
            const receiverId = Number(data.receiver_id)
            let senderName = String(senderId)
            let receiverName = String(receiverId)
            try {
                const senderInfo = await bot.getGroupMemberInfo(Number(data.group_id), senderId)
                senderName = senderInfo.member.card || senderInfo.member.nickname
            } catch {}
            try {
                const receiverInfo = await bot.getGroupMemberInfo(Number(data.group_id), receiverId)
                receiverName = receiverInfo.member.card || receiverInfo.member.nickname
            } catch {}

            let msg = ''
            if (senderId === uin) msg += '你'
            else msg += senderName
            msg += data.display_action
            if (receiverId === senderId) msg += '自己'
            else if (receiverId === uin) msg += '你'
            else msg += receiverName
            msg += data.display_suffix

            room.lastMessage = {
                content: msg,
                username: null,
                timestamp: formatDate('hh:mm'),
                userId: senderId,
            }
            const message: Message = {
                username: '',
                content: msg,
                senderId: senderId,
                timestamp: formatDate('hh:mm:ss'),
                date: formatDate('yyyy/MM/dd'),
                _id: Date.now(),
                system: true,
                time: Date.now(),
                files: [],
            }
            clients.addMessage(roomId, message)
            clients.updateRoom(room)
            storage.updateRoom(room.roomId, room)
            storage.addMessage(roomId, message)
        }
    })

    bot.on('groupMemberIncrease', async (data) => {
        const now = new Date()
        const groupId = Number(data.group_id)
        const senderId = Number(data.user_id)
        const roomId = -groupId
        if (await storage.isChatIgnored(roomId)) return
        let userDisplay = String(senderId)
        try {
            const userInfo = await bot.getGroupMemberInfo(groupId, senderId)
            userDisplay = userInfo.member.nickname
        } catch {}
        const message: Message = {
            _id: `${now.getTime()}-${groupId}-${senderId}`,
            content: `${userDisplay} 加入了本群`,
            username: userDisplay,
            senderId,
            time: now.getTime(),
            timestamp: formatDate('hh:mm:ss', now),
            date: formatDate('yyyy/MM/dd', now),
            system: true,
            files: [],
        }
        let room = await storage.getRoom(roomId)
        if (!room) {
            const group = await bot.getGroupInfo(groupId)
            let roomName = String(groupId)
            if (group && group.group.group_name) {
                roomName = group.group.group_name
            }
            room = createRoom(roomId, roomName)
            await storage.addRoom(room)
        }
        room.utime = now.getTime()
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

    bot.on('groupMemberDecrease', async (data) => {
        const now = new Date()
        const groupId = Number(data.group_id)
        const senderId = Number(data.user_id)
        const operatorId = data.operator_id ? Number(data.operator_id) : null
        const roomId = -groupId
        if (await storage.isChatIgnored(roomId)) return
        let userDisplay = String(senderId)
        let operatorDisplay = operatorId ? String(operatorId) : null
        try {
            const userInfo = await bot.getUserProfile(senderId)
            userDisplay = `${userInfo.nickname}(${senderId})`
        } catch {}
        if (operatorId) {
            try {
                const opInfo = await bot.getGroupMemberInfo(groupId, operatorId)
                operatorDisplay = opInfo.member.card || opInfo.member.nickname
            } catch {}
        }
        let content: string
        if (operatorId && operatorId !== senderId) {
            content = `${userDisplay} 被 ${operatorDisplay} 移出了本群`
        } else {
            content = `${userDisplay} 退出了本群`
        }
        const message: Message = {
            _id: `${now.getTime()}-${groupId}-${senderId}`,
            content,
            username: userDisplay,
            senderId,
            time: now.getTime(),
            timestamp: formatDate('hh:mm:ss', now),
            date: formatDate('yyyy/MM/dd', now),
            system: true,
            files: [],
        }
        let room = await storage.getRoom(roomId)
        if (room) {
            room.utime = now.getTime()
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
        }
    })

    bot.on('groupMute', async (data) => {
        const now = new Date()
        const groupId = Number(data.group_id)
        const roomId = -groupId
        if (await storage.isChatIgnored(roomId)) return
        const room = await storage.getRoom(roomId)
        if (!room) return
        const operatorId = Number(data.operator_id)
        const userId = Number(data.user_id)
        const duration = data.duration
        let operatorName = String(operatorId)
        let userName = String(userId)
        try {
            const opInfo = await bot.getGroupMemberInfo(groupId, operatorId)
            operatorName = opInfo.member.card || opInfo.member.nickname
        } catch {}
        try {
            const userInfo = await bot.getGroupMemberInfo(groupId, userId)
            userName = userInfo.member.card || userInfo.member.nickname
        } catch {}
        let content: string
        if (duration === 0) {
            content = `${operatorName} 解除了 ${userName} 的禁言`
        } else {
            const minutes = Math.floor(duration / 60)
            const hours = Math.floor(minutes / 60)
            const days = Math.floor(hours / 24)
            let durationStr = ''
            if (days > 0) durationStr += `${days}天`
            if (hours % 24 > 0) durationStr += `${hours % 24}小时`
            if (minutes % 60 > 0) durationStr += `${minutes % 60}分钟`
            if (!durationStr) durationStr = `${duration}秒`
            content = `${operatorName} 禁言了 ${userName} ${durationStr}`
        }
        const message: Message = {
            _id: `mute-${now.getTime()}-${groupId}-${userId}`,
            content,
            username: '',
            senderId: operatorId,
            time: now.getTime(),
            timestamp: formatDate('hh:mm:ss', now),
            date: formatDate('yyyy/MM/dd', now),
            system: true,
            files: [],
        }
        room.utime = now.getTime()
        room.lastMessage = {
            content,
            username: '',
            timestamp: formatDate('hh:mm', now),
            userId: operatorId,
        }
        clients.addMessage(roomId, message)
        clients.updateRoom(room)
        storage.updateRoom(roomId, room)
        storage.addMessage(roomId, message)
    })

    bot.on('groupWholeMute', async (data) => {
        const now = new Date()
        const groupId = Number(data.group_id)
        const roomId = -groupId
        if (await storage.isChatIgnored(roomId)) return
        const room = await storage.getRoom(roomId)
        if (!room) return
        const operatorId = Number(data.operator_id)
        let operatorName = String(operatorId)
        try {
            const opInfo = await bot.getGroupMemberInfo(groupId, operatorId)
            operatorName = opInfo.member.card || opInfo.member.nickname
        } catch {}
        const content = data.is_mute ? `${operatorName} 开启了全员禁言` : `${operatorName} 关闭了全员禁言`
        const message: Message = {
            _id: `wholemute-${now.getTime()}-${groupId}`,
            content,
            username: '',
            senderId: operatorId,
            time: now.getTime(),
            timestamp: formatDate('hh:mm:ss', now),
            date: formatDate('yyyy/MM/dd', now),
            system: true,
            files: [],
        }
        room.utime = now.getTime()
        room.lastMessage = {
            content,
            username: '',
            timestamp: formatDate('hh:mm', now),
            userId: operatorId,
        }
        clients.addMessage(roomId, message)
        clients.updateRoom(room)
        storage.updateRoom(roomId, room)
        storage.addMessage(roomId, message)
    })

    bot.on('groupAdminChange', async (data) => {
        const now = new Date()
        const groupId = Number(data.group_id)
        const roomId = -groupId
        if (await storage.isChatIgnored(roomId)) return
        const room = await storage.getRoom(roomId)
        if (!room) return
        const userId = Number(data.user_id)
        let userName = String(userId)
        try {
            const userInfo = await bot.getGroupMemberInfo(groupId, userId)
            userName = userInfo.member.card || userInfo.member.nickname
        } catch {}
        const content = data.is_set ? `${userName} 成为了管理员` : `${userName} 被取消了管理员`
        const message: Message = {
            _id: `admin-${now.getTime()}-${groupId}-${userId}`,
            content,
            username: '',
            senderId: userId,
            time: now.getTime(),
            timestamp: formatDate('hh:mm:ss', now),
            date: formatDate('yyyy/MM/dd', now),
            system: true,
            files: [],
        }
        room.utime = now.getTime()
        room.lastMessage = {
            content,
            username: '',
            timestamp: formatDate('hh:mm', now),
            userId,
        }
        clients.addMessage(roomId, message)
        clients.updateRoom(room)
        storage.updateRoom(roomId, room)
        storage.addMessage(roomId, message)
    })

    bot.on('groupFileUpload', async (data) => {
        const now = new Date()
        const groupId = Number(data.group_id)
        const roomId = -groupId
        if (await storage.isChatIgnored(roomId)) return
        const room = await storage.getRoom(roomId)
        if (!room) return
        const userId = Number(data.user_id)
        let userName = String(userId)
        try {
            const userInfo = await bot.getGroupMemberInfo(groupId, userId)
            userName = userInfo.member.card || userInfo.member.nickname
        } catch {}
        const content = `${userName} 上传了文件 ${data.file_name}`
        const message: Message = {
            _id: `file-${now.getTime()}-${groupId}-${data.file_id}`,
            content,
            username: userName,
            senderId: userId,
            time: now.getTime(),
            timestamp: formatDate('hh:mm:ss', now),
            date: formatDate('yyyy/MM/dd', now),
            system: true,
            files: [],
        }
        room.utime = now.getTime()
        room.lastMessage = {
            content,
            username: userName,
            timestamp: formatDate('hh:mm', now),
            userId,
        }
        clients.addMessage(roomId, message)
        clients.updateRoom(room)
        storage.updateRoom(roomId, room)
        storage.addMessage(roomId, message)
    })

    bot.on('friendRequest', async (data) => {
        debug('friendRequest', data)
        const flag = `milky_friend:${data.initiator_uid}:false`
        clients.sendAddRequest({
            sub_type: 'add',
            user_id: data.initiator_id,
            nickname: String(data.initiator_id),
            comment: data.comment,
            source: data.via,
            flag,
            age: 0,
            sex: 'unknown',
        })
    })

    bot.on('groupJoinRequest', async (data) => {
        debug('groupJoinRequest', data)
        const flag = `milky_group_join:${data.notification_seq}:${data.group_id}:${data.is_filtered}`
        let groupName = String(data.group_id)
        try {
            const group = await bot.getGroupInfo(data.group_id)
            groupName = group.group.group_name
        } catch {}
        clients.sendAddRequest({
            sub_type: 'add',
            group_id: data.group_id,
            group_name: groupName,
            user_id: data.initiator_id,
            nickname: String(data.initiator_id),
            comment: data.comment,
            flag,
            role: 'member',
        })
    })

    bot.on('groupInvitedJoinRequest', async (data) => {
        debug('groupInvitedJoinRequest', data)
        const flag = `milky_group_invited:${data.notification_seq}:${data.group_id}:false`
        let groupName = String(data.group_id)
        try {
            const group = await bot.getGroupInfo(data.group_id)
            groupName = group.group.group_name
        } catch {}
        clients.sendAddRequest({
            sub_type: 'add',
            group_id: data.group_id,
            group_name: groupName,
            user_id: data.target_user_id,
            nickname: String(data.target_user_id),
            comment: `由 ${data.initiator_id} 邀请`,
            flag,
            role: 'member',
        })
    })

    bot.on('groupInvitation', async (data) => {
        debug('groupInvitation', data)
        const flag = `milky_group_invitation:${data.invitation_seq}:${data.group_id}`
        let groupName = String(data.group_id)
        try {
            const group = await bot.getGroupInfo(data.group_id)
            groupName = group.group.group_name
        } catch {}
        clients.sendAddRequest({
            sub_type: 'invite',
            group_id: data.group_id,
            group_name: groupName,
            user_id: data.initiator_id,
            nickname: String(data.initiator_id),
            flag,
            role: 'member',
        })
    })

    bot.on('groupNameChange', async (data) => {
        debug('groupNameChange', data)
        const groupId = Number(data.group_id)
        const roomId = -groupId
        const room = await storage.getRoom(roomId)
        if (!room) return
        const operatorId = Number(data.operator_id)
        let operatorName = String(operatorId)
        try {
            const opInfo = await bot.getGroupMemberInfo(groupId, operatorId)
            operatorName = opInfo.member.card || opInfo.member.nickname
        } catch {}
        room.roomName = data.new_group_name
        const now = new Date()
        const content = `${operatorName} 修改了群名为「${data.new_group_name}」`
        const message: Message = {
            _id: `groupname-${now.getTime()}-${groupId}`,
            content,
            username: '',
            senderId: operatorId,
            time: now.getTime(),
            timestamp: formatDate('hh:mm:ss', now),
            date: formatDate('yyyy/MM/dd', now),
            system: true,
            files: [],
        }
        room.utime = now.getTime()
        room.lastMessage = {
            content,
            username: '',
            timestamp: formatDate('hh:mm', now),
            userId: operatorId,
        }
        clients.addMessage(roomId, message)
        clients.updateRoom(room)
        storage.updateRoom(roomId, room)
        storage.addMessage(roomId, message)
    })

    bot.on('groupEssenceMessageChange', async (data) => {
        debug('groupEssenceMessageChange', data)
        const groupId = Number(data.group_id)
        const roomId = -groupId
        if (await storage.isChatIgnored(roomId)) return
        const room = await storage.getRoom(roomId)
        if (!room) return
        const operatorId = Number(data.operator_id)
        let operatorName = String(operatorId)
        try {
            const opInfo = await bot.getGroupMemberInfo(groupId, operatorId)
            operatorName = opInfo.member.card || opInfo.member.nickname
        } catch {}
        const now = new Date()
        const content = data.is_set ? `${operatorName} 设置了一条精华消息` : `${operatorName} 移除了一条精华消息`
        const message: Message = {
            _id: `essence-${now.getTime()}-${groupId}-${data.message_seq}`,
            content,
            username: '',
            senderId: operatorId,
            time: now.getTime(),
            timestamp: formatDate('hh:mm:ss', now),
            date: formatDate('yyyy/MM/dd', now),
            system: true,
            files: [],
        }
        room.utime = now.getTime()
        room.lastMessage = {
            content,
            username: '',
            timestamp: formatDate('hh:mm', now),
            userId: operatorId,
        }
        clients.addMessage(roomId, message)
        clients.updateRoom(room)
        storage.updateRoom(roomId, room)
        storage.addMessage(roomId, message)
    })

    bot.on('friendFileUpload', async (data) => {
        const now = new Date()
        const roomId = Number(data.user_id)
        if (await storage.isChatIgnored(roomId)) return
        const room = await storage.getRoom(roomId)
        if (!room) return
        const content = `收到文件 ${data.file_name}`
        const message: Message = {
            _id: `file-${now.getTime()}-${roomId}-${data.file_id}`,
            content,
            username: room.roomName,
            senderId: data.is_self ? uin : roomId,
            time: now.getTime(),
            timestamp: formatDate('hh:mm:ss', now),
            date: formatDate('yyyy/MM/dd', now),
            system: true,
            files: [],
        }
        room.utime = now.getTime()
        room.lastMessage = {
            content,
            username: room.roomName,
            timestamp: formatDate('hh:mm', now),
            userId: data.is_self ? uin : roomId,
        }
        clients.addMessage(roomId, message)
        clients.updateRoom(room)
        storage.updateRoom(roomId, room)
        storage.addMessage(roomId, message)
    })

    bot.on('botOffline', async (data) => {
        console.log('Milky 断线:', data.reason)
        clients.setOffline(data.reason)
        // 尝试重连
        const reconnect = async () => {
            try {
                console.log('尝试重新连接 Milky...')
                await bot.connect()
                console.log('Milky 重连成功')
                clients.setOnline()
            } catch (e) {
                console.error('Milky 重连失败:', e.message)
                // 10秒后重试
                setTimeout(reconnect, 10000)
            }
        }
        setTimeout(reconnect, 5000)
    })
}

const adapter: typeof oicqAdapter = {
    loggedIn: false,
    async createBot(form: LoginForm) {
        loginForm = form
        const milkyConfig = config.milky
        const milkyUrl = typeof milkyConfig === 'string' ? milkyConfig : milkyConfig.url
        const milkyAccessToken = typeof milkyConfig === 'string' ? undefined : milkyConfig.accessToken
        bot = new MilkyClient(milkyUrl, milkyAccessToken)
        try {
            await bot.connect()
            uin = bot.uin
            nickname = bot.nickname
            adapter.loggedIn = true
        } catch (e) {
            console.error('连接 Milky 服务端失败:', e)
            broadcast('fatal', '连接 Milky 服务端失败: ' + e.message)
            return
        }
        console.log(`Milky 已连接，登录账号: ${uin} (${nickname})`)
        userConfig.account = loginForm
        userConfig.account.autologin = true
        userConfig.account.username = String(uin)
        saveUserConfig()
        await initStorage()
        attachEventHandler()
        setInterval(adapter.sendOnlineData, 1000 * 60)
        clients.setAllRooms(await storage.getAllRooms())
        clients.setAllChatGroups(await storage.getAllChatGroups())
        adapter.sendOnlineData()
        // 初始化 rkey 并定时刷新
        refreshRkeyIfNeeded()
        setInterval(refreshRkeyIfNeeded, 1000 * 60 * 10)
        broadcast('login', { uin, nick: nickname, sysInfo: getSysInfo() })
    },
    async getGroups(resolve) {
        const groups = await bot.getGroupList()
        const groupsAll: Array<GroupInfo & { sc: string }> = groups.groups.map((it) => ({
            group_id: it.group_id,
            group_name: it.group_name,
            group_remark: '',
            shutup_time_me: 0,
            grade: 0,
            create_time: 0,
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

        // 语音消息处理
        if (file && file.type && file.type.startsWith('audio')) {
            try {
                let audioUri: string
                let tempFilePath: string | null = null

                if (b64img) {
                    // 从 base64 数据创建临时文件
                    const base64Data = b64img.replace(/^data:.+;base64,/, '')
                    const buffer = Buffer.from(base64Data, 'base64')

                    // 生成临时文件名
                    const hash = crypto.createHash('md5').update(buffer).digest('hex')
                    const ext = file.type === 'audio/silk' ? 'slk' : 'audio'
                    tempFilePath = path.join(getTempDir(), `voice-${hash}.${ext}`)

                    // 写入临时文件
                    fs.writeFileSync(tempFilePath, buffer)
                    audioUri = `file://${tempFilePath}`
                } else if (file.path) {
                    // 直接使用文件路径
                    audioUri = file.path.startsWith('http') ? file.path : `file://${file.path}`
                } else {
                    throw new Error('语音消息缺少数据')
                }

                // 构造语音消息段
                const chain: OutgoingSegment[] = []
                chain.push({
                    type: 'record',
                    data: { uri: audioUri },
                })

                // 发送消息
                if (roomId > 0) {
                    await bot.sendPrivateMessage(roomId, chain)
                } else {
                    await bot.sendGroupMessage(-roomId, chain)
                }

                // 清理临时文件
                if (tempFilePath && fs.existsSync(tempFilePath)) {
                    try {
                        fs.unlinkSync(tempFilePath)
                    } catch (e) {
                        console.error('清理临时语音文件失败:', e)
                    }
                }

                clients.closeLoading()
                return
            } catch (e) {
                clients.notifyError({
                    title: '语音发送失败',
                    message: e.message,
                })
                clients.closeLoading()
                return
            }
        }

        // 文件上传
        if (file && ((file.type && !file.type.includes('image')) || !file.type)) {
            const fileUri = getUploadedFileUri(file.path)
            const fileName = getUploadedFileName(file.path)
            if (!fileUri || !fileName) {
                clients.messageError('文件上传失败：找不到已上传的文件')
                clients.closeLoading()
                return
            }
            if (roomId > 0) {
                // 私聊文件
                bot.uploadPrivateFile(roomId, fileUri, fileName)
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
                // 群文件
                bot.uploadGroupFile(-roomId, fileUri, fileName)
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

        const chain: OutgoingSegment[] = []

        if (replyMessage) {
            const decoded = decodeMessageId(replyMessage._id as string)
            if (decoded) {
                chain.push({
                    type: 'reply',
                    data: { message_seq: decoded.messageSeq },
                })
            }
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
            const FACE_REGEX = /\[Face: (\d+)]/
            let splitContent = [content]
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
            const newParts: string[] = []
            for (let part of splitContent) {
                if (at.find((e) => e.text === part)) {
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
            for (const part of splitContent) {
                const atInfo = at.find((e) => e.text === part)
                const isFace = FACE_REGEX.test(part)
                if (atInfo) {
                    if (atInfo.id === 'all') {
                        chain.push({ type: 'mention_all', data: {} })
                    } else {
                        chain.push({ type: 'mention', data: { user_id: Number(atInfo.id) } })
                    }
                } else if (isFace) {
                    const faceId = FACE_REGEX.exec(part)[1]
                    chain.push({ type: 'face', data: { face_id: faceId, is_large: false } })
                } else if (messageType === 'text') {
                    chain.push({ type: 'text', data: { text: part } })
                }
            }
        }

        if (b64img) {
            chain.push({
                type: 'image',
                data: {
                    uri: 'base64://' + b64img.replace(/^data:.+;base64,/, ''),
                    sub_type: sticker ? 'sticker' : 'normal',
                },
            })
        } else if (imgpath) {
            chain.push({
                type: 'image',
                data: {
                    uri: imgpath.startsWith('http') ? imgpath : `file://${imgpath}`,
                    sub_type: sticker ? 'sticker' : 'normal',
                },
            })
        } else if (file) {
            chain.push({
                type: 'image',
                data: {
                    uri: file.path.startsWith('http') ? file.path : `file://${file.path}`,
                    sub_type: sticker ? 'sticker' : 'normal',
                },
            })
        }

        // 处理 QLottie 表情
        if (messageType === 'text' && content) {
            const idReg = content.match(/\[QLottie: (\d+)\,(\d+)\]/)
            if (idReg && idReg.length >= 3 && content === idReg[0]) {
                const faceId = idReg[2]
                chain.length = 0
                chain.push({
                    type: 'face',
                    data: { face_id: faceId, is_large: false },
                })
            }
        }

        try {
            if (roomId > 0) {
                await bot.sendPrivateMessage(roomId, chain)
            } else {
                await bot.sendGroupMessage(-roomId, chain)
            }
        } catch (e) {
            clients.notifyError({
                title: 'Failed to send',
                message: e.message,
            })
            clients.addMessageText(content)
        }
        clients.closeLoading()
    },
    async deleteMessage(roomId: number, messageId: string) {
        const decoded = decodeMessageId(messageId)
        if (!decoded) {
            clients.messageError('无法解析消息 ID')
            return
        }
        try {
            if (decoded.type === 'group') {
                await bot.recallGroupMessage(decoded.groupId, decoded.messageSeq)
            } else {
                await bot.recallPrivateMessage(decoded.peerId, decoded.messageSeq)
            }
            clients.deleteMessage(messageId)
            await storage.updateMessage(roomId, messageId, { deleted: true, reveal: false })
        } catch (e) {
            clients.messageError('撤回失败: ' + e.message)
        }
    },
    async getMsg(id: string): Promise<any> {
        const decoded = decodeMessageId(id)
        if (!decoded) {
            return { error: { message: 'Invalid message ID' }, data: null, status: 'failed', retcode: -1 }
        }
        try {
            const scene = decoded.type === 'group' ? 'group' : 'friend'
            const peerId = decoded.type === 'group' ? decoded.groupId : decoded.peerId
            const result = await bot.getMessage(scene, peerId, decoded.messageSeq)
            const msg = result.message
            const oicqMessage = milkySegmentsToOicq(msg.segments)
            return {
                data: {
                    message: oicqMessage,
                    message_id: id,
                    message_type: msg.message_scene === 'group' ? 'group' : 'private',
                    sender: {
                        user_id: Number(msg.sender_id),
                        nickname: msg.group_member?.nickname || msg.friend?.nickname || String(msg.sender_id),
                    },
                    time: msg.time,
                    group_id: msg.message_scene === 'group' ? Number(msg.peer_id) : undefined,
                    raw_message: '',
                } as any,
                error: null,
                status: 'ok',
                retcode: 0,
            }
        } catch (e) {
            return { error: { message: e.message }, data: null, status: 'failed', retcode: -1 }
        }
    },
    async fetchHistory(messageId: string, roomId: number, currentLoadedMessagesCount: number) {
        console.log(`${roomId} 开始拉取消息`)
        clients.messageSuccess('开始拉取消息')
        let totalCount = 0
        const isGroup = roomId < 0
        const peerId = isGroup ? -roomId : roomId
        const scene = isGroup ? 'group' : 'friend'
        let startSeq: number | undefined
        if (messageId) {
            const decoded = decodeMessageId(messageId)
            if (decoded) {
                startSeq = decoded.messageSeq
            }
        }
        debug('startSeq', startSeq)
        const minDate = config.fetchHistoryMinDate ? new Date(config.fetchHistoryMinDate).getTime() : null
        let reachedMinDate = false
        try {
            while (true) {
                const history = await bot.getHistoryMessages(scene as any, peerId, startSeq, 30)
                console.log('history', history.messages.length, history.next_message_seq)
                if (!history.messages || history.messages.length === 0) {
                    console.log('no messages')
                    break
                }
                const batchMessages: Message[] = []
                for (const msg of history.messages) {
                    // 检查日期限制
                    if (minDate && msg.time * 1000 < minDate) {
                        console.log('reached minDate, stopping')
                        reachedMinDate = true
                    }
                    const senderId = Number(msg.sender_id)
                    const isSelfMsg = senderId === uin
                    const msgId = isGroup
                        ? encodeGroupMessageId(peerId, senderId, Number(msg.message_seq), 0)
                        : encodePrivateMessageId(peerId, Number(msg.message_seq), 0, isSelfMsg)
                    let senderName: string
                    if (isGroup && msg.group_member) {
                        senderName = msg.group_member.card || msg.group_member.nickname
                    } else if (msg.friend) {
                        senderName = msg.friend.remark || msg.friend.nickname
                    } else {
                        senderName = String(senderId)
                    }
                    const message: Message = {
                        senderId,
                        username: senderName,
                        content: '',
                        timestamp: formatDate('hh:mm:ss', new Date(msg.time * 1000)),
                        date: formatDate('yyyy/MM/dd', new Date(msg.time * 1000)),
                        _id: msgId,
                        time: msg.time * 1000,
                        role: isGroup && msg.group_member ? msg.group_member.role : undefined,
                        title: isGroup && msg.group_member ? msg.group_member.title : undefined,
                        files: [],
                    }
                    const oicqMessage = milkySegmentsToOicq(msg.segments)
                    try {
                        await processMessage(oicqMessage, message, {}, roomId, true)
                        processMessageRkey(message)
                        if (await storage.isChatIgnored(senderId)) message.hide = true
                        batchMessages.push(message)
                    } catch (e) {
                        console.error(e)
                    }
                }
                // 检查第一条消息是否已存在（在存储之前检查）
                // 同时用 time=0 和 time=实际时间 两种格式查，兼容新旧消息
                const firstMsg = batchMessages[0]
                const firstRawMsg = history.messages[0]
                let firstMsgExists = false
                if (firstMsg && firstRawMsg) {
                    const msgIdWithTime = isGroup
                        ? encodeGroupMessageId(
                              peerId,
                              Number(firstRawMsg.sender_id),
                              Number(firstRawMsg.message_seq),
                              firstRawMsg.time,
                          )
                        : encodePrivateMessageId(
                              peerId,
                              Number(firstRawMsg.message_seq),
                              firstRawMsg.time,
                              Number(firstRawMsg.sender_id) === uin,
                          )
                    firstMsgExists = !!(
                        (await storage.getMessage(roomId, firstMsg._id as string)) ||
                        (await storage.getMessage(roomId, msgIdWithTime))
                    )
                }
                // 边拉边存：每批消息立即存入数据库
                if (batchMessages.length > 0) {
                    await storage.addMessages(roomId, batchMessages)
                    totalCount += batchMessages.length
                }
                if (reachedMinDate) {
                    console.log('reachedMinDate break')
                    break
                }
                if (!history.next_message_seq) {
                    console.log('no next message seq break')
                    break
                }
                startSeq = Number(history.next_message_seq)
                if (firstMsgExists) {
                    console.log('firstMsg exists break', firstMsg._id)
                    break
                }
            }
        } catch (e) {
            console.error(e)
            clients.messageError('拉取消息失败: ' + e.message)
        }
        console.log(`${roomId} 已拉取 ${totalCount} 条消息`)
        clients.messageSuccess(`已拉取 ${totalCount} 条消息`)
        storage
            .fetchMessages(roomId, 0, currentLoadedMessagesCount + 20)
            .then((messages) => clients.setMessages(roomId, messages))
    },
    async getFriendsFallback(cb) {
        const friends = await bot.getFriendList()
        const list: SearchableFriend[] = friends.friends.map((them) => ({
            user_id: them.user_id,
            age: 0,
            sex: them.sex as Gender,
            nickname: them.nickname,
            remark: them.remark,
            uin: them.user_id,
            nick: them.nickname,
            sc: (them.nickname + them.remark + them.user_id).toUpperCase(),
        }))
        cb(list)
    },
    async getFriendInfo(user_id: number): Promise<FriendInfo> {
        try {
            const data = await bot.getUserProfile(user_id)
            return {
                remark: data.remark || data.nickname,
                sex: data.sex as Gender,
                user_id: user_id,
                age: data.age,
                nickname: data.nickname,
            }
        } catch {
            return {
                remark: String(user_id),
                sex: 'unknown',
                user_id: user_id,
                age: 0,
                nickname: String(user_id),
            }
        }
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
        const m = data.member
        const info = {
            group_id: m.group_id,
            user_id: m.user_id,
            nickname: m.nickname,
            card: m.card,
            sex: m.sex as Gender,
            age: 0,
            area: '',
            join_time: m.join_time,
            last_sent_time: m.last_sent_time,
            level: m.level,
            role: m.role as GroupRole,
            unfriendly: false,
            title: m.title,
            title_expire_time: 0,
            card_changeable: true,
            shutup_time: m.shut_up_end_time || 0,
            rank: '',
            update_time: 0,
            subid: 0,
        }
        memberInfoCache.set(cacheKey, { info, timestamp: Date.now() })
        return info
    },
    async getGroupMemberInfo(group: number, member: number, noCache: boolean, resolve) {
        resolve(await adapter._getGroupMemberInfo(group, member, noCache))
    },
    async getGroupMembers(group: number, resolve) {
        try {
            const data = await bot.getGroupMemberList(group)
            const all: MemberInfo[] = data.members.map((m) => ({
                group_id: m.group_id,
                user_id: m.user_id,
                nickname: m.nickname,
                card: m.card,
                sex: m.sex as Gender,
                age: 0,
                area: '',
                join_time: m.join_time,
                last_sent_time: m.last_sent_time,
                level: m.level,
                role: m.role as GroupRole,
                unfriendly: false,
                title: m.title,
                title_expire_time: 0,
                card_changeable: true,
                shutup_time: m.shut_up_end_time || 0,
                rank: '',
                update_time: 0,
                subid: 0,
            }))
            resolve(all)
        } catch (e) {
            console.error('获取群成员列表失败', 'group:', group, e)
            resolve([])
        }
    },
    setGroupNick(group: number, nick: string) {
        bot.setGroupMemberCard(group, uin, nick)
    },
    setGroupBan(gin: number, uin: number, duration?: number) {
        bot.setGroupMemberMute(gin, uin, duration || 0)
    },
    setGroupKick(gin: number, uin: number) {
        bot.kickGroupMember(gin, uin)
    },
    setGroupLeave(gin: number) {
        bot.quitGroup(gin)
    },
    async sendGroupPoke(gin: number, uin: number) {
        if (gin === uin) {
            await bot.sendFriendNudge(uin)
        } else {
            await bot.sendGroupNudge(gin, uin)
        }
    },
    reportRead(messageId: string) {
        const decoded = decodeMessageId(messageId)
        if (!decoded) return
        const scene = decoded.type === 'group' ? 'group' : 'friend'
        const peerId = decoded.type === 'group' ? decoded.groupId : decoded.peerId
        bot.markMessageAsRead(scene as any, peerId, decoded.messageSeq)
    },
    async getCookies(domain: any, resolve) {
        try {
            const res = await bot.getCookies(domain)
            resolve(res.cookies)
        } catch {
            resolve('')
        }
    },
    async getForwardMsg(resId: string, fileName: string, resolve) {
        try {
            const history = await bot.getForwardedMessages(resId)
            debug('history', history.messages)
            debug('history.messages[0].segments', history.messages[0].segments)
            const messages: Message[] = []
            for (let i = 0; i < history.messages.length; i++) {
                const data = history.messages[i]
                const oicqMessage = milkySegmentsToOicq(data.segments)
                const message: Message = {
                    senderId: data.avatar_url as any,
                    mirai: { eqq: { avatarUrl: data.avatar_url } },
                    username: data.sender_name,
                    content: '',
                    timestamp: formatDate('hh:mm:ss', new Date(data.time * 1000)),
                    date: formatDate('yyyy/MM/dd', new Date(data.time * 1000)),
                    _id: i.toString(),
                    time: data.time * 1000,
                    files: [],
                }
                await processMessage(oicqMessage, message, {})
                messages.push(message)
            }
            resolve(messages)
        } catch (e) {
            console.error(e)
            resolve([
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
            ])
        }
    },
    async getGroup(gin: number, resolve) {
        const it = await bot.getGroupInfo(gin)
        resolve({
            group_id: it.group.group_id,
            group_name: it.group.group_name,
            group_remark: '',
            shutup_time_me: 0,
            grade: 0,
            create_time: 0,
            active_member_count: 0,
            last_join_time: 0,
            last_sent_time: 0,
            max_admin_count: 0,
            owner_id: 0,
            max_member_count: it.group.max_member_count,
            member_count: it.group.member_count,
            shutup_time_whole: 0,
            update_time: 0,
        })
    },
    async getFriend(uin: number, resolve) {
        try {
            const data = await bot.getFriendInfo(uin)
            resolve({
                user_id: data.friend.user_id,
                nickname: data.friend.nickname,
                remark: data.friend.remark,
                sex: data.friend.sex as Gender,
                age: 0,
            })
        } catch {
            resolve(null)
        }
    },

    // 存储相关
    async fetchMessages(roomId: number, offset: number, client: Socket, callback: (arg0: Message[]) => void) {
        if (!offset) {
            storage.updateRoom(roomId, { unreadCount: 0, at: false })
            if (roomId < 0) {
                try {
                    await bot.getGroupInfo(-roomId)
                    client.emit('setShutUp', false)
                } catch {
                    client.emit('setShutUp', true)
                    client.emit('message', '你已经不是群成员了')
                }
            } else {
                client.emit('setShutUp', false)
            }
        }
        // 刷新 rkey（如果需要）
        await refreshRkeyIfNeeded()
        const messages = (await storage.fetchMessages(roomId, offset, 20)) || []
        // 替换消息中的 rkey
        for (const message of messages) {
            processMessageRkey(message)
        }
        if (messages.length && !offset && typeof messages[messages.length - 1]._id === 'string') {
            adapter.reportRead(messages[messages.length - 1]._id as string)
        }
        callback(messages)
    },
    async fetchImageMessages(
        roomId: number,
        offset: number,
        endTime: number | undefined,
        client: Socket,
        callback: (arg0: Message[]) => void,
    ) {
        // 刷新 rkey（如果需要）
        await refreshRkeyIfNeeded()
        const messages = (await storage.fetchImageMessages(roomId, offset, 30, endTime)) || []
        // 替换消息中的 rkey
        for (const message of messages) {
            processMessageRkey(message)
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
        // 刷新 rkey（如果需要）
        await refreshRkeyIfNeeded()
        const messages = (await storage.fetchMessagesAround(roomId, messageId, before, after)) || []
        // 替换消息中的 rkey
        for (const message of messages) {
            processMessageRkey(message)
        }
        callback(messages)
    },
    async fetchMessagesBySender(
        roomId: number,
        senderId: number,
        offset: number,
        client: Socket,
        callback: (arg0: Message[]) => void,
    ) {
        await refreshRkeyIfNeeded()
        const messages = (await storage.fetchMessagesBySender(roomId, String(senderId), offset, 20)) || []
        for (const message of messages) {
            processMessageRkey(message)
        }
        callback(messages)
    },
    async searchMessages(
        roomId: number,
        keyword: string,
        offset: number,
        client: Socket,
        callback: (arg0: Message[]) => void,
    ) {
        await refreshRkeyIfNeeded()
        const messages = (await storage.searchMessages(roomId, keyword, offset, 20)) || []
        for (const message of messages) {
            processMessageRkey(message)
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
        clients.revealMessage(messageId)
        await storage.updateMessage(roomId, messageId, { hide: false, reveal: true })
    },
    getUnreadCount: async (priority, resolve) => resolve(await storage.getUnreadCount(priority)),
    getFirstUnreadRoom: async (priority, resolve) => resolve(await storage.getFirstUnreadRoom(priority)),
    getRoom: async (roomId, resolve) => resolve(await storage.getRoom(roomId)),
    getMessageFromStorage: async (roomId, msgId) => {
        let msg = await storage.getMessage(roomId, msgId)
        if (!msg && roomId > 0) {
            // 私聊消息：回复时构造的 ID isSelf 固定为 false，但原消息可能是自己发的（isSelf=true）
            // 翻转 isSelf 标志位再查一次
            const decoded = decodeMessageId(msgId)
            if (decoded && decoded.type === 'private') {
                const altId = encodePrivateMessageId(decoded.peerId, decoded.messageSeq, 0, !decoded.isSelf)
                msg = await storage.getMessage(roomId, altId)
            }
        }
        return msg
    },
    async getIgnoredChats(resolve) {
        resolve(await storage.getIgnoredChats())
    },
    removeIgnoredChat(roomId: number) {
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
    getUin: () => uin,
    getBkn: () => bkn,
    async renewMessageURL(roomId: number, messageId: string | number, URL) {
        clients.renewMessageURL(messageId, URL)
    },

    // 群文件系统
    acquireGfs(gid: number) {
        const ls = async (fid?: string) => {
            const res = await bot.getGroupFiles(gid, fid || '/')
            return [
                ...res.folders.map(
                    (it) =>
                        ({
                            fid: it.folder_id,
                            pid: it.parent_folder_id,
                            name: it.folder_name,
                            user_id: it.creator_id,
                            create_time: it.created_time,
                            file_count: it.file_count,
                            is_dir: true,
                        }) satisfies GfsDirStat,
                ),
                ...res.files.map(
                    (it) =>
                        ({
                            fid: it.file_id,
                            pid: it.parent_folder_id,
                            name: it.file_name,
                            user_id: it.uploader_id,
                            create_time: it.uploaded_time,
                            size: it.file_size,
                            duration: it.expire_time || 0,
                            busid: 0,
                            md5: '',
                            sha1: '',
                            download_times: it.downloaded_times,
                        }) satisfies GfsFileStat,
                ),
            ]
        }
        const download = async (fid: string) => {
            const res = await bot.getGroupFileDownloadUrl(gid, fid)
            return { url: res.download_url }
        }
        return {
            gid,
            ls,
            dir: ls,
            stat: download,
            mkdir: (name: string) => bot.createGroupFolder(gid, name),
            upload: async (fileUri: string, pid?: string, fileName?: string) => {
                // fileUri 可能是本地路径或 file:// URI
                const uri = fileUri.startsWith('file://') ? fileUri : `file://${fileUri}`
                const name = fileName || fileUri.split('/').pop() || 'file'
                await bot.uploadGroupFile(gid, uri, name, pid || '/')
            },
            download,
        } as any
    },
    async getPrivateFileUrl(fileId: string, cb) {
        debug('getPrivateFileUrl', fileId)
        // fileId 格式: user_id|file_id|file_hash (由 milkyAdapter 和 milkySegmentConverter 序列化)
        const parts = fileId.split('|')
        if (parts.length < 2) {
            clients.messageError('私聊文件 ID 格式错误')
            cb('')
            return
        }
        const [userId, fid, fileHash] = parts
        try {
            // LLBot 没有 fileHash
            const result = await bot.getPrivateFileDownloadUrl(Number(userId), fid, fileHash || '')
            cb(result.download_url)
        } catch (e) {
            console.error('获取私聊文件下载链接失败:', e)
            clients.messageError('获取私聊文件下载链接失败: ' + e.message)
            cb('')
        }
        debug('getPrivateFileUrl done')
    },

    async sendOnlineData() {
        try {
            const implInfo = await bot.getImplInfo()
            clients.sendOnlineData({
                online: true,
                nick: nickname,
                uin,
                sysInfo:
                    getSysInfo() +
                    '\n\n' +
                    `Milky Backend: ${implInfo.impl_name} ${implInfo.impl_version}` +
                    `\nProtocol: ${implInfo.qq_protocol_type} ${implInfo.qq_protocol_version}`,
                bkn: 0,
            })
            clients.setAllRooms(await storage.getAllRooms())
            clients.setAllChatGroups(await storage.getAllChatGroups())
        } catch (e) {
            console.error('sendOnlineData error:', e)
        }
    },

    // 未实现/不支持的功能
    disabledFeatures: ['IdLogin', 'OnlineStatus'],
    async handleRequest(type: 'friend' | 'group', flag: string, accept: boolean = true) {
        try {
            if (flag.startsWith('milky_friend:')) {
                // flag 格式: milky_friend:{initiator_uid}:{is_filtered}
                const parts = flag.split(':')
                const initiatorUid = parts[1]
                const isFiltered = parts[2] === 'true'
                if (accept) {
                    await bot.acceptFriendRequest(initiatorUid, isFiltered)
                } else {
                    await bot.rejectFriendRequest(initiatorUid, isFiltered)
                }
            } else if (flag.startsWith('milky_group_join:') || flag.startsWith('milky_group_invited:')) {
                // flag 格式: milky_group_join:{notification_seq}:{group_id}:{is_filtered}
                //          milky_group_invited:{notification_seq}:{group_id}:{is_filtered}
                const parts = flag.split(':')
                const notificationSeq = Number(parts[1])
                const groupId = Number(parts[2])
                const isFiltered = parts[3] === 'true'
                const notificationType = flag.startsWith('milky_group_join:')
                    ? ('join_request' as const)
                    : ('invited_join_request' as const)
                if (accept) {
                    await bot.acceptGroupRequest(notificationSeq, notificationType, groupId, isFiltered)
                } else {
                    await bot.rejectGroupRequest(notificationSeq, notificationType, groupId, isFiltered)
                }
            } else if (flag.startsWith('milky_group_invitation:')) {
                // flag 格式: milky_group_invitation:{invitation_seq}:{group_id}
                const parts = flag.split(':')
                const invitationSeq = Number(parts[1])
                const groupId = Number(parts[2])
                if (accept) {
                    await bot.acceptGroupInvitation(groupId, invitationSeq)
                } else {
                    await bot.rejectGroupInvitation(groupId, invitationSeq)
                }
            } else {
                clients.messageError('未知的请求标志: ' + flag)
            }
        } catch (e) {
            console.error('处理请求失败:', e)
            clients.messageError('处理请求失败: ' + e.message)
        }
        return null
    },
    async getGroupFileMeta(gin, fid, resolve) {
        debug('getGroupFileMeta', gin, fid)
        try {
            const res = await bot.getGroupFileDownloadUrl(gin, fid)
            debug('getGroupFileMeta res', res)
            resolve({ url: res.download_url })
        } catch (e) {
            console.error(e)
            clients.messageError('获取群文件元数据失败')
            resolve({ url: '' })
        }
    },
    async sendGroupSign(gin) {
        clients.messageError('Milky 适配器不支持群签到')
    },
    async renewMessage(roomId, messageId, message) {
        const res = await adapter.getMsg(messageId)
        if (!res.error && res.data) {
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
            }
            try {
                await processMessage(res.data.message, newMessage, {}, roomId)
                await storage.replaceMessage(roomId, messageId, newMessage)
                clients.renewMessage(roomId, messageId, newMessage)
            } catch (e) {
                console.error(e)
            }
        } else {
            clients.messageError('错误：' + (res.error?.message || '未知错误'))
        }
    },
    async getMsgNewURL(id, resolve): Promise<string> {
        // 从存储中获取消息，找到 resource_id
        const decoded = decodeMessageId(id)
        if (!decoded) {
            resolve('error')
            return 'error'
        }
        const roomId = decoded.type === 'group' ? -decoded.groupId : decoded.peerId
        const message = await storage.getMessage(roomId, id)
        if (!message || !message.file?.fid) {
            resolve('error')
            return 'error'
        }
        try {
            const result = await bot.getResourceTempUrl(message.file.fid)
            resolve(result.url)
            return result.url
        } catch (e) {
            console.error('获取资源临时 URL 失败:', e)
            resolve('error')
            return 'error'
        }
    },
    async fetch7DaysHistory() {
        clients.messageError('Milky 适配器不支持该操作')
    },
    async getRoamingStamp(no_cache, cb) {
        try {
            const result = await bot.getCustomFaceUrlList()
            cb(result.urls || [])
        } catch (e) {
            debug('获取收藏表情失败:', e.message)
            cb([])
        }
    },
    async makeForward(fakes, dm, origin, target) {
        if (!target) {
            clients.messageError('Milky 适配器需要指定目标才能发送转发消息')
            return
        }
        if (!isArrayLike(fakes)) {
            fakes = [fakes as FakeMessage]
        }
        if (!Array.isArray(fakes)) {
            fakes = Array.from(fakes as Iterable<FakeMessage>)
        }

        // 将 FakeMessage 转换为 Milky OutgoingForwardedMessage 格式
        const messages = (fakes as FakeMessage[]).map((fake) => {
            // 转换消息内容为 Milky segments
            const segments: OutgoingSegment[] = []
            if (Array.isArray(fake.message)) {
                for (const elem of fake.message) {
                    const converted = oicqToMilkySegment(elem as any)
                    if (converted) {
                        segments.push(converted)
                    }
                }
            } else if (typeof fake.message === 'string') {
                segments.push({ type: 'text', data: { text: fake.message } })
            }

            return {
                user_id: fake.user_id,
                sender_name: fake.nickname,
                segments,
            }
        })

        // 构造 forward 消息段
        const forwardSegment: OutgoingSegment = {
            type: 'forward',
            data: {
                messages,
            },
        } as OutgoingSegment

        try {
            if (dm) {
                await bot.sendPrivateMessage(target, [forwardSegment])
            } else {
                await bot.sendGroupMessage(-target, [forwardSegment])
            }
            clients.messageSuccess('转发消息发送成功')
        } catch (e) {
            console.error('发送转发消息失败:', e)
            clients.messageError('发送转发消息失败: ' + e.message)
        }
    },
    setGroupAnonymousBan(gin, flag, duration) {
        clients.messageError('Milky 适配器不支持匿名禁言')
    },
    setGroupRemark(gin, remark) {
        clients.messageError('Milky 适配器不支持设置群备注')
    },
    setFriendRemark(uin, remark) {
        clients.messageError('Milky 适配器不支持设置好友备注')
    },
    async sendPacket(type, cmd, body, cb) {
        cb()
    },
    async preloadImages(urls) {
        return false
    },
    async getSystemMsg(cb) {
        try {
            const ret_msg = {}
            // 拉取好友请求
            try {
                const friendReqs = await bot.getFriendRequests()
                for (const req of friendReqs.requests) {
                    const flag = `milky_friend:${req.initiator_uid}:${req.is_filtered}`
                    ret_msg[flag] = {
                        sub_type: 'add',
                        user_id: req.initiator_id,
                        nickname: String(req.initiator_id),
                        comment: req.comment,
                        source: req.via,
                        flag,
                        age: 0,
                        sex: 'unknown',
                    }
                }
            } catch (e) {
                debug('获取好友请求失败:', e.message)
            }
            // 拉取群通知
            try {
                const groupNotifs = await bot.getGroupNotifications()
                for (const notif of groupNotifs.notifications) {
                    let flag: string
                    let data: any
                    let groupName = String(notif.group_id)
                    try {
                        const group = await bot.getGroupInfo(notif.group_id)
                        groupName = group.group.group_name
                    } catch {}
                    if (notif.notification_type === 'join_request') {
                        flag = `milky_group_join:${notif.notification_seq}:${notif.group_id}:${notif.is_filtered}`
                        data = {
                            sub_type: 'add',
                            group_id: notif.group_id,
                            group_name: groupName,
                            user_id: notif.initiator_id,
                            nickname: String(notif.initiator_id),
                            comment: notif.comment || '',
                            flag,
                            role: 'member',
                        }
                    } else if (notif.notification_type === 'invited_join_request') {
                        flag = `milky_group_invited:${notif.notification_seq}:${notif.group_id}:${notif.is_filtered}`
                        data = {
                            sub_type: 'add',
                            group_id: notif.group_id,
                            group_name: groupName,
                            user_id: notif.target_user_id,
                            nickname: String(notif.target_user_id),
                            comment: `由 ${notif.initiator_id} 邀请`,
                            flag,
                            role: 'member',
                        }
                    } else {
                        continue
                    }
                    ret_msg[flag] = data
                }
            } catch (e) {
                debug('获取群通知失败:', e.message)
            }
            cb(ret_msg)
        } catch (e) {
            console.error('getSystemMsg error:', e)
            cb({})
        }
    },
    setOnlineStatus(status) {
        return null
    },
    async getLoginDevices(cb) {
        cb([])
    },
    async deleteLoginDevice(flag) {
        return null
    },
    logOut() {},
    randomDevice(username) {},
    reLogin() {},
    sliderLogin(ticket) {},
    submitSmsCode(smsCode) {},
}

const processMessage = createProcessMessage(adapter)

export default adapter
