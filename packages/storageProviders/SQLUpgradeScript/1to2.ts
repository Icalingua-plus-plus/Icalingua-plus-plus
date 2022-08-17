import { Knex } from "knex";
import { DBVersion, MsgTableName } from "@icalingua/types/SQLTableTypes";

const upg1to2 = async (db: Knex) => {
    const msgTableNames = await db<MsgTableName>("msgTableName").select(
        "tableName"
    );
    const msgTableNamesAry = msgTableNames.map((obj) => obj.tableName);
    if (msgTableNamesAry.length !== 0) {
        const PAry = msgTableNamesAry.map(async (msgTableName) => {
            await db.schema.alterTable(msgTableName, (table) => {
                table.boolean("deleted").nullable();
                table.boolean("system").nullable();
                table.text("mirai").nullable();
                table.boolean("reveal").nullable();
            });
        });
        await Promise.all(PAry);
    }
    await db<DBVersion>("dbVersion").update({ dbVersion: 2 });
};

export default upg1to2;
