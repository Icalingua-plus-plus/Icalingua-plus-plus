import {Client} from "oicq";

declare global {
    namespace NodeJS {
        interface Global {
            bot: Client
            STORE_PATH: string
            glodb: any //todo: remove
            winURL: string
            STATIC: string
            __static: string //todo deprecate
        }
    }
}

