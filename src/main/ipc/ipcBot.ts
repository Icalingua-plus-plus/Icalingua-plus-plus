import {ipcMain} from 'electron'
import {Client, createClient} from "oicq";
import path from "path";

declare global{
    namespace NodeJS {
        interface Global {
            bot: Client
            STORE_PATH: string
        }
    }
}

let bot: Client

ipcMain.on('createBot',(event, form)=>{
    bot = global.bot = createClient(Number(form.username), {
        platform: Number(form.protocol),
        data_dir: path.join(global.STORE_PATH, "/data"),
        ignore_self: false,
        brief: true,
    });
    bot.setMaxListeners(233);
})
