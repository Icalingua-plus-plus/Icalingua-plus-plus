import StorageProvider from '../../types/StorageProvider'
import Message from '../../types/Message'
import Room from '../../types/Room'
import {Db, MongoClient} from 'mongodb'
import IgnoreChatInfo from '../../types/IgnoreChatInfo'

export default class MongoStorageProvider implements StorageProvider {
    id: string | number
    connStr: string
    mdb: Db

    constructor(connStr: string, id: string | number) {
        this.id = id
        this.connStr = connStr
    }

    getAllRooms(): Promise<Room[]> {
        return this.mdb
            .collection('rooms')
            .find({}, {sort: [['utime', -1]]})
            .toArray()
    }

    async connect(): Promise<void> {
        const dba = await MongoClient.connect(this.connStr)
        this.mdb = dba.db('eqq' + this.id)
        await this.mdb.collection('rooms').createIndex('roomId', {
            background: true,
            unique: true,
        })
        await this.mdb.collection('rooms').createIndex({utime: -1}, {
            background: true,
        })
        const rooms = await this.getAllRooms()
        for (const i of rooms) {
            await this.mdb.collection('msg' + i.roomId).createIndex({time: -1}, {
                background: true,
            })
        }
        await this.mdb.collection('ignoredChats').createIndex('id', {
            background: true,
            unique: true,
        })
    }

    addMessage(roomId: number, message: object): Promise<any> {
        return this.mdb.collection('msg' + roomId).insertOne(message)
    }

    addRoom(room: object): Promise<any> {
        return this.mdb.collection('rooms').insertOne(room)
    }

    updateMessage(roomId: number, messageId: string | number, message: object): Promise<any> {
        return this.mdb
            .collection('msg' + roomId)
            .updateOne({_id: messageId}, {$set: message})
    }

    async fetchMessages(roomId: number, skip: number, limit: number): Promise<Message[]> {
        const arr = await this.mdb
            .collection('msg' + roomId)
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

    removeRoom(roomId: number): Promise<any> {
        return this.mdb.collection('rooms').findOneAndDelete({roomId: roomId})
    }

    updateRoom(roomId: number, room: object): Promise<any> {
        return this.mdb
            .collection('rooms')
            .updateOne(
                {roomId: roomId},
                {$set: room},
            )
    }

    getMessage(roomId: number, messageId: string): Promise<Message> {
        return this.mdb
            .collection('msg' + roomId)
            .findOne({_id: messageId})
    }

    async addMessages(roomId: number, messages: object[]): Promise<any> {
        try {
            return await this.mdb
                .collection('msg' + roomId)
                .insertMany(messages, {ordered: false})
        } catch (e) {
            return e
        }
    }

    getRoom(roomId: number): Promise<Room> {
        return this.mdb
            .collection('rooms')
            .findOne({roomId})
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
        return this.mdb.collection('rooms').findOne({
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
        return this.mdb.collection('ignoredChats').find().toArray()
    }

    async isChatIgnored(id: number): Promise<boolean> {
        return !!await this.mdb.collection('ignoredChats').findOne({id})
    }
}
