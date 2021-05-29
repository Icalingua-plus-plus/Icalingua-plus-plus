import StorageProvider from "../interfaces/StorageProvider";
import Message from "../interfaces/Message";
import Room from "../interfaces/Room";
import {Db, MongoClient} from "mongodb";

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
            .collection("rooms")
            .find({}, {sort: [["utime", -1]]})
            .toArray()
    }

    async connect(): Promise<void> {
        const dba = await MongoClient.connect(this.connStr)
        this.mdb = dba.db("eqq" + this.id);
    }

    addMessage(roomId: string, message: object): Promise<void> {
        return this.mdb.collection("msg" + roomId).insertOne(message);
    }

    addRoom(room: object): Promise<void> {
        return this.mdb.collection("rooms").insertOne(room)
    }

    updateMessage(roomId: string, messageId: string, message: object): Promise<void> {
        return this.mdb
            .collection("msg" + roomId)
            .updateOne({_id: messageId}, {$set: message});
    }

    async fetchMessages(roomId: string, skip: number, limit: number): Promise<Message[]> {
        const arr = await this.mdb
            .collection("msg" + roomId)
            .find(
                {},
                {
                    sort: [["time", -1]],
                    skip,
                    limit
                }
            )
            .toArray()
        return arr.reverse()
    }

    removeRoom(roomId: string): void {
    }

    updateRoom(roomId: string, room: object): void {
    }

}
