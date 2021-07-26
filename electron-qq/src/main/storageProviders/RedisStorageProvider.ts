import Redis from "ioredis";
import IgnoreChatInfo from "../../types/IgnoreChatInfo";
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

  connect(): Promise<void> {
    this.redis = new Redis(this.connStr);
    return Promise.resolve();
  }

  async getIgnoredChats(): Promise<IgnoreChatInfo[]> {
    const infoStrings = await this.redis.hvals(`${this.qid}:rooms:ignored`);
    return infoStrings.map((infoString) => JSON.parse(infoString));
  }

  async isChatIgnored(id: number): Promise<boolean> {
    const existance = await this.redis.hexists(
      `${this.qid}:rooms:ignored`,
      `${id}`
    );
    return existance === 1;
  }

  async addIgnoredChat(info: IgnoreChatInfo): Promise<any> {
    await this.redis.hset(
      `${this.qid}:rooms:ignored`,
      `${info.id}`,
      JSON.stringify(info)
    );
  }
  async removeIgnoredChat(roomId: number): Promise<any> {
    await this.redis.hdel(`${this.qid}:rooms:ignored`, `${roomId}`);
  }

  async getRoom(roomId: number): Promise<Room> {
    const room = await this.redis.hget(`${this.qid}:rooms:rooms`, `${roomId}`);
    const pRoom = JSON.parse(room) as Room;
    if (!pRoom) {
      return null;
    }
    return { ...pRoom, roomId: Number(pRoom.roomId) };
  }

  async updateRoom(roomId: number, room: Room): Promise<void> {
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

  async removeRoom(roomId: number): Promise<void> {
    await this.redis.hdel(`${this.qid}:rooms:rooms`, `${roomId}`);
    await this.redis.zrem(`${this.qid}:rooms:keyList`, `${roomId}`);
    await this.redis.zrem(`${this.qid}:rooms:priority`, `${roomId}`);
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
      return { ...pRoom, roomId: Number(pRoom.roomId) };
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

  async updateMessage(
    roomId: number,
    messageId: string | number,
    message: Message
  ): Promise<any> {
    const msgInDB = JSON.parse(
      await this.redis.hget(`${this.qid}:msg${roomId}:messages`, `${messageId}`)
    );
    const msgToUpdate = { ...msgInDB, ...message };
    return this.redis.hset(
      `${this.qid}:msg${roomId}:messages`,
      `${messageId}`,
      JSON.stringify(msgToUpdate)
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

  async getUnreadCount(priority: number): Promise<number> {
    const keyAry = await this.redis.zrangebyscore(
      `${this.qid}:rooms:priority`,
      priority,
      priority
    );
    const roomsUnreadAry = await Promise.all(
      keyAry.map(async (key) => {
        const room = await this.redis.hget(`${this.qid}:rooms:rooms`, key);
        const pRoom = JSON.parse(room) as Room;
        return pRoom.unreadCount;
      })
    );
    return roomsUnreadAry.length;
  }

  async getFirstUnreadRoom(priority: number): Promise<Room> {
    const keyAry = await this.redis.zrangebyscore(
      `${this.qid}:rooms:priority`,
      priority,
      priority
    );
    if (keyAry.length === 0) {
      return undefined;
    }
    const room = await this.redis.hget(`${this.qid}:rooms:rooms`, keyAry[0]);
    const pRoom = JSON.parse(room) as Room;
    return pRoom;
  }
}
