import {BrowserWindow, ipcMain, ipcRenderer} from 'electron'
import {Client, createClient, MessageEventData} from "oicq";
import path from "path";
import fs from 'fs'
import MongoStorageProvider from "../storageProviders/MongoStorageProvider";
import RedisStorageProvider from "../storageProviders/RedisStorageProvider";
// import IndexedStorageProvider from "../storageProviders/IndexedStorageProvider";
import StorageProvider from "../../types/StorageProvider";
import {loadMainWindow, sendToLoginWindow} from "../utils/windowManager";
import {createTray} from "../utils/trayManager";

type LoginForm = {
    username: string
    password: string
    protocol: number
    autologin: boolean
    onlineStatus: number
}
type StorageConfig = {
    storageType: string,
    mdbConnStr: string,
    rdsHost: string
}

let bot: Client
let storage: StorageProvider
let storageConfig: StorageConfig
let loginForm: LoginForm

//region event handlers
const eventHandlers = {
    onQQMessage(data: MessageEventData) {

    },
    friendRecall() {

    },
    groupRecall() {

    },
    online() {

    },
    onOffline() {

    },
    friendPoke() {

    },
    groupPoke() {

    },
}
const loginHandlers = {
    slider(data) {
        console.log(data);
        const veriWin = new BrowserWindow({
            height: 500,
            width: 500,
            webPreferences: {
                nativeWindowOpen: true,
                nodeIntegration: true,
                enableRemoteModule: true,
                contextIsolation: false
            },
        });
        const inject = fs.readFileSync(
            path.join(global.STATIC, "/sliderinj.js"),
            "utf-8"
        );
        console.log(inject);
        veriWin.webContents.on("did-finish-load", function () {
            veriWin.webContents.executeJavaScript(inject);
        });
        veriWin.loadURL(data.url, {
            userAgent:
                "Mozilla/5.0 (Linux; Android 7.1.1; MIUI ONEPLUS/A5000_23_17; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/77.0.3865.120 MQQBrowser/6.2 TBS/045426 Mobile Safari/537.36 V1_AND_SQ_8.3.9_0_TIM_D QQ/3.1.1.2900 NetType/WIFI WebP/0.3.0 Pixel/720 StatusBarHeight/36 SimpleUISwitch/0 QQTheme/1015712",
        });
    },
    onErr(data) {
        console.log(data);
        sendToLoginWindow('error', data.message)
    },
    onSucceed() {
        //save account info
        global.glodb.set("account", {
            username: Number(loginForm.username),
            password: loginForm.password,
            protocol: Number(loginForm.protocol),
            autologin: loginForm.autologin,
            onlineStatus: loginForm.onlineStatus
        })
            .write();
        if (loginForm.onlineStatus) {
            bot.setOnlineStatus(loginForm.onlineStatus);
        }
        loadMainWindow()
        createTray()
        attachEventHandler()
        initStorage()
    },
    verify(data) {
        const veriWin = new BrowserWindow({
            height: 500,
            width: 500,
            webPreferences: {
                nativeWindowOpen: true,
            },
        });
        veriWin.on("close", () => {
            this.onSubmit("loginForm");
        });
        veriWin.webContents.on("did-finish-load", function () {
            veriWin.webContents.executeJavaScript(
                "mqq.invoke=function(a, b, c){if(b=='closeWebViews'){window.close();}}"
            );
        });
        veriWin.loadURL(data.url.replace("safe/verify", "safe/qrcode"));
    }
}
//endregion
//region utility functions
const initStorage = async () => {
    //todo: use settings manager
    try {
        if (storageConfig.storageType === 'mdb')
            storage = new MongoStorageProvider(storageConfig.mdbConnStr, loginForm.username)
            // else if (extra.storageType === 'idb')
        //     storage = new IndexedStorageProvider(form.username)
        else if (storageConfig.storageType === 'redis')
            storage = new RedisStorageProvider(storageConfig.rdsHost, loginForm.username)

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


    } catch (err) {
        console.log(err);
        global.glodb.set("account.autologin", false).write()
        alert('Error connecting to database')
    }
}
const attachEventHandler = () => {
    bot.on("message", eventHandlers.onQQMessage);
    bot.on("notice.friend.recall", eventHandlers.friendRecall);
    bot.on("notice.group.recall", eventHandlers.groupRecall);
    bot.on("system.online", eventHandlers.online);
    bot.on("system.offline", eventHandlers.onOffline);
    bot.on("notice.friend.poke", eventHandlers.friendPoke);
    bot.on("notice.group.poke", eventHandlers.groupPoke);
}
const attachLoginHandler = () => {
    bot.on("system.login.slider", loginHandlers.slider);
    bot.on("system.login.error", loginHandlers.onErr);
    bot.on("system.online", loginHandlers.onSucceed);
    bot.on("system.login.device", loginHandlers.verify);
}
//endregion

ipcMain.handle('createBot', async (event, form: LoginForm, extra: StorageConfig) => {
    bot = global.bot = createClient(Number(form.username), {
        platform: Number(form.protocol),
        data_dir: path.join(global.STORE_PATH, "/data"),
        ignore_self: false,
        brief: true,
        log_level: process.env.NODE_ENV === "development" ? 'mark' : 'off'
    });
    bot.setMaxListeners(233);
    storageConfig = extra
    loginForm = form
    attachLoginHandler()
    bot.login(form.password)
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
ipcMain.handle('botLogin', (_, password: string) => {
    bot.login(password)
})
