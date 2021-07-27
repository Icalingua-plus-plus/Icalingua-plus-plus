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
    this.type = type;
    switch (type) {
      case "sqlite3":
        this.db = knex({
          client: "sqlite3",
          connection: { filename: `${this.qid}.db` },
          useNullAsDefault: true,
        });
        break;
      case "mysql":
        this.db = knex({
          client: "mysql",
          connection: { ...connectOpt },
          useNullAsDefault: true,
        });
        break;
      case "pg":
        this.db = knex({
          client: "pg",
          connection: { ...connectOpt },
          useNullAsDefault: true,
          searchPath: [this.qid, "public"],
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
    if (room) return { ...room, roomId: Number(room.roomId) } as Room;
    return null;
  }

  private msgConFromDB(message: Message): Message {
    if (message) {
      return {
        ...message,
        senderId: Number(message.senderId),
        time: Number(message.time),
      };
    }
    return null;
  }

  private updateDB() {
    return 0;
  }

  async connect(): Promise<void> {
    // 建表存放数据库版本以便升级，当前版本为0。
    const hasVersionTable = await this.db.schema.hasTable(`dbVersion`);
    if (!hasVersionTable) {
      await this.db.schema.createTable(`dbVersion`, (table) => {
        table.integer("dbVersion");
        table.primary(["dbVersion"]);
      });
      await this.db(`dbVersion`).insert({ dbVersion: 0 });
    }

    // 建表存放聊天数据库名以便升级。
    const hasMsgTableNameTable = await this.db.schema.hasTable(`msgTableName`);
    if (!hasMsgTableNameTable) {
      await this.db.schema.createTable("msgTableName", (table) => {
        table.increments("id").primary();
        table.string("tableName");
      });
    }

    const dbVersion = await this.db<{ dbVersion: number }>(`dbVersion`).select(
      "*"
    );
    // 若版本低于当前版本则启动升级函数
    if (dbVersion[0].dbVersion < 0) {
      this.updateDB();
    }

    // 建表存放聊天
    const hasRoomTable = await this.db.schema.hasTable(`rooms`);
    if (!hasRoomTable) {
      await this.db.schema.createTable(`rooms`, (table) => {
        table
          .string("roomId")
          .unique()
          .index()
          .primary();
        table.string("roomName");
        table.string("avatar");
        table.integer("index");
        table.integer("unreadCount");
        table.integer("priority");
        table.bigInteger("utime").index();
        table.jsonb("users");
        table.jsonb("lastMessage");
        table.boolean("at").nullable();
        table.boolean("autoDownload").nullable();
        table.string("downloadPath").nullable();
      });
    }

    // 建表存放忽略聊天
    const hasIgnoredTable = await this.db.schema.hasTable(`ignoredChats`);
    if (!hasIgnoredTable) {
      await this.db.schema.createTable(`ignoredChats`, (table) => {
        table
          .integer("id")
          .unique()
          .primary()
          .index();
        table.string("name");
      });
    }
  }

  async addRoom(room: Room): Promise<any> {
    return await this.db(`rooms`).insert(this.roomConToDB(room));
  }

  async updateRoom(roomId: number, room: Record<string, any>): Promise<any> {
    await this.db(`rooms`)

      .where("roomId", "=", roomId)
      .update(this.roomConToDB(room));
  }

  async removeRoom(roomId: number): Promise<any> {
    await this.db(`rooms`)

      .where("roomId", "=", roomId)
      .delete();
    await this.db("msgTableName")

      .where("tableName", "=", `msg${roomId}`)
      .insert({ tableName: `msg${roomId}` });
    await this.db.schema.dropTableIfExists(`msg${roomId}`);
  }

  async getAllRooms(): Promise<Room[]> {
    const rooms = await this.db<Room>(`rooms`).select("*");
    return rooms.map((room) => this.roomConFromDB(room));
  }

  async getRoom(roomId: number): Promise<Room> {
    const room = await this.db<Room>(`rooms`)

      .where("roomId", "=", roomId)
      .select("*");
    return this.roomConFromDB(room[0]);
  }

  async getUnreadCount(priority: number): Promise<number> {
    const unreadRooms = await this.db<Room>(`rooms`)

      .where("unreadCount", ">", 0)
      .where("priority", "=", priority)
      .select("roomId"); // 尽可能减小通过 node 的数据量
    return unreadRooms.length;
  }

  async getFirstUnreadRoom(priority: number): Promise<Room> {
    const unreadRooms = await this.db<Room>(`rooms`)

      .where("unreadCount", ">", 0)
      .where("priority", "=", priority)
      .orderBy("utime", "desc")
      .select("*");
    if (unreadRooms.length >= 1) return unreadRooms[0];
    return null;
  }

  async getIgnoredChats(): Promise<IgnoreChatInfo[]> {
    return await this.db<IgnoreChatInfo>(`ignoredChats`).select("*");
  }

  async isChatIgnored(id: number): Promise<boolean> {
    const ignoredChats = await this.db<IgnoreChatInfo>(`ignoredChats`).where(
      "id",
      "=",
      id
    );
    return ignoredChats.length !== 0;
  }

  async addIgnoredChat(info: IgnoreChatInfo): Promise<any> {
    await this.db<IgnoreChatInfo>(`ignoredChats`).insert(info);
  }

  async removeIgnoredChat(roomId: number): Promise<any> {
    await this.db<IgnoreChatInfo>(`ignoredChats`)

      .where("id", "=", roomId)
      .delete();
  }

  // 建表存放聊天记录
  private async createMsgTable(roomId: number) {
    const hasMsgTable = await this.db.schema.hasTable(`msg${roomId}`);
    if (!hasMsgTable) {
      await this.db.schema.createTable(`msg${roomId}`, (table) => {
        table
          .string("_id")
          .unique()
          .index()
          .primary()
          .unsigned();
        table.string("senderId");
        table.string("username");
        table.text("content").nullable();
        table.text("code").nullable();
        table.string("timestamp");
        table.string("date");
        table.string("role");
        table.jsonb("file").nullable();
        table.bigInteger("time");
        table.jsonb("replyMessage").nullable();
        table.boolean("at").nullable();
      });
      await this.db("msgTableName").insert({ tableName: `msg${roomId}` });
    }
  }

  async addMessage(roomId: number, message: Message): Promise<any> {
    await this.createMsgTable(roomId);
    await this.db<Message>(`msg${roomId}`).insert({
      ...message,
      _id: `${message._id}`,
    });
  }

  async updateMessage(
    roomId: number,
    messageId: string | number,
    message: object
  ): Promise<any> {
    await this.db<Message>(`msg${roomId}`)

      .where("_id", "=", `${messageId}`)
      .update(message);
  }

  async fetchMessages(
    roomId: number,
    skip: number,
    limit: number
  ): Promise<Message[]> {
    await this.createMsgTable(roomId);
    const messages = await this.db<Message>(`msg${roomId}`)

      .orderBy("time", "desc")
      .limit(limit)
      .offset(skip)
      .select("*");
    return messages.reverse().map((message) => this.msgConFromDB(message));
  }

  async getMessage(roomId: number, messageId: string): Promise<Message> {
    const message = await this.db<Message>(`msg${roomId}`)

      .where("_id", "=", messageId)
      .select("*")[0];
    return this.msgConFromDB(message);
  }

  async addMessages(roomId: number, messages: Message[]): Promise<any> {
    await this.db<Message>(`msg${roomId}`)

      .insert(Array.from(new Set(messages)))
      .onConflict("_id")
      .ignore();
  }
}
