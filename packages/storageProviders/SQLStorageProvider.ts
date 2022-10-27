import fs from "fs";
import knex, { Knex } from "knex";
import lodash from "lodash";
import path from "path";
import IgnoreChatInfo from "@icalingua/types/IgnoreChatInfo";
import Message from "@icalingua/types/Message";
import Room from "@icalingua/types/Room";
import { DBVersion, MessageInSQLDB } from "@icalingua/types/SQLTableTypes";
import StorageProvider from "@icalingua/types/StorageProvider";
import upg0to1 from "./SQLUpgradeScript/0to1";
import upg1to2 from "./SQLUpgradeScript/1to2";
import upg2to3 from "./SQLUpgradeScript/2to3";
import upg3to4 from "./SQLUpgradeScript/3to4";
import upg4to5 from "./SQLUpgradeScript/4to5";
import upg5to6 from "./SQLUpgradeScript/5to6";
import upg6to7 from "./SQLUpgradeScript/6to7";
import upg7to8 from "./SQLUpgradeScript/7to8";
import upg8to9 from "./SQLUpgradeScript/8to9";
import upg9to10 from "./SQLUpgradeScript/9to10";
import upg10to11 from "./SQLUpgradeScript/10to11";

const dbVersionLatest = 11;

/** PostgreSQL 和 MySQL/MariaDB 连接需要的信息的类型定义 */
interface PgMyOpt {
    host: string;
    user: string;
    password: string;
    database: string;
    dataPath?: never;
}

