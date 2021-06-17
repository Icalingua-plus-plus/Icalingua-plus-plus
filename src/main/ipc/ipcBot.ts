import {ipcMain} from 'electron'
import {Client, createClient} from "oicq";
import path from "path";

declare global {
    namespace NodeJS {
        interface Global {
            bot: Client
            STORE_PATH: string
        }
    }
}

let bot: Client

ipcMain.on('createBot', (event, form) => {
    bot = global.bot = createClient(Number(form.username), {
        platform: Number(form.protocol),
        data_dir: path.join(global.STORE_PATH, "/data"),
        ignore_self: false,
        brief: true,
        log_level: process.env.NODE_ENV === "development" ? 'trace' : 'off'
    });
    bot.setMaxListeners(233);
})

ipcMain.handle('getFriendsAndGroups', async () => {
    const friends = bot.fl.values();
    let iterF = friends.next();
    const friendsAll = []
    while (!iterF.done) {
        const f = {...iterF.value}
        f.sc = (f.nickname + f.remark + f.user_id).toUpperCase()
        friendsAll.push(f);
        iterF = friends.next();
    }
    const groups = bot.gl.values();
    let iterG = groups.next();
    const groupsAll = []
    while (!iterG.done) {
        const f = {...iterG.value}
        f.sc = (f.group_name + f.group_id).toUpperCase()
        groupsAll.push(f);
        iterG = groups.next();
    }
    return {
        friendsAll, groupsAll
    }
})
