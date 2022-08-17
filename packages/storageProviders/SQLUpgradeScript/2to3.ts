import { Knex } from "knex";
import { DBVersion, MsgTableName } from "@icalingua/types/SQLTableTypes";

const upg2to3 = async (db: Knex) => {
    const msgTableNames = await db<MsgTableName>("msgTableName").select(
        "tableName"
    );
    const msgTableNamesAry = msgTableNames.map((obj) => obj.tableName);
    if (msgTableNamesAry.length !== 0) {
        const PAry = msgTableNamesAry.map(async (msgTableName) => {
            await db.schema.alterTable(msgTableName, (table) => {
                table.boolean("flash").nullable();
            });
        });
        await Promise.all(PAry);
    }
    await db<DBVersion>("dbVersion").update({ dbVersion: 3 });
};

export default upg2to3;
