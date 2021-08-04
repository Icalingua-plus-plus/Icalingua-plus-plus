import { Knex } from "knex";
import { DBVersion, MsgTableName } from "../../../types/SQLTableTypes";

const upg0to1 = async (db: Knex) => {
  try {
    await db.schema.alterTable("rooms", (table) => {
      table.dropColumn("at");
    });
    await db.schema.alterTable("rooms", (table) => {
      table.string("at");
    });
    const msgTableNames = await db<MsgTableName>("msgTableName").select(
      "tableName"
    );
    const msgTableNamesAry = msgTableNames.map((obj) => obj.tableName);
    if (msgTableNamesAry.length !== 0) {
      const PAry = msgTableNamesAry.map(async (msgTableName) => {
        await db.schema.alterTable(msgTableName, (table) => {
          table.dropColumn("at");
        });
        await db.schema.alterTable(msgTableName, (table) => {
          table.string("at");
        });
      });
      await Promise.all(PAry);
    }
    await db<DBVersion>("dbVersion").update({ dbVersion: 1 });
  } catch (e) {
    console.error(e);
    throw e;
  }
};

export default upg0to1;
