import knex, { Knex } from "knex";
import lodash from "lodash";
import path from "path";
import fs from "fs";
import IgnoreChatInfo from "../../types/IgnoreChatInfo";
import Message from "../../types/Message";
import Room from "../../types/Room";
import StorageProvider from "../../types/StorageProvider";

interface PgMyOpt {
  host: string;
  user: string;
  password: string;
  database: string;
  dataPath?: never;
}

interface SQLiteOpt {
  dataPath: string;
  host?: never;
  user?: never;
  password?: never;
  database?: never;
}

export default class SQLStorageProvider implements StorageProvider {
  id: string;
  type: "pg" | "mysql" | "sqlite3";
  db: Knex;
  private qid: string;

  constructor(
    id: string,
    type: "pg" | "mysql" | "sqlite3",
    connectOpt: PgMyOpt | SQLiteOpt
  ) {
    this.id = id;
    this.qid = `eqq${id}`;
    this.type = type;
    switch (type) {
      case "sqlite3":
        const dbPath = path.join(connectOpt.dataPath, "databases");
        if (!fs.existsSync(dbPath)) {
          fs.mkdirSync(dbPath, {
            recursive: true,
          });
        }
        this.db = knex({
          client: "sqlite3",
          connection: {
            filename: `${path.join(dbPath, this.qid)}.db`,
          },
          useNullAsDefault: true,
        });
        break;
      case "mysql":
        this.db = knex({
          client: "mysql",
          connection: connectOpt,
          useNullAsDefault: true,
        });
        break;
      case "pg":
        this.db = knex({
          client: "pg",
          connection: connectOpt,
          useNullAsDefault: true,
          searchPath: [this.qid, "public"],
        });
        break;
      default:
        break;
    }
  }

  private roomConToDB(room: Room): Record<string, any> {
    if (room) {
      return {
        ...room,
        users: JSON.stringify(room.users),
        lastMessage: JSON.stringify(room.lastMessage),
      };
    }
    return null;
  }

  private roomConFromDB(room: Record<string, any>): Room {
    if (room)
      return {
        ...room,
        roomId: Number(room.roomId),
        utime: Number(room.utime),
        users: JSON.parse(room.users),
        lastMessage: JSON.parse(room.lastMessage),
        downloadPath: room.downloadPath ? room.downloadPath : "",
      } as Room;
    return null;
  }

  private msgConToDB(message: Message): Record<string, any> {
    if (message)
      return {
        ...message,
        senderId: `${message.senderId}`,
        _id: `${message._id}`,
        file: JSON.stringify(message.file),
        replyMessage: JSON.stringify(message.replyMessage),
      };
    return null;
  }

  private msgConFromDB(message: Record<string, any>): Message {
    if (message) {
      return {
        ...message,
        senderId: Number(message.senderId),
        time: Number(message.time),
        file: JSON.parse(message.file),
        replyMessage: JSON.parse(message.replyMessage),
      } as Message;
    }
    return null;
  }

  private updateDB() {
    return 0;
  }

  async connect(): Promise<void> {

    // PostgreSQL 特有功能，可用一个数据库存放所有用户的聊天数据
    if (this.type === "pg") {
      await this.db.schema.createSchemaIfNotExists(this.qid);
    }

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
        table.text("users");
        table.text("lastMessage");
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

  async updateRoom(roomId: number, room: Room): Promise<any> {
    await this.db(`rooms`)
      .where("roomId", "=", roomId)
      .update(this.roomConToDB(room));
  }

  async removeRoom(roomId: number): Promise<any> {
    await this.db(`rooms`)
      .where("roomId", "=", roomId)
      .delete();
  }

  async getAllRooms(): Promise<Room[]> {
    const rooms = await this.db<Room>(`rooms`)
      .select("*")
      .orderBy("utime", "desc");
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
          .primary();
        table.string("senderId");
        table.string("username");
        table.text("content").nullable();
        table.text("code").nullable();
        table.string("timestamp");
        table.string("date");
        table.string("role");
        table.text("file").nullable();
        table.bigInteger("time");
        table.text("replyMessage").nullable();
        table.boolean("at").nullable();
      });
      await this.db("msgTableName").insert({ tableName: `msg${roomId}` });
    }
  }

  async addMessage(roomId: number, message: Message): Promise<any> {
    await this.createMsgTable(roomId);
    await this.db<Message>(`msg${roomId}`).insert(this.msgConToDB(message));
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
      .select("*");
    return this.msgConFromDB(message[0]);
  }

  async addMessages(roomId: number, messages: Message[]): Promise<any> {
    try {
      const msgToInsert = messages.map((message) => this.msgConToDB(message));
      const chunkedMessages = lodash.chunk(msgToInsert, 200);
      const pAry = chunkedMessages.map(async (chunkedMessage) => {
        await this.db<Message>(`msg${roomId}`)
          .insert(chunkedMessage)
          .onConflict("_id")
          .ignore();
      });
      await Promise.all(pAry);
    } catch (e) {
      return e;
    }
  }
}
