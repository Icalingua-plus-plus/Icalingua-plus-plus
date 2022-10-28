import Redis from "ioredis";
import { compact } from "lodash";
import IgnoreChatInfo from "@icalingua/types/IgnoreChatInfo";
import Message from "@icalingua/types/Message";
import Room from "@icalingua/types/Room";
import StorageProvider from "@icalingua/types/StorageProvider";

export default class RedisStorageProvider implements StorageProvider {
    qid: string;
    connStr: string;
    redis: Redis.Redis;

    /** `constructor` 方法。 */
    constructor(connStr: string, id: string) {
        this.connStr = connStr;
        this.qid = `eqq:${id}`;
    }

    /** `connect` 方法。在这里与数据库建立连接。 */
    connect(): Promise<void> {
        this.redis = new Redis(this.connStr);
        return Promise.resolve();
    }

    /** 实现 {@link StorageProvider} 类的 `getIgnoredChats` 方法，
     * 是对 `ignoredChats` 的“查所有”操作。
     *
     * 在用户查询忽略聊天列表时被调用。
     */
    async getIgnoredChats(): Promise<IgnoreChatInfo[]> {
        const infoStrings = await this.redis.hvals(`${this.qid}:rooms:ignored`);
        return infoStrings.map((infoString) => JSON.parse(infoString));
    }

    /** 实现 {@link StorageProvider} 类的 `isChatIgnored` 方法，
     * 是对 `ignoredChats` 的自定义查询操作。返回一个**布尔**值。
     *
     * 在收到消息时被调用。
     */
    async isChatIgnored(id: number): Promise<boolean> {
        const existance = await this.redis.hexists(
            `${this.qid}:rooms:ignored`,
            `${id}`
        );
        return existance === 1;
    }

    /** 实现 {@link StorageProvider} 类的 `addIgnoredChat` 方法，
     * 是对 `ignoredChats` 的“增”操作。
     *
     * 在忽略聊天时被调用。
     */
    async addIgnoredChat(info: IgnoreChatInfo): Promise<any> {
        await this.redis.hset(
            `${this.qid}:rooms:ignored`,
            `${info.id}`,
            JSON.stringify(info)
        );
    }

    /** 实现 {@link StorageProvider} 类的 `removeIgnoredChat` 方法，
     * 是对 `ignoredChats` 的“删”操作。
     *
     * 在取消忽略聊天时被调用。
     */
    async removeIgnoredChat(roomId: number): Promise<any> {
        await this.redis.hdel(`${this.qid}:rooms:ignored`, `${roomId}`);
    }

    /** 实现 {@link StorageProvider} 类的 `getRoom` 方法，
     * 对应 room 的“查单个”操作。
     *
     * 在进入房间后被调用。
     */
    async getRoom(roomId: number): Promise<Room> {
        const room = await this.redis.hget(
            `${this.qid}:rooms:rooms`,
            `${roomId}`
        );
        const pRoom = JSON.parse(room) as Room;
        if (!pRoom) {
            return null;
        }
        return { ...pRoom, roomId: Number(pRoom.roomId) };
    }

    /** 实现 {@link StorageProvider} 类的 `updateRoom` 方法，
     * 对应 room 的“改”操作。
     *
     * 在“收到新消息”等引起房间信息变化的事件时调用。
     */
    async updateRoom(roomId: number, room: Partial<Room>): Promise<void> {
        const roomInDB = JSON.parse(
            await this.redis.hget(`${this.qid}:rooms:rooms`, `${roomId}`)
        );
        const roomToUpdate = { ...roomInDB, ...room };
        await this.redis.hset(
            `${this.qid}:rooms:rooms`,
            `${roomId}`,
            JSON.stringify(roomToUpdate)
        );
        await this.redis.zadd(
            `${this.qid}:rooms:keyList`,
            roomToUpdate.utime,
            `${roomId}`
        );
        await this.redis.zadd(
            `${this.qid}:rooms:priority`,
            roomToUpdate.priority,
            `${roomId}`
        );
    }

    /** 实现 {@link StorageProvider} 类的 `addRoom` 方法，
     * 对应 room 的“增”操作。
     *
     * 在“新房间收到新消息”等需要新增房间的事件时被调用。
     */
    async addRoom(room: Room): Promise<void> {
        await this.redis.hset(
            `${this.qid}:rooms:rooms`,
            `${room.roomId}`,
            JSON.stringify(room)
        );
        if (room.utime)
            await this.redis.zadd(
                `${this.qid}:rooms:keyList`,
                room.utime,
                `${room.roomId}`
            );
        if (room.priority) {
            await this.redis.zadd(
                `${this.qid}:rooms:priority`,
                room.priority,
                `${room.roomId}`
            );
        }
    }

