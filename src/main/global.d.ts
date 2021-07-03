import {Client} from "oicq";

declare global {
    namespace NodeJS {
        interface Global {
            bot: Client
            STORE_PATH: string
            winURL: string
            STATIC: string
        }
    }
}

