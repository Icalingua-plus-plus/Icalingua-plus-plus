import { Knex } from "knex";
import { DBVersion } from "@icalingua/types/SQLTableTypes";

const upg7to8 = async (db: Knex) => {
    await db.schema.alterTable("rooms", (table) => {
        table.dropColumn("avatar");
    });
    await db<DBVersion>("dbVersion").update({ dbVersion: 8 });
};

export default upg7to8;
