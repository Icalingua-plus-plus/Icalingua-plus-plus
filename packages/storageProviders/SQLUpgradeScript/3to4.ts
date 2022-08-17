import { Knex } from "knex";
import IgnoreChatInfo from "@icalingua/types/IgnoreChatInfo";
import { DBVersion } from "@icalingua/types/SQLTableTypes";

const upg3to4 = async (db: Knex) => {
    const ignoredChats = await db<IgnoreChatInfo>("ignoredChats").select("*");
    await db.schema.dropTable("ignoredChats");
    await db.schema.createTable("ignoredChats", (table) => {
        table.bigInteger("id").unique().primary().index();
        table.string("name");
    });
    if (ignoredChats.length !== 0) {
        await db<IgnoreChatInfo>("ignoredChats").insert(ignoredChats);
    }
    await db<DBVersion>("dbVersion").update({ dbVersion: 4 });
};

export default upg3to4;
