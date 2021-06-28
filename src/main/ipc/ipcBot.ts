import {ipcMain} from 'electron'
import {Client, createClient, MessageEventData} from "oicq";
import path from "path";
import MongoStorageProvider from "../storageProviders/MongoStorageProvider";
import RedisStorageProvider from "../storageProviders/RedisStorageProvider";
import IndexedStorageProvider from "../storageProviders/IndexedStorageProvider";
import StorageProvider from "../../types/StorageProvider";

declare global {
    namespace NodeJS {
        interface Global {
            bot: Client
            STORE_PATH: string
            glodb: any //todo: remove
        }
    }
}

type LoginForm = {
    username: string
    password: string
    protocol: number
    autologin: boolean
    onlineStatus: string
}
type LoginExtra = {
    storageType: string,
    mdbConnStr: string,
    rdsHost: string
}

export let bot: Client
let storage: StorageProvider

//region event handlers
const handler={
    onQQMessage(data: MessageEventData){

    },
    friendRecall() {

    }
}
//endregion
//region utility functions

//endregion

ipcMain.handle('createBot', async (event, form: LoginForm, extra: LoginExtra) => {
    bot = global.bot = createClient(Number(form.username), {
        platform: Number(form.protocol),
        data_dir: path.join(global.STORE_PATH, "/data"),
        ignore_self: false,
        brief: true,
        log_level: process.env.NODE_ENV === "development" ? 'mark' : 'off'
    });
    bot.setMaxListeners(233);

    //todo: use settings manager

    try {
        if (extra.storageType === 'mdb')
            storage = new MongoStorageProvider(extra.mdbConnStr, form.username)
        else if (extra.storageType === 'idb')
            storage = new IndexedStorageProvider(form.username)
        else if (extra.storageType === 'redis')
            storage = new RedisStorageProvider(extra.rdsHost, form.username)

        await storage.connect()
        storage.getAllRooms()
            .then(e => {
                e.forEach((e) => {
                    //更新群的名称
                    if (e.roomId > -1) return;
                    const group = bot.gl.get(-e.roomId)
                    if (group && group.group_name !== e.roomName) {
                        e.roomName = group.group_name;
                        storage.updateRoom(e.roomId, {roomName: group.group_name})
                    }
                });
            });

        bot.on("message", handler.onQQMessage);
        bot.on("notice.friend.recall", handler.friendRecall);
        bot.on("notice.group.recall", handler.groupRecall);
        bot.on("system.online", handler.online);
        bot.on("system.offline", handler.onOffline);
        bot.on("notice.friend.poke", handler.friendPoke);
        bot.on("notice.group.poke", handler.groupPoke);

    } catch (err) {
        console.log(err);
        global.glodb.set("account.autologin", false).write()
        alert('Error connecting to database')
    }
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
ipcMain.handle('sliderLogin', (_, ticket: string) => {
    bot.sliderLogin(ticket)
})
ipcMain.handle('getAllRooms', async () => {
    return await storage.getAllRooms()
})
