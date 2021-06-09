import * as Redis from "ioredis";
import Message from "../interfaces/Message";
import Room from "../interfaces/Room";
import StorageProvider from "../interfaces/StorageProvider";
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
  updateRoom(roomId: number, room: object): void {
    this.redis.set(`${this.qid}:rooms:${roomId}`, JSON.stringify(room));
  }
  addRoom(room: Room): void {
    this.redis.set(`${this.qid}:rooms:${room.roomId}`, JSON.stringify(room));
  }
  removeRoom(roomId: number): void {
    this.redis.del(`${this.qid}:rooms:${roomId}`);
  }
  async getAllRooms(): Promise<Room[]> {
    const roomKeys = await this.redis.keys(`${this.qid}:rooms*`);
    const roomsPAry = roomKeys.map(async (key) => {
      const room = await this.redis.get(key);
      return JSON.parse(room) as Room;
    });
    const rooms = await Promise.all(roomsPAry);
    return rooms;
  }

  addMessage(roomId: number, message: Message): void {
    this.redis.set(
      `${this.qid}:msgof${roomId}:${message._id}`,
      JSON.stringify(message)
    );
  }
  updateMessage(roomId: number, messageId: string, message: object): void {
    this.redis.set(
      `${this.qid}:msgof${roomId}:${messageId}`,
      JSON.stringify(message)
    );
  }
  async fetchMessages(
    roomId: number,
    skip: number,
    limit: number
  ): Promise<Message[]> {
    const msgKeys = await this.redis.keys(`${this.qid}:msgof${roomId}:*`);
    const msgtoFetchKeys = msgKeys.slice(
      msgKeys.length - 1 - skip - limit,
      msgKeys.length - skip
    );
    const messagesPAry = msgtoFetchKeys.map(async (key) => {
      const msg = await this.redis.get(key);
      return JSON.parse(msg) as Message;
    });
    const messages = await Promise.all(messagesPAry);
    return messages;
  }

  async getMessage(roomId: number, messageId: string): Promise<Message> {
    const msgString = await this.redis.get(
      `${this.qid}:msgof${roomId}:${messageId}`
    );
    return JSON.parse(msgString);
  }
  addMessages(roomId: number, messages: Message[]): Promise<any> {
    messages.forEach((message) => {
      this.redis.set(
        `${this.qid}:msgof${roomId}:${message._id}`,
        JSON.stringify(message)
      );
    });
    return Promise.resolve();
  }
}
