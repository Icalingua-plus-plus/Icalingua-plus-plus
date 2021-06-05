import StorageProvider from "../interfaces/StorageProvider";
import Message from "../interfaces/Message";
import Room from "../interfaces/Room";
import { Db } from "zangodb";

export default class MongoStorageProvider implements StorageProvider {
    id: string | number
    connStr: string
    mdb: any

    constructor(connStr: string, id: string | number) {
        this.id = id
    }

    getAllRooms(): Promise<Room[]> {
        return this.mdb
            .collection("rooms")
            .find({}, {sort: [["utime", -1]]})
            .toArray()
    }

    async connect(): Promise<void> {
        this.mdb = new Db("eqq" + this.id);
        return new Promise((resolve,reject)=>resolve())
    }

    addMessage(roomId: number, message: object): Promise<any> {
        return this.mdb.collection("msg" + roomId).insertOne(message);
    }

    addRoom(room: object): Promise<any> {
        return this.mdb.collection("rooms").insertOne(room)
    }

    updateMessage(roomId: number, messageId: string, message: object): Promise<any> {
        return this.mdb
            .collection("msg" + roomId)
            .updateOne({_id: messageId}, {$set: message});
    }

    async fetchMessages(roomId: number, skip: number, limit: number): Promise<Message[]> {
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

    removeRoom(roomId: number): Promise<any> {
        return this.mdb.collection("rooms").findOneAndDelete({roomId: roomId});
    }

    updateRoom(roomId: number, room: object): Promise<any> {
        return this.mdb
            .collection("rooms")
            .updateOne(
                {roomId: roomId},
                {$set: room}
            );
    }

    getMessage(roomId: number, messageId: string): Promise<Message> {
        return this.mdb
            .collection("msg" + roomId)
            .findOne({_id: messageId})
    }

    async addMessages(roomId: number, messages: object[]): Promise<any> {
        try {
            return await this.mdb
                .collection("msg" + roomId)
                .insertMany(messages, {ordered: false})
        }
        catch(e){
            return e
        }
    }
}