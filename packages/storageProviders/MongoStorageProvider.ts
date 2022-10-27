import IgnoreChatInfo from "@icalingua/types/IgnoreChatInfo";
import Message from "@icalingua/types/Message";
import Room from "@icalingua/types/Room";
import StorageProvider from "@icalingua/types/StorageProvider";
import { Db, MongoClient } from "mongodb";

export default class MongoStorageProvider implements StorageProvider {
    id: string | number;
    connStr: string;
    mdb: Db;

    constructor(connStr: string, id: string | number) {
        this.id = id;
        this.connStr = connStr;
    }

    removeIgnoredChat(id: number): Promise<any> {
        return this.mdb.collection("ignoredChats").deleteOne({ id });
    }

    async getAllRooms(): Promise<Room[]> {
        try {
            return await this.mdb
                .collection<Room>("rooms")
                .find({}, { sort: [["utime", -1]] })
                .toArray();
        } catch (e) {
            return [];
        }
    }

    async connect(): Promise<void> {
        const dba = await MongoClient.connect(this.connStr);
        this.mdb = dba.db("eqq" + this.id);
        await this.mdb.collection("rooms").createIndex("roomId", {
            background: true,
            unique: true,
        });
        await this.mdb.collection("rooms").createIndex(
            { utime: -1 },
            {
                background: true,
            }
        );
        const rooms = await this.getAllRooms();
        for (const i of rooms) {
            await this.mdb.collection("msg" + i.roomId).createIndex(
                { time: -1 },
                {
                    background: true,
                }
            );
        }
        await this.mdb.collection("ignoredChats").createIndex("id", {
            background: true,
            unique: true,
        });
    }

    async addMessage(roomId: number, message: Message): Promise<any> {
        try {
            return await this.mdb
                .collection("msg" + roomId)
                .insertOne(message as object);
        } catch (e) {}
    }

    async addRoom(room: Room): Promise<any> {
        try {
            return await this.mdb.collection("rooms").insertOne(room);
        } catch (e) {}
    }

    async updateMessage(
        roomId: number,
        messageId: string | number,
        message: Partial<Message>
    ): Promise<any> {
        try {
            return await this.mdb
                .collection("msg" + roomId)
                .updateOne({ _id: messageId }, { $set: message });
        } catch (e) {}
    }

    async replaceMessage(
        roomId: number,
        messageId: string | number,
        message: Message
    ): Promise<any> {
        return await this.updateMessage(roomId, messageId, message);
    }

    async fetchMessages(
        roomId: number,
        skip: number,
        limit: number
    ): Promise<Message[]> {
        const arr = await this.mdb
            .collection<any>("msg" + roomId)
            .find(
                {},
                {
                    sort: [["time", -1]],
                    skip,
                    limit,
                }
            )
            .toArray();
        return arr.reverse();
    }

    async removeRoom(roomId: number): Promise<any> {
        try {
            return await this.mdb
                .collection("rooms")
                .findOneAndDelete({ roomId: roomId });
        } catch (e) {}
    }

    async updateRoom(roomId: number, room: Partial<Room>): Promise<any> {
        try {
            return await this.mdb
                .collection("rooms")
                .updateOne({ roomId: roomId }, { $set: room });
        } catch (e) {}
    }

    getMessage(roomId: number, messageId: string): Promise<Message> {
        return this.mdb
            .collection<any>("msg" + roomId)
            .findOne({ _id: messageId });
    }

    async addMessages(roomId: number, messages: Message[]): Promise<any> {
        try {
            return await this.mdb
                .collection("msg" + roomId)
                .insertMany(messages as object[], { ordered: false }); //确信
        } catch (e) {
            return e;
        }
    }

    getRoom(roomId: number): Promise<Room> {
        return this.mdb.collection<any>("rooms").findOne({ roomId });
    }

    getUnreadCount(priority: number): Promise<number> {
        const unreadRooms = this.mdb.collection("rooms").find({
            unreadCount: {
                $gt: 0,
            },
            priority: {
                $gte: priority,
            },
        });
        return unreadRooms.count();
    }

    getFirstUnreadRoom(priority: number): Promise<Room> {
        return this.mdb.collection<any>("rooms").findOne({
            unreadCount: {
                $gt: 0,
            },
            priority: {
                $gte: priority,
            },
        });
    }

    addIgnoredChat(info: IgnoreChatInfo): Promise<any> {
        return this.mdb.collection("ignoredChats").insertOne(info);
    }

    getIgnoredChats(): Promise<IgnoreChatInfo[]> {
        return this.mdb
            .collection<IgnoreChatInfo>("ignoredChats")
            .find()
            .toArray();
    }

    async isChatIgnored(id: number): Promise<boolean> {
        return !!(await this.mdb.collection("ignoredChats").findOne({ id }));
    }
}
