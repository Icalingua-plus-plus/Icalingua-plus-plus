import { Knex } from "knex";
import { DBVersion, MsgTableName } from "@icalingua/types/SQLTableTypes";

const upg4to5 = async (db: Knex) => {
    const msgTableNames = await db<MsgTableName>("msgTableName").select(
        "tableName"
    );
    const msgTableNamesAry = msgTableNames.map((obj) => obj.tableName);
    if (msgTableNamesAry.length !== 0) {
        const PAry = msgTableNamesAry.map(async (msgTableName) => {
            await db.schema.alterTable(msgTableName, (table) => {
                table.string("title", 24).nullable();
            });
        });
        await Promise.all(PAry);
    }
    await db<DBVersion>("dbVersion").update({ dbVersion: 5 });
};

export default upg4to5;