    /** 实现 {@link StorageProvider} 类的 `removeRoom` 方法，
     * 对应 room 的“删”操作。
     *
     * 在删除聊天时调用。
     */
    async removeRoom(roomId: number): Promise<void> {
        await this.redis.hdel(`${this.qid}:rooms:rooms`, `${roomId}`);
        await this.redis.zrem(`${this.qid}:rooms:keyList`, `${roomId}`);
        await this.redis.zrem(`${this.qid}:rooms:priority`, `${roomId}`);
    }

    /** 实现 {@link StorageProvider} 类的 `getAllRooms` 方法，
     * 对应 room 的“查所有”操作。
     *
     * 在登录成功后调用。
     */
    async getAllRooms(): Promise<Room[]> {
        const roomKeys = await this.redis.zrevrange(
            `${this.qid}:rooms:keyList`,
            0,
            -1
        );
        const roomsPAry = roomKeys.map(async (key) => {
            const room = await this.redis.hget(`${this.qid}:rooms:rooms`, key);
            const pRoom = JSON.parse(room) as Room;
            return { ...pRoom, roomId: Number(pRoom.roomId) };
        });
        const rooms = (await Promise.all(roomsPAry)) as Room[];
        return rooms;
    }

    /** 实现 {@link StorageProvider} 类的 `addRoom` 方法，
     * 对应 room 的“增”操作。
     *
     * 在“新房间收到新消息”等需要新增房间的事件时被调用。
     */
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

    /** 实现 {@link StorageProvider} 类的 `updateMessage` 方法，
     * 是对 `msg${roomId}` 的“改”操作。
     *
     * 在“用户撤回消息”等需要改动消息内容的事件中被调用。
     */
    async updateMessage(
        roomId: number,
        messageId: string | number,
        message: Partial<Message>
    ): Promise<any> {
        const msgInDB = JSON.parse(
            await this.redis.hget(
                `${this.qid}:msg${roomId}:messages`,
                `${messageId}`
            )
        );
        const msgToUpdate = { ...msgInDB, ...message };
        return this.redis.hset(
            `${this.qid}:msg${roomId}:messages`,
            `${messageId}`,
            JSON.stringify(msgToUpdate)
        );
    }

    /** 实现 {@link StorageProvider} 类的 `replaceMessage` 方法，
     * 是对 `msg${roomId}` 的“改”操作。
     *
     * 在“重新获取消息内容”等需要改动消息内容的事件中被调用。
     */
    async replaceMessage(
        roomId: number,
        messageId: string | number,
        message: Message
    ): Promise<any> {
        return await this.updateMessage(roomId, messageId, message);
    }

    /** 实现 {@link StorageProvider} 类的 `fetchMessage` 方法，
     * 是对 `msg${roomId}` 的“查多个”操作。
     *
     * 在进入房间时，该方法被调用。
     */
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
        const messages = (await Promise.all(messagesPAry)) as Message[];
        messages.sort((a, b) => a.time - b.time);
        return messages;
    }

    /** 实现 {@link StorageProvider} 类的 `getMessage` 方法，
     * 是对 `msg${roomId}` 的“查”操作。
     *
     * 在获取聊天历史消息时，该方法被调用。
     */
    async getMessage(roomId: number, messageId: string): Promise<Message> {
        const msgString = await this.redis.hget(
            `${this.qid}:msg${roomId}:messages`,
            `${messageId}`
        );
        return JSON.parse(msgString);
    }

    /** 实现 {@link StorageProvider} 类的 `addMessages` 方法，
     * 是对 `msg${roomId}` 的自定义增操作。用于向数据库内增加多条消息。
     *
     * 在获取聊天历史消息时，该方法被调用。
     */
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

    /** 实现 {@link StorageProvider} 类的 `getUnreadCount` 方法，
     * 是对 room 的自定义查询方法。查询有未读消息的大于指定通知优先级的房间数。
     *
     * 在登录成功与每次收到消息后调用。
     */
    async getUnreadCount(priority: number): Promise<number> {
        const keyAry = await this.redis.zrangebyscore(
            `${this.qid}:rooms:priority`,
            priority,
            priority
        );
        const roomsUnreadAry = await Promise.all(
            keyAry.map(async (key) => {
                const room = await this.redis.hget(
                    `${this.qid}:rooms:rooms`,
                    key
                );
                const pRoom = JSON.parse(room) as Room;
                return pRoom.unreadCount;
            })
        );
        return compact(roomsUnreadAry).length;
    }

    /** 实现 {@link StorageProvider} 类的 `getFirstUnreadRoom` 方法，
     * 是对 room 的自定义查询方法。
     *
     * 调用情况未知。
     */
    async getFirstUnreadRoom(priority: number): Promise<Room> {
        const keyAry = await this.redis.zrangebyscore(
            `${this.qid}:rooms:priority`,
            priority,
            priority
        );
        if (keyAry.length === 0) {
            return undefined;
        }
        const room = await this.redis.hget(
            `${this.qid}:rooms:rooms`,
            keyAry[0]
        );
        const pRoom = JSON.parse(room) as Room;
        return pRoom;
    }
}
