import IgnoreChatInfo from '@icalingua/types/IgnoreChatInfo'
import Message from '@icalingua/types/Message'
import Room from '@icalingua/types/Room'
import ChatGroup from '@icalingua/types/ChatGroup'
import StorageProvider from '@icalingua/types/StorageProvider'
import { Db, MongoClient } from 'mongodb'

export default class MongoStorageProvider implements StorageProvider {
    id: string | number
    connStr: string
    mdb: Db

    constructor(connStr: string, id: string | number) {
        this.id = id
        this.connStr = connStr
    }

    removeIgnoredChat(id: number): Promise<any> {
        return this.mdb.collection('ignoredChats').deleteOne({ id })
    }

    async getAllRooms(): Promise<Room[]> {
        try {
            return await this.mdb
                .collection<Room>('rooms')
                .find({}, { sort: [['utime', -1]] })
                .toArray()
        } catch (e) {
            return []
        }
    }

    async getAllChatGroups(): Promise<ChatGroup[]> {
        try {
            return await this.mdb
                .collection<ChatGroup>('chatGroups')
                .find({}, { sort: [['index', 1]] })
                .toArray()
        } catch (e) {
            return []
        }
    }

    async connect(): Promise<void> {
        const dba = await MongoClient.connect(this.connStr)
        this.mdb = dba.db('eqq' + this.id)
        await this.mdb.collection('rooms').createIndex('roomId', {
            background: true,
            unique: true,
        })
        await this.mdb.collection('rooms').createIndex(
            { utime: -1 },
            {
                background: true,
            },
        )
        const rooms = await this.getAllRooms()
        for (const i of rooms) {
            await this.mdb.collection('msg' + i.roomId).createIndex(
                { time: -1 },
                {
                    background: true,
                },
            )
        }
        await this.mdb.collection('ignoredChats').createIndex('id', {
            background: true,
            unique: true,
        })
        await this.mdb.collection('chatGroups').createIndex('name', {
            background: true,
            unique: true,
        })
    }

    async addMessage(roomId: number, message: Message): Promise<any> {
        try {
            return await this.mdb.collection('msg' + roomId).insertOne(message as object)
        } catch (e) {}
    }

    async addRoom(room: Room): Promise<any> {
        try {
            return await this.mdb.collection('rooms').insertOne(room)
        } catch (e) {}
    }

    async addChatGroup(chatGroup: ChatGroup): Promise<any> {
        try {
            return await this.mdb.collection('chatGroups').insertOne(chatGroup)
        } catch (e) {}
    }

    async updateMessage(roomId: number, messageId: string | number, message: Partial<Message>): Promise<any> {
        try {
            return await this.mdb.collection('msg' + roomId).updateOne({ _id: messageId }, { $set: message })
        } catch (e) {}
    }

    async replaceMessage(roomId: number, messageId: string | number, message: Message): Promise<any> {
        return await this.updateMessage(roomId, messageId, message)
    }

    async fetchMessages(roomId: number, skip: number, limit: number): Promise<Message[]> {
        const arr = await this.mdb
            .collection<any>('msg' + roomId)
            .find(
                {},
                {
                    sort: [['time', -1]],
                    skip,
                    limit,
                },
            )
            .toArray()
        return arr.reverse()
    }

    /** 按发送者查询消息记录。
     * @param roomId 房间 ID，为 0 时查询所有群（roomId < 0）
     * @param senderId 发送者 ID（字符串）
     */
    async fetchMessagesBySender(roomId: number, senderId: string, skip: number, limit: number): Promise<Message[]> {
        try {
            if (roomId === 0) {
                // 所有群模式：遍历所有群集合
                const rooms = await this.getAllRooms()
                const groupRooms = rooms.filter((r) => r.roomId < 0)
                const allMessages: Message[] = []
                await Promise.all(
                    groupRooms.map(async (room) => {
                        const msgs = await this.mdb
                            .collection<any>('msg' + room.roomId)
                            .find({ senderId: Number(senderId) })
                            .toArray()
                        for (const msg of msgs) {
                            msg.roomId = room.roomId
                        }
                        allMessages.push(...msgs)
                    }),
                )
                allMessages.sort((a, b) => b.time - a.time)
                return allMessages.slice(skip, skip + limit).reverse()
            } else {
                const arr = await this.mdb
                    .collection<any>('msg' + roomId)
                    .find(
                        { senderId: Number(senderId) },
                        {
                            sort: [['time', -1]],
                            skip,
                            limit,
                        },
                    )
                    .toArray()
                return arr.reverse()
            }
        } catch (e) {
            return []
        }
    }

