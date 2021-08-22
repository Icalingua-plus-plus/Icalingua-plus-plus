import SendMessageParams from '../types/SendMessageParams'
import {
    Client, createClient,
    FriendInfo, FriendPokeEventData,
    FriendRecallEventData,
    GroupMessageEventData, GroupPokeEventData,
    GroupRecallEventData,
    MemberBaseInfo, MemberDecreaseEventData, MemberIncreaseEventData, MemberInfo, MessageElem,
    MessageEventData, OfflineEventData, PrivateMessageEventData, Ret, SyncReadedEventData,
} from 'oicq'
import LoginForm from '../types/LoginForm'
import getAvatarUrl from '../utils/getAvatarUrl'
import Message from '../types/Message'
import formatDate from '../utils/formatDate'
import createRoom from '../utils/createRoom'
import processMessage from '../utils/processMessage'
import MongoStorageProvider from '../providers/MongoStorageProvider'
import Room from '../types/Room'
import IgnoreChatInfo from '../types/IgnoreChatInfo'
import clients from '../utils/clients'
import {Socket} from 'socket.io'
import {broadcast} from '../providers/socketIoProvider'
import sleep from '../utils/sleep'
import getSysInfo from '../utils/getSysInfo'
import RoamingStamp from '../types/RoamingStamp'
import SearchableFriend from '../types/SearchableFriend'
import {config} from '../providers/configManager'

let bot: Client
let storage: MongoStorageProvider
let loginForm: LoginForm
let loggedIn = false

type CookiesDomain = 'tenpay.com' | 'docs.qq.com' | 'office.qq.com' | 'connect.qq.com' |
    'vip.qq.com' | 'mail.qq.com' | 'qzone.qq.com' | 'gamecenter.qq.com' |
    'mma.qq.com' | 'game.qq.com' | 'qqweb.qq.com' | 'openmobile.qq.com' |
    'qun.qq.com' | 'ti.qq.com'

