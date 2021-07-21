import SendMessageParams from '../types/SendMessageParams'
import {
    Client, createClient,
    FriendInfo, FriendPokeEventData,
    FriendRecallEventData,
    GroupMessageEventData, GroupPokeEventData,
    GroupRecallEventData,
    MemberBaseInfo, MemberDecreaseEventData, MemberIncreaseEventData,
    MessageEventData, OfflineEventData, PrivateMessageEventData, Ret,
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

let bot: Client
let storage: MongoStorageProvider
let loginForm: LoginForm

let currentLoadedMessagesCount = 0
let loggedIn = false

type CookiesDomain = 'tenpay.com' | 'docs.qq.com' | 'office.qq.com' | 'connect.qq.com' |
    'vip.qq.com' | 'mail.qq.com' | 'qzone.qq.com' | 'gamecenter.qq.com' |
    'mma.qq.com' | 'game.qq.com' | 'qqweb.qq.com' | 'openmobile.qq.com' |
    'qun.qq.com' | 'ti.qq.com'

//region event handlers
const eventHandlers = {
    async onQQMessage(data: MessageEventData) {
        console.log(data)
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

        //可能要发通知，所以由客户端来决定
        broadcast('notify', {
            avatar: avatar,
            priority: room.priority,
            roomId, at, isSelfMsg,
            data: {
                title: room.roomName,
                body: (groupId ? senderName + ': ' : '') + lastMessage.content,
                hasReply: true,
                replyPlaceholder: 'Reply to ' + roomName,
            },
        })

        if (isSelfMsg) {
            room.unreadCount = 0
            room.at = false
        } else room.unreadCount++
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
        storage.updateMessage(data.user_id, data.message_id, {deleted: new Date()})
    },
    groupRecall(data: GroupRecallEventData) {
        clients.deleteMessage(data.message_id)
        storage.updateMessage(-data.group_id, data.message_id, {deleted: new Date()})
    },
    online() {
        clients.setOnline()
    },
    onOffline(data: OfflineEventData) {
        console.log(data)
        clients.setOffline(data.message)
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
            clients.addMessage(roomId, message)
            clients.updateRoom(room)
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
            clients.addMessage(room.roomId, message)
            clients.updateRoom(room)
            storage.updateRoom(room.roomId, room)
            storage.addMessage(room.roomId, message)
        }
    },
    async groupMemberIncrease(data: MemberIncreaseEventData) {
        console.log(data)
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
        console.log(data)
        const now = new Date(data.time * 1000)
        const groupId = data.group_id
        const senderId = data.user_id
        const operator = (await bot.getGroupMemberInfo(groupId, data.operator_id)).data
        let roomId = -groupId
        if (await storage.isChatIgnored(roomId)) return
        const message: Message = {
            _id: `${now.getTime()}-${groupId}-${senderId}`,
            content: (data.member ?
                (data.member.card ? data.member.card : data.member.nickname) :
                data.user_id) +
                (data.operator_id === data.user_id ? ' 离开了本群' :
                    ` 被 ${operator.card ? operator.card : operator.nickname} 踢了`),
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
}
const loginHandlers = {
    async onSucceed() {
        if (!loggedIn) {
            await initStorage()
            attachEventHandler()
        }
        if (loginForm.onlineStatus) {
            await bot.setOnlineStatus(loginForm.onlineStatus)
        }
        console.log('上线成功')
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
    bot.on('notice.friend.recall', eventHandlers.friendRecall)
    bot.on('notice.group.recall', eventHandlers.groupRecall)
    bot.on('system.online', eventHandlers.online)
    bot.on('system.offline', eventHandlers.onOffline)
    bot.on('notice.friend.poke', eventHandlers.friendPoke)
    bot.on('notice.group.poke', eventHandlers.groupPoke)
    bot.on('notice.group.increase', eventHandlers.groupMemberIncrease)
    bot.on('notice.group.decrease', eventHandlers.groupMemberDecrease)
}
const attachLoginHandler = () => {
    bot.on('system.online', loginHandlers.onSucceed)
}
//endregion

const adapter = {
    async getCookies(domain: CookiesDomain, resolve) {
        resolve(await bot.getCookies(domain)).data.cookies
    },
    //roomId 和 room 必有一个
    async sendMessage({content, roomId, file, replyMessage, room, b64img, imgpath}: SendMessageParams) {
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

        clients.closeLoading()
        if (data.error) {
            clients.notifyError({
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
    async getFriendsAndGroups(resolve) {
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
        resolve({
            friendsAll, groupsAll,
        })
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
            } else {
                client.emit('setShutUp', false)
            }
        }
        currentLoadedMessagesCount = offset + 20
        callback(await storage.fetchMessages(roomId, offset, 20))
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
                username: <string><unknown>data.nickname, //确信
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
    getGroupFileMeta: (gin: number, fid: string, resolve) => resolve(bot.acquireGfs(gin).download(fid)),
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
        console.log(res)
        if (!res.error) {
            clients.deleteMessage(messageId)
            await storage.updateMessage(roomId, messageId, {deleted: new Date()})
        } else {
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
    async fetchHistory(messageId: string, roomId: number) {
        const messages = []
        while (true) {
            const history = await bot.getChatHistory(messageId)
            console.log(history)
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
        console.log(messages)
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
        })
        clients.setAllRooms(await storage.getAllRooms())
    },
}

export default adapter