/** SQLite 存放 DB 文件需要的信息的类型定义 */
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

    /** `constructor` 方法。这里会判断数据库类型并建立连接。 */
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
                        charset: "utf8mb4",
                    },
                    useNullAsDefault: true,
                });
                break;
            case "mysql":
                this.db = knex({
                    client: "mysql",
                    connection: { ...connectOpt, charset: "utf8mb4" },
                    useNullAsDefault: true,
                });
                break;
            case "pg":
                this.db = knex({
                    client: "pg",
                    connection: { ...connectOpt, charset: "utf8mb4" },
                    useNullAsDefault: true,
                    searchPath: [this.qid, "public"],
                });
                break;
            default:
                break;
        }
    }

    /** 私有方法，将 icalingua 的 room 转换成适合放在数据库里的格式 */
    private roomConToDB(room: Partial<Room>): Record<string, any> {
        try {
            if (room) {
                return {
                    ...room,
                    users: JSON.stringify(room.users),
                    lastMessage: JSON.stringify(room.lastMessage),
                    at: JSON.stringify(room.at),
                };
            }
            return null;
        } catch (e) {
            throw e;
        }
    }

    /** 私有方法，将 room 从数据库内格式转换成 icalingua 使用的格式 */
    private roomConFromDB(room: Record<string, any>): Room {
        try {
            if (room)
                return {
                    ...room,
                    roomId: Number(room.roomId),
                    utime: Number(room.utime),
                    users: JSON.parse(room.users),
                    lastMessage: JSON.parse(room.lastMessage),
                    downloadPath: room.downloadPath ? room.downloadPath : "",
                    at: JSON.parse(room.at),
                } as Room;
            return null;
        } catch (e) {
            throw e;
        }
    }

    /** 私有方法，将 icalingua 的 message 转换成适合放在数据库里的格式 */
    private msgConToDB(message: Message, roomId: number): Record<string, any> {
        try {
            if (message)
                return {
                    ...message,
                    senderId: `${message.senderId}`,
                    _id: `${message._id}`,
                    file: JSON.stringify(message.file),
                    files: JSON.stringify(message.files),
                    replyMessage: JSON.stringify(message.replyMessage),
                    at: JSON.stringify(message.at),
                    mirai: JSON.stringify(message.mirai),
                    roomId,
                };
            return null;
        } catch (e) {
            throw e;
        }
    }

    /** 私有方法，将 message 从数据库内格式转换成 icalingua 使用的格式 */
    private msgConFromDB(message: Record<string, any>): Message {
        try {
            if (message) {
                delete message.roomId;
                return {
                    ...message,
                    senderId: Number(message.senderId),
                    time: Number(message.time),
                    file: JSON.parse(message.file),
                    files: JSON.parse(message.files),
                    replyMessage: JSON.parse(message.replyMessage),
                    at: JSON.parse(message.at),
                    mirai: JSON.parse(message.mirai),
                } as Message;
            }
            return null;
        } catch (e) {
            throw e;
        }
    }

    /** 私有方法，用来根据当前数据库版本对数据库进行升级，从而在 Icalingua 使用的数据类型发生改变时，数据库可以存放下它们 */
    private async updateDB(dbVersion: number) {
        console.log("info", "正在升级数据库");
        // 这个 switch 居然不用 break，好耶！
        try {
            switch (dbVersion) {
                case 0:
                    await upg0to1(this.db);
                case 1:
                    await upg1to2(this.db);
                case 2:
                    await upg2to3(this.db);
                case 3:
                    await upg3to4(this.db);
                case 4:
                    await upg4to5(this.db);
                case 5:
                    await upg5to6(this.db);
                case 6:
                    await upg6to7(this.db, this.type);
                case 7:
                    await upg7to8(this.db);
                case 8:
                    if (dbVersion >= 7) await upg8to9(this.db);
                case 9:
                    if (dbVersion >= 7) await upg9to10(this.db);
                case 10:
                    await upg10to11(this.db);
                default:
                    break;
            }
            return true;
        } catch (e) {
            throw e;
        }
    }

    /** 实现 {@link StorageProvider} 类的 connect 方法。
     * 名字叫 connect ，实际上只有另外两个 `StorageProvider` 在这个方法下真正地干了连接数据库的活儿。
     *
     * 这个方法在这里主要干了这些事情：
     * 1. 如果是 PostgreSQL 数据库，那么根据 QQ 号建立一个 Schema，把这个 QQ 号产生的信息存在里面。
     * 2. 检验并建立 `dbVersion` 这个特有表 ，目的是存放与升级有关的信息。
     * 3. 检验并建立 `rooms`、`messages` 和 `ignoredChats` 这三个 Icalingua 需要的表。`rooms` 存放聊天房间，
     * `messages` 存放**所有房间的**聊天记录，`ignoredChats` 存放被忽略的聊天房间。
     * 4. 检查 `dbVersion` 中存放的数据库版本与最新版本是否一致，若不一致，则启动升级脚本 {@link updateDB}。
     */
    async connect(): Promise<void> {
        // PostgreSQL 特有功能，可用一个数据库存放所有用户的聊天数据
        try {
            if (this.type === "pg") {
                await this.db.schema.createSchemaIfNotExists(this.qid);
            }

            // 建表存放数据库版本以便日后升级
            const hasVersionTable = await this.db.schema.hasTable(`dbVersion`);
            if (!hasVersionTable) {
                await this.db.schema.createTable(`dbVersion`, (table) => {
                    if (this.type === "mysql")
                        table.collate("utf8mb4_unicode_ci");
                    table.integer("dbVersion");
                    table.primary(["dbVersion"]);
                });
                await this.db(`dbVersion`).insert({
                    dbVersion: dbVersionLatest,
                });
            }

            // 建表存放聊天房间
            const hasRoomTable = await this.db.schema.hasTable(`rooms`);
            if (!hasRoomTable) {
                await this.db.schema.createTable(`rooms`, (table) => {
                    if (this.type === "mysql")
                        table.collate("utf8mb4_unicode_ci");
                    table.string("roomId").unique().primary();
                    table.string("roomName");
                    table.integer("index");
                    table.integer("unreadCount");
                    table.integer("priority");
                    table.bigInteger("utime").index();
                    table.text("users");
                    table.text("lastMessage");
                    table.string("at").nullable();
                    table.boolean("autoDownload").nullable();
                    table.string("downloadPath").nullable();
                });
            }

            // 建表存放聊天记录
            const hasMessagesTable = await this.db.schema.hasTable(`messages`);
            if (!hasMessagesTable) {
                await this.db.schema.createTable(`messages`, (table) => {
                    if (this.type === "mysql")
                        table.collate("utf8mb4_unicode_ci");
                    table.string("_id").unique().primary();
                    table.string("senderId");
                    table.string("username");
                    table.text("content").nullable();
                    table.text("code").nullable();
                    table.string("timestamp");
                    table.string("date");
                    table.string("role");
                    table.text("file").nullable();
                    table.text("files").nullable();
                    table.bigInteger("time").index();
                    table.text("replyMessage").nullable();
                    table.string("at").nullable();
                    table.boolean("deleted").nullable();
                    table.boolean("system").nullable();
                    table.text("mirai").nullable();
                    table.boolean("reveal").nullable();
                    table.boolean("flash").nullable();
                    table.string("title", 24).nullable();
                    table.bigInteger("roomId").index();
                    table.string("anonymousId").nullable();
                    table.string("anonymousflag").nullable();
                    table.boolean("hide").nullable();
                    table.index(["roomId", "time"]);
                });
            }

            // 建表存放忽略聊天房间
            const hasIgnoredTable = await this.db.schema.hasTable(
                `ignoredChats`
            );
            if (!hasIgnoredTable) {
                await this.db.schema.createTable(`ignoredChats`, (table) => {
                    if (this.type === "mysql")
                        table.collate("utf8mb4_unicode_ci");
                    table
                        .bigInteger("id") // 在 pgSQL 里会被返回成 string，不知有无 bug
                        .unique()
                        .primary();
                    table.string("name");
                });
            }

            // 获取数据库版本
            const dbVersion = await this.db<DBVersion>(`dbVersion`).select(
                "dbVersion"
            );
            // 若版本低于当前版本则启动升级函数
            if (dbVersion[0].dbVersion < dbVersionLatest) {
                await this.updateDB(dbVersion[0].dbVersion);
            }
        } catch (e) {
            throw e;
        }
    }

    /** 实现 {@link StorageProvider} 类的 `addRoom` 方法，
     * 对应 room 的“增”操作。
     *
     * 在“新房间收到新消息”等需要新增房间的事件时被调用。
     */
    async addRoom(room: Room): Promise<any> {
        try {
            return await this.db(`rooms`).insert(this.roomConToDB(room));
        } catch (e) {
            throw e;
        }
    }

    /** 实现 {@link StorageProvider} 类的 `updateRoom` 方法，
     * 对应 room 的“改”操作。
     *
     * 在“收到新消息”等引起房间信息变化的事件时调用。
     */
    async updateRoom(roomId: number, room: Partial<Room>): Promise<any> {
        try {
            await this.db(`rooms`)
                .where("roomId", "=", roomId)
                .update(this.roomConToDB(room));
        } catch (e) {
            throw e;
        }
    }

    /** 实现 {@link StorageProvider} 类的 `removeRoom` 方法，
     * 对应 room 的“删”操作。
     *
     * 在删除聊天时调用。
     */
    async removeRoom(roomId: number): Promise<any> {
        try {
            await this.db(`rooms`).where("roomId", "=", roomId).delete();
        } catch (e) {
            throw e;
        }
    }

    /** 实现 {@link StorageProvider} 类的 `getAllRooms` 方法，
     * 对应 room 的“查所有”操作。
     *
     * 在登录成功后调用。
     */
    async getAllRooms(): Promise<Room[]> {
        try {
            const rooms = await this.db<Room>(`rooms`)
                .select("*")
                .orderBy("utime", "desc");
            return rooms.map((room) => this.roomConFromDB(room));
        } catch (e) {
            throw e;
        }
    }

    /** 实现 {@link StorageProvider} 类的 `getRoom` 方法，
     * 对应 room 的“查单个”操作。
     *
     * 在进入房间后被调用。
     */
    async getRoom(roomId: number): Promise<Room> {
        try {
            const room = await this.db<Room>(`rooms`)
                .where("roomId", "=", roomId)
                .select("*");
            return this.roomConFromDB(room[0]);
        } catch (e) {
            throw e;
        }
    }

    /** 实现 {@link StorageProvider} 类的 `getUnreadCount` 方法，
     * 是对 room 的自定义查询方法。查询有未读消息的大于指定通知优先级的房间数。
     *
     * 在登录成功与每次收到消息后调用。
     */
    async getUnreadCount(priority: number): Promise<number> {
        try {
            const unreadRooms = await this.db<Room>(`rooms`)
                .where("unreadCount", ">", 0)
                .where("priority", ">=", priority)
                .count("roomId");
            return Number(
                unreadRooms[0]["count(`roomId`)"] ||
                    unreadRooms[0]["count"] ||
                    0
            );
        } catch (e) {
            throw e;
        }
    }

    /** 实现 {@link StorageProvider} 类的 `getFirstUnreadRoom` 方法，
     * 是对 room 的自定义查询方法。
     *
     * 调用情况未知。
     */
    async getFirstUnreadRoom(priority: number): Promise<Room> {
        try {
            const unreadRooms = await this.db<Room>(`rooms`)
                .where("unreadCount", ">", 0)
                .where("priority", "=", priority)
                .orderBy("utime", "desc")
                .select("*");
            if (unreadRooms.length >= 1) return unreadRooms[0];
            return null;
        } catch (e) {
            throw e;
        }
    }

    /** 实现 {@link StorageProvider} 类的 `getIgnoredChats` 方法，
     * 是对 `ignoredChats` 的“查所有”操作。
     *
     * 在用户查询忽略聊天列表时被调用。
     */
    async getIgnoredChats(): Promise<IgnoreChatInfo[]> {
        try {
            return await this.db<IgnoreChatInfo>(`ignoredChats`).select("*");
        } catch (e) {
            throw e;
        }
    }

    /** 实现 {@link StorageProvider} 类的 `isChatIgnored` 方法，
     * 是对 `ignoredChats` 的自定义查询操作。返回一个**布尔**值。
     *
     * 在收到消息时被调用。
     */
    async isChatIgnored(id: number): Promise<boolean> {
        try {
            const ignoredChats = await this.db<IgnoreChatInfo>(
                `ignoredChats`
            ).where("id", "=", id);
            return ignoredChats.length !== 0;
        } catch (e) {
            throw e;
        }
    }

    /** 实现 {@link StorageProvider} 类的 `addIgnoredChat` 方法，
     * 是对 `ignoredChats` 的“增”操作。
     *
     * 在忽略聊天时被调用。
     */
    async addIgnoredChat(info: IgnoreChatInfo): Promise<any> {
        try {
            await this.db<IgnoreChatInfo>(`ignoredChats`).insert(info);
        } catch (e) {
            throw e;
        }
    }

    /** 实现 {@link StorageProvider} 类的 `removeIgnoredChat` 方法，
     * 是对 `ignoredChats` 的“删”操作。
     *
     * 在取消忽略聊天时被调用。
     */
    async removeIgnoredChat(roomId: number): Promise<any> {
        try {
            await this.db<IgnoreChatInfo>(`ignoredChats`)
                .where("id", "=", roomId)
                .delete();
        } catch (e) {
            throw e;
        }
    }

    /** 实现 {@link StorageProvider} 类的 `addMessage` 方法，
     * 是对 `msg${roomId}` 的“增”操作。
     *
     * 在收到消息时被调用。
     */
    async addMessage(roomId: number, message: Message): Promise<any> {
        try {
            await this.db<Message>("messages")
                .insert(this.msgConToDB(message, roomId))
                .onConflict()
                .ignore();
        } catch (e) {
            throw e;
        }
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
        try {
            await this.db<Message>("messages")
                .where("_id", "=", `${messageId}`)
                .update(message);
        } catch (e) {
            throw e;
        }
    }

    /** 实现 {@link StorageProvider} 类的 `updateURL` 方法，
     * 是对 `msg${roomId}` 的“改”操作。
     *
     * 在“刷新视频地址”等需要改动消息内容的事件中被调用。
     */
    async updateURL(
        roomId: number,
        messageId: string | number,
        message: Record<string, any>
    ): Promise<any> {
        try {
            await this.db<Message>("messages")
                .where("_id", "=", `${messageId}`)
                .update(message);
        } catch (e) {
            throw e;
        }
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
        try {
            await this.db<Message>("messages")
                .where("_id", "=", `${messageId}`)
                .update(this.msgConToDB(message, roomId));
        } catch (e) {
            throw e;
        }
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
        try {
            const messages = await this.db<MessageInSQLDB>("messages")
                .where("roomId", roomId)
                .orderBy("time", "desc")
                .limit(limit)
                .offset(skip)
                .select("*");
            return messages
                .reverse()
                .map((message) => this.msgConFromDB(message));
        } catch (e) {
            throw e;
        }
    }

    /** 实现 {@link StorageProvider} 类的 `getMessage` 方法，
     * 是对 `msg${roomId}` 的“查”操作。
     *
     * 在获取聊天历史消息时，该方法被调用。
     */
    async getMessage(roomId: number, messageId: string): Promise<Message> {
        try {
            const message = await this.db<MessageInSQLDB>("messages")
                .where("_id", messageId)
                .where("roomId", roomId)
                .select("*");
            if (message.length === 0) return null;
            return this.msgConFromDB(message[0]);
        } catch (e) {
            throw e;
        }
    }

    /** 实现 {@link StorageProvider} 类的 `addMessages` 方法，
     * 是对 `msg${roomId}` 的自定义增操作。用于向数据库内增加多条消息。
     *
     * 在获取聊天历史消息时，该方法被调用。
     */
    async addMessages(roomId: number, messages: Message[]): Promise<any> {
        try {
            const msgToInsert = messages.map((message) =>
                this.msgConToDB(message, roomId)
            );
            const chunkedMessages = lodash.chunk(msgToInsert, 200);
            const pAry = chunkedMessages.map(async (chunkedMessage) => {
                await this.db<Message>("messages")
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
