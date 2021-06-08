import StorageProvider from "../interfaces/StorageProvider";
import Message, {MessageInIDB} from "../interfaces/Message";
import Room from "../interfaces/Room";
import * as lf from "lovefield";

export default class IndexedStorageProvider implements StorageProvider {
    id: string | number;
    connStr: string;
    schemaBuilder: lf.schema.Builder;
    idb: lf.Database;

    constructor(connStr: string, id: string | number) {
        this.connStr = connStr;
        this.id = id;
    }

    async connect(): Promise<void> {
        this.schemaBuilder = lf.schema.create("eqq" + this.id, 1);
        this.schemaBuilder
            .createTable("rooms")
            .addColumn("roomId", lf.Type.NUMBER)
            .addColumn("roomName", lf.Type.STRING)
            .addColumn("avatar", lf.Type.STRING)
            .addColumn("index", lf.Type.NUMBER)
            .addColumn("unreadCount", lf.Type.NUMBER)
            .addColumn("priority", lf.Type.NUMBER)
            .addColumn("utime", lf.Type.NUMBER)
            .addColumn("users", lf.Type.OBJECT)
            .addColumn("lastMessage", lf.Type.OBJECT)
            .addColumn("at", lf.Type.BOOLEAN)
            .addColumn("autoDownload", lf.Type.BOOLEAN)
            .addColumn("downloadPath", lf.Type.STRING)
            .addNullable(["autoDownload", "downloadPath", "at"])
            .addPrimaryKey(["roomId"], false);
        this.schemaBuilder
            .createTable("msgDB")
            .addColumn("_id", lf.Type.STRING)
            .addColumn("roomId", lf.Type.NUMBER)
            .addColumn("senderId", lf.Type.NUMBER)
            .addColumn("username", lf.Type.STRING)
            .addColumn("content", lf.Type.STRING)
            .addColumn("timestamp", lf.Type.STRING)
            .addColumn("date", lf.Type.STRING)
            .addColumn("role", lf.Type.STRING)
            .addColumn("time", lf.Type.NUMBER)
            .addColumn("replyMessage", lf.Type.OBJECT)
            .addColumn("file", lf.Type.OBJECT)
            .addNullable(["role", "time", "file"])
            .addPrimaryKey(["roomId", "_id"], false)
        this.idb = await this.schemaBuilder.connect();
    }

    updateRoom(roomId: number, room: Room): Promise<any> {
        const roomsTable = this.idb.getSchema().table("rooms");
        const roomItem = roomsTable.createRow({
            ...room,
            roomId
        });
        return this.idb
            .insertOrReplace()
            .into(roomsTable)
            .values([roomItem])
            .exec();
    }

    addMessage(roomId: number, message: Message): Promise<any> {
        const msgTable = this.idb.getSchema().table("msgDB");
        const msgItem = msgTable.createRow({...message, roomId});
        return this.idb
            .insertOrReplace()
            .into(msgTable)
            .values([msgItem])
            .exec();
    }

    addMessages(roomId: number, messages: Message[]): Promise<any> {
        const msgTable = this.idb.getSchema().table("msgDB");
        const msgItems = messages.map((message) => {
            return msgTable.createRow({...message, roomId});
        });
        return this.idb
            .insertOrReplace()
            .into(msgTable)
            .values([...msgItems])
            .exec();
    }

    addRoom(room: Room): Promise<any> {
        const roomsTable = this.idb.getSchema().table("rooms");
        const roomItem = roomsTable.createRow(room);
        return this.idb
            .insertOrReplace()
            .into(roomsTable)
            .values([roomItem])
            .exec();
    }

    removeRoom(roomId: number): Promise<any> {
        const roomsTable = this.idb.getSchema().table("rooms");
        return this.idb
            .delete()
            .from(roomsTable)
            .where(roomsTable.roomId.eq(roomId))
            .exec();
    }

    updateMessage(roomId: number, messageId: string, message: object): Promise<any> {
        const msgToInsert = {...message, roomId};
        const msgTable = this.idb.getSchema().table("msgDB");
        return this.idb
            .insertOrReplace()
            .into(msgTable)
            .values([msgToInsert])
            .exec();
    }

    async fetchMessages(roomId: number, skip: number, limit: number): Promise<Message[]> {
        const msgTable = this.idb.getSchema().table("msgDB");
        const msgs = (await this.idb
            .select()
            .from(msgTable)
            .where(msgTable.roomId.eq(roomId))
            .orderBy(msgTable.time, lf.Order.DESC)
            .skip(skip)
            .limit(limit)
            .exec()) as MessageInIDB[];
        return msgs.reverse()
    }

    async getMessage(roomId: number, messageId: string): Promise<Message> {
        const msgTable = this.idb.getSchema().table("msgDB");
        const messages = (await this.idb
            .select()
            .from(msgTable)
            .where(msgTable._id.in([messageId]))
            .orderBy(msgTable.time)
            .exec()) as MessageInIDB[];
        return messages[0]
    }

    async getAllRooms(): Promise<Room[]> {
        const roomsTable = this.idb.getSchema().table("rooms");
        const rooms = (await this.idb
            .select()
            .from(roomsTable)
            .exec()) as Room[];
        if (rooms) {
            return rooms
        } else {
            return [];
        }
    }
}
