import Redis from "ioredis";
import Message from "../../types/Message";
import Room from "../../types/Room";
import StorageProvider from "../../types/StorageProvider";

export default class RedisStorageProvider implements StorageProvider {
    qid: string;
    connStr: string;
    redis: Redis.Redis;

    constructor(connStr: string, id: string) {
        this.connStr = connStr;
        this.qid = `eqq:${id}`;
    }

    getRoom(roomId: number): Promise<Room> {
        throw new Error("Method not implemented.");
    }

    connect(): Promise<void> {
        this.redis = new Redis(this.connStr);
        return Promise.resolve();
    }

    async updateRoom(roomId: number, room: Room): Promise<void> {
        await this.redis.hset(
            `${this.qid}:rooms:rooms`,
            `${roomId}`,
            JSON.stringify(room)
        );
        await this.redis.zadd(`${this.qid}:rooms:keyList`, room.utime, `${roomId}`);
    }

    async addRoom(room: Room): Promise<void> {
        await this.redis.hset(
            `${this.qid}:rooms:rooms`,
            `${room.roomId}`,
            JSON.stringify(room)
        );
        await this.redis.zadd(
            `${this.qid}:rooms:keyList`,
            room.utime,
            `${room.roomId}`
        );
    }

    async removeRoom(roomId: number): Promise<void> {
        await this.redis.hdel(`${this.qid}:rooms:rooms`, `${roomId}`);
        await this.redis.zrem(`${this.qid}:rooms:keyList`, `${roomId}`);
    }

    async getAllRooms(): Promise<Room[]> {
        const roomKeys = await this.redis.zrevrange(
            `${this.qid}:rooms:keyList`,
            0,
            -1
        );
        const roomsPAry = roomKeys.map(async (key) => {
            const room = await this.redis.hget(`${this.qid}:rooms:rooms`, key);
            const pRoom = JSON.parse(room) as Room;
            return {...pRoom, roomId: Number(pRoom.roomId)};
        });
        const rooms = await Promise.all(roomsPAry);
        return rooms;
    }

    async addMessage(roomId: number, message: Message): Promise<void> {
        await this.redis.hset(
            `${this.qid}:msg${roomId}:messages`,
            `${message._id}`,
            JSON.stringify(message)
        );
        await this.redis.zadd(
            `${this.qid}:msg${roomId}:msgIdList`,
            message.time,
            message._id
        );
    }

    async updateMessage(roomId: number, messageId: string, message: object): Promise<void> {
        await this.redis.hset(
            `${this.qid}:msg${roomId}:messages`,
            `${messageId}`,
            JSON.stringify(message)
        );
    }

    async fetchMessages(
        roomId: number,
        skip: number,
        limit: number
    ): Promise<Message[]> {
        const msgKeys = await this.redis.zrevrange(
            `${this.qid}:msg${roomId}:msgIdList`,
            skip,
            skip + limit - 1
        );
        const messagesPAry = msgKeys.map(async (key) => {
            const msg = await this.redis.hget(
                `${this.qid}:msg${roomId}:messages`,
                key
            );
            return JSON.parse(msg) as Message;
        });
        const messages = await Promise.all(messagesPAry);
        messages.sort((a, b) => a.time - b.time);
        return messages;
    }

    async getMessage(roomId: number, messageId: string): Promise<Message> {
        const msgString = await this.redis.hget(
            `${this.qid}:msg${roomId}:messages`,
            `${messageId}`
        );
        return JSON.parse(msgString);
    }

    addMessages(roomId: number, messages: Message[]): Promise<any> {
        messages.forEach((message) => {
            this.redis.hset(
                `${this.qid}:msg${roomId}:messages`,
                `${message._id}`,
                JSON.stringify(message)
            );
            this.redis.zadd(
                `${this.qid}:msg${roomId}:msgIdList`,
                message.time,
                message._id
            );
        });
        return Promise.resolve();
    }
}
