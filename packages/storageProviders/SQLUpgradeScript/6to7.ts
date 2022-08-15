import { Knex } from "knex";
import Message from "@icalingua/types/Message";
import {
    DBVersion,
    MessageInSQLDB,
    MsgTableName,
} from "@icalingua/types/SQLTableTypes";

/** 应该是最麻烦、问题最多的一次升级。该次升级旨在取消动态表名，将所有房间的消息存到同一个表内，
 * 从而解决烦人的问题。
 */
const upg6to7 = async (db: Knex, dbType: "pg" | "mysql" | "sqlite3") => {
    console.log(
        "Applying SQL Storage Provider Update:\n",
        "Version 7\n",
        "Fill the Rabbit Hole"
    );
    const msgTableNames = await db<MsgTableName>("msgTableName").select(
        "tableName"
    );
    const msgTableNamesAry = msgTableNames.map((obj) => obj.tableName);

    /** 全并发升级，快速 */
    const upgFast = async () => {
        const PAry = msgTableNamesAry.map(async (msgTableName) => {
            const hasMsgTable = await db.schema.hasTable(msgTableName);
            if (!hasMsgTable) {
                return Promise.resolve();
            } else {
                return new Promise<void>((resolve) => {
                    const roomId = msgTableName.substring(3);
                    const messageStream = db<Message>(msgTableName)
                        .select("*")
                        .stream();
                    messageStream.on("data", async (data: Message) => {
                        try {
                            await db<MessageInSQLDB>("messages")
                                .insert({
                                    ...data,
                                    roomId: Number(roomId),
                                })
                                .onConflict("_id")
                                .ignore();
                        } catch (e) {
                            console.error(e);
                        }
                    });
                    messageStream.on("end", async () => {
                        await db.schema.dropTable(msgTableName);
                        resolve();
                    });
                });
            }
        });
        await Promise.all(PAry);
    };

    /** 逐个升级，兼容性好 */
    const upgLegacy = async () => {
        for await (const msgTableName of msgTableNamesAry) {
            const hasMsgTable = await db.schema.hasTable(msgTableName);
            if (hasMsgTable) {
                const roomId = msgTableName.substring(3);
                const msgCount = await db<Message>(msgTableName).count("_id");
                const msgCountNum = Number(msgCount[0].count);
                for (let i = 0; i <= msgCountNum; i += 200) {
                    try {
                        const messages = await db<Message>(msgTableName)
                            .select("*")
                            .offset(i)
                            .limit(200);
                        await db<MessageInSQLDB>("messages")
                            .insert(
                                messages.map((data) => ({
                                    ...data,
                                    roomId: Number(roomId),
                                }))
                            )
                            .onConflict("_id")
                            .ignore();
                    } catch (e) {
                        console.error(e);
                    }
                }
                await db.schema.dropTable(msgTableName);
            }
        }
    };

    if (msgTableNamesAry.length !== 0) {
        // SQLite 会完全阻塞，可能不会抛错，因此直接用慢速升级
        if (dbType !== "sqlite3") {
            // 其它数据库尝试全并发升级，若出错则尝试慢速升级
            try {
                await upgFast();
            } catch (e) {
                console.error(e);
                console.log("快速升级失败，切换到兼容模式");
                await upgLegacy();
            }
        } else {
            await upgLegacy();
        }
    }

    await db.schema.dropTable("msgTableName");
    await db<DBVersion>("dbVersion").update({ dbVersion: 7 });
};

export default upg6to7;
