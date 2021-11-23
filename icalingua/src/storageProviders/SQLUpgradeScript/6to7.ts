import { Knex } from "knex";
import Message from "../../types/Message";
import {
  DBVersion,
  MessageInSQLDB,
  MsgTableName,
} from "../../types/SQLTableTypes";

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
  if (msgTableNamesAry.length !== 0) {
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
  }
  await db.schema.dropTable("msgTableName");
  await db<DBVersion>("dbVersion").update({ dbVersion: 7 });
};

export default upg6to7;
