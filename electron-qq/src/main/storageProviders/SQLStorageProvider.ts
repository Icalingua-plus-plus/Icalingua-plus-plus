import knex, { Knex } from "knex";
import IgnoreChatInfo from "../../types/IgnoreChatInfo";
import Message from "../../types/Message";
import Room from "../../types/Room";
import StorageProvider from "../../types/StorageProvider";

interface PgMyOpt {
  host: string;
  user: string;
  password: string;
  database: string;
}

export default class SQLStorageProvider implements StorageProvider {
  id: string;
  type: "pg" | "mysql" | "sqlite3";
  db: Knex;
  private qid: string;

  constructor(
    id: string,
    type: "pg" | "mysql" | "sqlite3",
    connectOpt?: PgMyOpt
  ) {
    this.id = id;
    this.qid = `eqq${id}`;
    switch (type) {
      case "sqlite3":
        this.db = knex({
          client: "sqlite3",
          connection: { filename: this.qid },
        });
        break;
      case "mysql":
        this.db = knex({
          client: "mysql",
          connection: { ...connectOpt },
        });
        break;
      case "pg":
        this.db = knex({
          client: "pg",
          connection: { ...connectOpt },
        });
        break;
      default:
        break;
    }
  }

  private roomConToDB(room: Record<string, any>) {
    if (room.users) {
      return {
        ...room,
        users: JSON.stringify(room.users),
      };
    }
    return room;
  }

  private roomConFromDB(room: Record<string, any>): Room {
    return { ...room, users: JSON.parse(room.users) } as Room;
  }

  private updateDB() {
    return 0;
  }

  async connect(): Promise<void> {
    // 建表存放数据库版本以便升级，当前版本为0。
    const hasVersionTable = await this.db.schema.hasTable(
      `${this.qid}-dbVersion`
    );
    if (!hasVersionTable) {
      await this.db.schema.createTable(`${this.qid}-dbVersion`, (table) => {
        table.integer("dbVersion");
        table.primary(["dbVersion"]);
      });
      await this.db(`${this.qid}-dbVersion`).insert({ dbVersion: 0 });
    }
    const dbVersion = await this.db<{ dbVersion: number }>(
      `${this.qid}-dbVersion`
    ).select();
    // 若版本低于当前版本则启动升级函数
    if (dbVersion[0].dbVersion < 0) {
      this.updateDB();
    }

    // 建表存放聊天
    const hasRoomTable = await this.db.schema.hasTable(`${this.qid}-rooms`);
    if (!hasRoomTable) {
      await this.db.schema.createTable(`${this.qid}-rooms`, (table) => {
        table
          .integer("roomId")
          .unique()
          .index()
          .primary();
        table.string("roomName");
        table.string("avatar");
        table.integer("index");
        table.integer("unreadCount");
        table.integer("priority");
        table.integer("utime").index();
        table.jsonb("users");
        table.jsonb("lastMessage");
      });
    }

    // 建表存放忽略聊天
    const hasIgnoredTable = await this.db.schema.hasTable(
      `${this.qid}-ignoredChats`
    );
    if (!hasIgnoredTable) {
      await this.db.schema.createTable(`${this.qid}-ignoredChats`, (table) => {
        table
          .integer("id")
          .unique()
          .primary()
          .index();
        table.string("name");
      });
    }

    // 建立聊天记录 Schema
    await this.db.schema.createSchemaIfNotExists("msg");
  }

  async addRoom(room: Room): Promise<any> {
    await this.db(`${this.qid}-rooms`).insert(this.roomConToDB(room));
  }

  async updateRoom(roomId: number, room: Record<string, any>): Promise<any> {
    await this.db(`${this.qid}-rooms`)
      .where("roomId", "=", roomId)
      .update(this.roomConToDB(room));
  }

  async removeRoom(roomId: number): Promise<any> {
    await this.db(`${this.qid}-rooms`)
      .where("roomId", "=", roomId)
      .delete();
  }

  async getAllRooms(): Promise<Room[]> {
    const rooms = await this.db<Room>(`${this.qid}-rooms`).select();
    return rooms.map((room) => this.roomConFromDB(room));
  }

  async getRoom(roomId: number): Promise<Room> {
    const room = await this.db<Room>(`${this.qid}-rooms`)
      .where("roomId", "=", roomId)
      .select();
    return this.roomConFromDB(room);
  }

  async getUnreadCount(priority: number): Promise<number> {
    const unreadRooms = await this.db<Room>(`${this.qid}-rooms`)
      .where("unreadCount", ">", 0)
      .where("priority", "=", priority)
      .select("roomId"); // 尽可能减小通过 node 的数据量
    return unreadRooms.length;
  }

  async getFirstUnreadRoom(priority: number): Promise<Room> {
    const unreadRooms = await this.db<Room>(`${this.qid}-rooms`)
      .where("unreadCount", ">", 0)
      .where("priority", "=", priority)
      .orderBy("utime", "desc")
      .select();
    if (unreadRooms.length >= 1) return unreadRooms[0];
    return null;
  }

  async getIgnoredChats(): Promise<IgnoreChatInfo[]> {
    return await this.db<IgnoreChatInfo>(`${this.qid}-ignoredChats`).select();
  }

  async isChatIgnored(id: number): Promise<boolean> {
    const ignoredChats = await this.db<IgnoreChatInfo>(
      `${this.qid}-ignoredChats`
    ).where("id", "=", id);
    return ignoredChats.length !== 0;
  }

  async addIgnoredChat(info: IgnoreChatInfo): Promise<any> {
    await this.db<IgnoreChatInfo>(`${this.qid}-ignoredChats`).insert(info);
  }

  async removeIgnoredChat(roomId: number): Promise<any> {
    await this.db<IgnoreChatInfo>(`${this.qid}-ignoredChats`)
      .where("id", "=", roomId)
      .delete();
  }

  async addMessage(roomId: number, message: Message): Promise<any> {
    // 建表存放聊天记录
    const hasMsgTable = await this.db.schema.hasTable(
      `${this.qid}-msg${roomId}`
    );
    if (!hasMsgTable) {
      await this.db.schema
        .withSchema("msg")
        .createTable(`${this.qid}-msg${roomId}`, (table) => {
          table
            .string("_id")
            .unique()
            .index()
            .primary()
            .unsigned();
          table.integer("senderId");
          table.string("username");
          table.string("content").nullable();
          table.string("timestamp");
          table.string("date");
          table.string("role");
          table.jsonb("file").nullable();
        });
    }
    await this.db<Message>(`${this.qid}-msg${roomId}`).insert({
      ...message,
      _id: `${message._id}`,
    });
  }

  async updateMessage(
    roomId: number,
    messageId: string | number,
    message: object
  ): Promise<any> {
    await this.db<Message>(`${this.qid}-msg${roomId}`)
      .where("_id", "=", `${messageId}`)
      .update(message);
  }

  async fetchMessages(
    roomId: number,
    skip: number,
    limit: number
  ): Promise<Message[]> {
    return await this.db<Message>(`${this.qid}-msg${roomId}`)
      .orderBy("time", "desc")
      .limit(limit)
      .offset(skip - 1)
      .select();
  }

  async getMessage(roomId: number, messageId: string): Promise<Message> {
    return await this.db<Message>(`${this.qid}-msg${roomId}`)
      .where("_id", "=", messageId)
      .select()[0];
  }

  async addMessages(roomId: number, messages: Message[]): Promise<any> {
    try {
      await this.db<Message>(`${this.qid}-msg${roomId}`).insert(messages);
    } catch (e) {
      return e;
    }
  }
}
