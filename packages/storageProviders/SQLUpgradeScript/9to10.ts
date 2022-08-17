import { Knex } from "knex";
import { DBVersion } from "@icalingua/types/SQLTableTypes";

const upg9to10 = async (db: Knex) => {
    await db.schema.alterTable("messages", (table) => {
        table.boolean("hide").nullable();
    });
    await db<DBVersion>("dbVersion").update({ dbVersion: 10 });
};

export default upg9to10;
