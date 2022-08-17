import { Knex } from "knex";
import { DBVersion } from "@icalingua/types/SQLTableTypes";

const upg8to9 = async (db: Knex) => {
    await db.schema.alterTable("messages", (table) => {
        table.string("anonymousId").nullable();
        table.string("anonymousflag").nullable();
    });
    await db<DBVersion>("dbVersion").update({ dbVersion: 9 });
};

export default upg8to9;