    /** 按关键字搜索消息记录。
     * @param roomId 房间 ID
     * @param keyword 搜索关键字
     */
    async searchMessages(roomId: number, keyword: string, skip: number, limit: number): Promise<Message[]> {
        try {
            const arr = await this.mdb
                .collection<any>('msg' + roomId)
                .find(
                    { content: { $regex: keyword, $options: 'i' } },
                    {
                        sort: [['time', -1]],
                        skip,
                        limit,
                    },
                )
                .toArray()
            return arr
        } catch (e) {
            return []
        }
    }

    async fetchImageMessages(roomId: number, skip: number, limit: number, endTime?: number): Promise<Message[]> {
        const query: any = {
            'files.type': { $regex: /^image\// },
        }
        if (endTime) {
            query.time = { $lte: endTime }
        }
        const arr = await this.mdb
            .collection<any>('msg' + roomId)
            .find(query, {
                sort: [['time', -1]],
                skip,
                limit,
            })
            .toArray()
        return arr.reverse()
    }

    async removeRoom(roomId: number): Promise<any> {
        try {
            return await this.mdb.collection('rooms').findOneAndDelete({ roomId: roomId })
        } catch (e) {}
    }

    async updateRoom(roomId: number, room: Partial<Room>): Promise<any> {
        try {
            return await this.mdb.collection('rooms').updateOne({ roomId: roomId }, { $set: room })
        } catch (e) {}
    }

    async removeChatGroup(name: string): Promise<any> {
        try {
            return await this.mdb.collection('chatGroups').findOneAndDelete({ name: name })
        } catch (e) {}
    }

    async updateChatGroup(name: string, chatGroup: Partial<ChatGroup>): Promise<any> {
        try {
            return await this.mdb.collection('chatGroups').updateOne({ name: name }, { $set: chatGroup })
        } catch (e) {}
    }

    getMessage(roomId: number, messageId: string): Promise<Message> {
        return this.mdb.collection<any>('msg' + roomId).findOne({ _id: messageId })
    }

    async fetchMessagesAround(roomId: number, messageId: string, before: number, after: number): Promise<Message[]> {
        // 先获取目标消息的时间
        const targetMsg = await this.mdb.collection<any>('msg' + roomId).findOne({ _id: messageId })
        if (!targetMsg) return []

        const targetTime = targetMsg.time

        // 获取目标消息之前的消息
        const beforeMessages = await this.mdb
            .collection<any>('msg' + roomId)
            .find({ time: { $lt: targetTime } }, { sort: [['time', -1]], limit: before })
            .toArray()

        // 获取目标消息及之后的消息
        const afterMessages = await this.mdb
            .collection<any>('msg' + roomId)
            .find({ time: { $gte: targetTime } }, { sort: [['time', 1]], limit: after + 1 })
            .toArray()

        // 合并并按时间排序
        return [...beforeMessages.reverse(), ...afterMessages]
    }

    async addMessages(roomId: number, messages: Message[]): Promise<any> {
        try {
            return await this.mdb.collection('msg' + roomId).insertMany(messages as object[], { ordered: false }) //确信
        } catch (e) {
            return e
        }
    }

    getRoom(roomId: number): Promise<Room> {
        return this.mdb.collection<any>('rooms').findOne({ roomId })
    }

    getUnreadCount(priority: number): Promise<number> {
        const unreadRooms = this.mdb.collection('rooms').find({
            unreadCount: {
                $gt: 0,
            },
            priority: {
                $gte: priority,
            },
        })
        return unreadRooms.count()
    }

    getFirstUnreadRoom(priority: number): Promise<Room> {
        return this.mdb.collection<any>('rooms').findOne({
            unreadCount: {
                $gt: 0,
            },
            priority: {
                $gte: priority,
            },
        })
    }

    addIgnoredChat(info: IgnoreChatInfo): Promise<any> {
        return this.mdb.collection('ignoredChats').insertOne(info)
    }

    getIgnoredChats(): Promise<IgnoreChatInfo[]> {
        return this.mdb.collection<IgnoreChatInfo>('ignoredChats').find().toArray()
    }

    async isChatIgnored(id: number): Promise<boolean> {
        return !!(await this.mdb.collection('ignoredChats').findOne({ id }))
    }
}