//region event handlers
const eventHandlers = {
    async onQQMessage(data: MessageEventData) {
        if (config.custom)
            require('../custom').onMessage(data)
        const now = new Date(data.time * 1000)
        const groupId = (data as GroupMessageEventData).group_id
        const senderId = data.sender.user_id
        let roomId = groupId ? -groupId : data.user_id
        if (await storage.isChatIgnored(roomId)) return
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
        if (!room) {
            if (groupId) {
                const group = bot.gl.get(groupId)
                if (group && group.group_name !== roomName) roomName = group.group_name
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
        const at = message.at
        if (at) room.at = at

        if (!room.priority) {
            room.priority = groupId ? 2 : 4
        }

        //可能要发通知，所以由客户端来决定
        broadcast('notify', {
            avatar: avatar,
            priority: room.priority,
            roomId, at, isSelfMsg,
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
        }
        else room.unreadCount++
        room.utime = data.time * 1000
        room.lastMessage = lastMessage
        message.time = data.time * 1000
        clients.addMessage(room.roomId, message)
        clients.updateRoom(room)
        await storage.updateRoom(roomId, room)
        await storage.addMessage(roomId, message)
    },
    friendRecall(data: FriendRecallEventData) {
        clients.deleteMessage(data.message_id)
        storage.updateMessage(data.user_id, data.message_id, {deleted: true})
    },
    groupRecall(data: GroupRecallEventData) {
        clients.deleteMessage(data.message_id)
        storage.updateMessage(-data.group_id, data.message_id, {deleted: true})
    },
    online() {
        clients.setOnline()
    },
    onOffline(data: OfflineEventData) {
        clients.setOffline(data.message)
    },
    async friendPoke(data: FriendPokeEventData) {
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
            clients.addMessage(roomId, message)
            clients.updateRoom(room)
            storage.updateRoom(room.roomId, room)
            storage.addMessage(roomId, message)
        }
    },
    async groupPoke(data: GroupPokeEventData) {
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
            clients.addMessage(room.roomId, message)
            clients.updateRoom(room)
            storage.updateRoom(room.roomId, room)
            storage.addMessage(room.roomId, message)
        }
    },
    async groupMemberIncrease(data: MemberIncreaseEventData) {
        const now = new Date(data.time * 1000)
        const groupId = data.group_id
        const senderId = data.user_id
        let roomId = -groupId
        if (await storage.isChatIgnored(roomId)) return
        const message: Message = {
            _id: `${now.getTime()}-${groupId}-${senderId}`,
            content: `${data.nickname} 加入了本群`,
            username: data.nickname,
            senderId,
            time: data.time * 1000,
            timestamp: formatDate('hh:mm', now),
            date: formatDate('dd/MM/yyyy', now),
            system: true,
        }
        clients.addMessage(roomId, message)
        await storage.addMessage(roomId, message)
    },
    async groupMemberDecrease(data: MemberDecreaseEventData) {
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
            date: formatDate('dd/MM/yyyy', now),
            system: true,
        }
        clients.addMessage(roomId, message)
        await storage.addMessage(roomId, message)
    },
    async requestAdd(data) {
        //console.log(data)
        clients.sendAddRequest(data)
    },
    syncRead(data: SyncReadedEventData) {
        const roomId = data.sub_type === 'group' ? -data.group_id : data.user_id
        clients.syncRead(roomId)
        storage.updateRoom(roomId, {unreadCount: 0})
    },
}
const loginHandlers = {
    async onSucceed() {
        if (!loggedIn) {
            await initStorage()
            attachEventHandler()
            setInterval(adapter.sendOnlineData, 1000 * 60)
        }
        if (loginForm.onlineStatus) {
            await bot.setOnlineStatus(loginForm.onlineStatus)
        }
        console.log('上线成功')

        await sleep(3000)
        console.log('正在获取历史消息')
        {
            const rooms = await storage.getAllRooms()
            for (const i of rooms) {
                if (new Date().getTime() - i.utime > 1000 * 60 * 60 * 24 * 2) return
                const roomId = i.roomId
                let buffer: Buffer
                let uid = roomId
                if (roomId < 0) {
                    buffer = Buffer.alloc(21)
                    uid = -uid
                }
                else buffer = Buffer.alloc(17)
                buffer.writeUInt32BE(uid, 0)
                adapter.fetchHistory(buffer.toString('base64'), roomId, 0)
                await sleep(500)
            }
        }
    },
}
//endregion
//region utility functions
const initStorage = async () => {
    try {
        storage = new MongoStorageProvider(loginForm.mdbConnStr, loginForm.username)
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
        console.log('无法连接数据库')
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
    bot.on('request.friend.add', eventHandlers.requestAdd)
    bot.on('request.group.invite', eventHandlers.requestAdd)
    bot.on('request.group.add', eventHandlers.requestAdd)
    bot.on('sync.readed', eventHandlers.syncRead)
}
const attachLoginHandler = () => {
    bot.on('system.online', loginHandlers.onSucceed)
}
//endregion

const adapter = {
    reportRead(messageId: string): any {
        bot.reportReaded(messageId)
    },
    async getGroupMembers(group: number, resolve) {
        const values = (await bot.getGroupMemberList(group, true)).data.values()
        let iter: IteratorResult<MemberInfo, MemberInfo> = values.next()
        const all: MemberInfo[] = []
        while (!iter.done) {
            all.push(iter.value)
            iter = values.next()
        }
        resolve(all)
    },
    setGroupNick(group: number, nick: string) {
        bot.setGroupCard(group, bot.uin, nick)
    },
    async getGroupMemberInfo(group: number, member: number, resolve) {
        resolve((await bot.getGroupMemberInfo(group, member, true)).data)
    },
    async getFriendsFallback(cb) {
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
        cb(friendsAll)
    },
    async getIgnoredChats(resolve) {
        resolve(await storage.getIgnoredChats())
    },
    removeIgnoredChat(roomId: number): any {
        return storage.removeIgnoredChat(roomId)
    },
    async getCookies(domain: CookiesDomain, resolve) {
        try {
            resolve((await bot.getCookies(domain)).data.cookies)
        } catch (e) {
            resolve('')
        }
    },
    //roomId 和 room 必有一个
    async sendMessage({content, roomId, file, replyMessage, room, b64img, imgpath, at}: SendMessageParams) {
        if (!room) room = await storage.getRoom(roomId)
        if (!roomId) roomId = room.roomId
        if (file && file.type && !file.type.includes('image')) {
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

        const message: Message = {
            _id: '',
            senderId: bot.uin,
            username: 'You',
            content,
            timestamp: formatDate('hh:mm'),
            date: formatDate('dd/MM/yyyy'),
        }

        const chain: MessageElem[] = []

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

        clients.closeLoading()
        if (data.error) {
            clients.notifyError({
                title: 'Failed to send',
                message: data.error.message,
            })
            return
        }
        if (roomId > 0) {
            room.lastMessage = {
                content,
                timestamp: formatDate('hh:mm'),
            }
            if (file || b64img || imgpath) room.lastMessage.content += '[Image]'
            message._id = data.data.message_id
            room.utime = new Date().getTime()
            message.time = new Date().getTime()
            clients.updateRoom(room)
            clients.addMessage(room.roomId, message)
            storage.addMessage(roomId, message)
            storage.updateRoom(room.roomId, {
                utime: room.utime,
                lastMessage: room.lastMessage,
            })
        }
    },
    createBot(form: LoginForm) {
        bot = createClient(Number(form.username), {
            platform: Number(form.protocol),
            ignore_self: false,
            brief: true,
        })
        bot.setMaxListeners(233)
        loginForm = form
        attachLoginHandler()
        bot.login(form.password)
    },
    async getGroups(resolve) {
        const groups = bot.gl.values()
        let iterG = groups.next()
        const groupsAll = []
        while (!iterG.done) {
            const f = {...iterG.value}
            f.sc = (f.group_name + f.group_id).toUpperCase()
            groupsAll.push(f)
            iterG = groups.next()
        }
        resolve(groupsAll)
    },
    async fetchMessages(roomId: number, offset: number, client: Socket, callback: (arg0: Message[]) => void) {
        if (!offset) {
            storage.updateRoom(roomId, {
                unreadCount: 0,
                at: false,
            })
            if (roomId < 0) {
                const gid = -roomId
                const group = bot.gl.get(gid)
                if (group)
                    client.emit('setShutUp', !!group.shutup_time_me)
                else {
                    client.emit('setShutUp', true)
                    client.emit('message', '你已经不是群成员了')
                }
            }
            else if (roomId === bot.uin) {
                client.emit('setShutUp', true)
            }
            else {
                client.emit('setShutUp', false)
            }
        }
        const messages = await storage.fetchMessages(roomId, offset, 20)
        if (!offset && typeof messages[messages.length - 1]._id === 'string')
            adapter.reportRead(<string>messages[messages.length - 1]._id)
        callback(messages)
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
    sendGroupPoke(gin: number, uin: number) {
        return bot.sendGroupPoke(gin, uin)
    },
    addRoom(room: Room) {
        return storage.addRoom(room)
    },
    async getForwardMsg(resId: string, resolve) {
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
                date: formatDate('dd/MM/yyyy', new Date(data.time * 1000)),
                _id: i,
                time: data.time * 1000,
            }
            await processMessage(
                data.message,
                message,
                {},
            )
            messages.push(message)
        }
        resolve(messages)
    },

    getUin: () => bot.uin,
    getGroupFileMeta: async (gin: number, fid: string, resolve) => resolve(await bot.acquireGfs(gin).download(fid)),
    getUnreadCount: async (priority: 1 | 2 | 3 | 4 | 5, resolve) => resolve(await storage.getUnreadCount(priority)),
    getFirstUnreadRoom: async (priority: 1 | 2 | 3 | 4 | 5, resolve) => resolve(await storage.getFirstUnreadRoom(priority)),
    getRoom: async (roomId: number, resolve) => resolve(await storage.getRoom(roomId)),

    setOnlineStatus: (status: number) => bot.setOnlineStatus(status),
    logOut() {
        if (bot)
            bot.logout()
    },
    getMessageFromStorage: (roomId: number, msgId: string) => storage.getMessage(roomId, msgId),
    getMsg: (id: string) => bot.getMsg(id),

    async setRoomPriority(roomId: number, priority: 1 | 2 | 3 | 4 | 5) {
        await storage.updateRoom(roomId, {priority})
        clients.setAllRooms(await storage.getAllRooms())
    },
    async setRoomAutoDownload(roomId: number, autoDownload: boolean) {
        await storage.updateRoom(roomId, {autoDownload})
    },
    async setRoomAutoDownloadPath(roomId: number, downloadPath: string) {
        await storage.updateRoom(roomId, {downloadPath})
    },
    async pinRoom(roomId: number, pin: boolean) {
        await storage.updateRoom(roomId, {index: pin ? 1 : 0})
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
    async deleteMessage(roomId: number, messageId: string) {
        const res = await bot.deleteMsg(messageId)
        if (!res.error) {
            clients.deleteMessage(messageId)
            await storage.updateMessage(roomId, messageId, {deleted: true})
        }
        else {
            clients.notifyError({
                title: 'Failed to delete message',
                message: res.error.message,
            })
        }
    },
    async revealMessage(roomId: number, messageId: string | number) {
        clients.revealMessage(messageId)
        await storage.updateMessage(roomId, messageId, {reveal: true})
    },
    async fetchHistory(messageId: string, roomId: number, currentLoadedMessagesCount: number) {
        const messages = []
        while (true) {
            const history = await bot.getChatHistory(messageId)
            if (history.error) {
                console.log(history.error)
                clients.messageError('错误：' + history.error.message)
                break
            }
            const newMsgs: Message[] = []
            for (let i = 0; i < history.data.length; i++) {
                const data = history.data[i]
                const message = {
                    senderId: data.sender.user_id,
                    username: (<GroupMessageEventData>data).group_id
                        ? (<GroupMessageEventData>data).anonymous
                            ? (<GroupMessageEventData>data).anonymous.name
                            : (<GroupMessageEventData>data).sender.card || data.sender.nickname
                        : (<PrivateMessageEventData>data).sender.remark || data.sender.nickname,
                    content: '',
                    timestamp: formatDate('hh:mm', new Date(data.time * 1000)),
                    date: formatDate('dd/MM/yyyy', new Date(data.time * 1000)),
                    _id: data.message_id,
                    time: data.time * 1000,
                }
                await processMessage(
                    data.message,
                    message,
                    {},
                    roomId,
                )
                messages.push(message)
                newMsgs.push(message)
            }
            if (history.data.length < 2) break
            messageId = newMsgs[0]._id as string
            //todo 所有消息都过一遍，数据库里面都有才能结束
            const firstOwnMsg = roomId < 0 ?
                newMsgs[0] : //群的话只要第一条消息就行
                newMsgs.find(e => e.senderId == bot.uin)
            if (!firstOwnMsg || await storage.getMessage(roomId, firstOwnMsg._id as string)) break
        }
        console.log(`${roomId} 已拉取 ${messages.length} 条消息`)
        clients.messageSuccess(`已拉取 ${messages.length} 条消息`)
        await storage.addMessages(roomId, messages)
        storage.fetchMessages(roomId, 0, currentLoadedMessagesCount + 20)
            .then(messages => clients.setMessages(roomId, messages))
    },
    async sendOnlineData() {
        clients.sendOnlineData({
            online: bot.getStatus().data.online,
            nick: bot.nickname,
            uin: bot.uin,
            sysInfo: getSysInfo(),
        })
        clients.setAllRooms(await storage.getAllRooms())
    },
    async getRoamingStamp(no_cache: boolean | undefined, cb) {
        const roaming_stamp = (await bot.getRoamingStamp(no_cache)).data
        let stamps = []

        for (let index: number = roaming_stamp.length - 1; index >= 0; index--) {
            const stamp: RoamingStamp = {
                id: index,
                url: roaming_stamp[index],
            }

            stamps.push(stamp)
        }

        cb(stamps)
    },

    async getSystemMsg(cb) {
        const msgs = (await bot.getSystemMsg()).data
        let ret_msg = {}
        for (let index in msgs) {
            const flag = msgs[index].flag
            ret_msg[flag] = {...msgs[index]}
            //ret_msg.push({flag: {...msgs[index]}})
        }

        cb(ret_msg)
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
