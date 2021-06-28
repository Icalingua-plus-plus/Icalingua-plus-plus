import {BrowserWindow, ipcMain, ipcRenderer} from 'electron'
import {Client, createClient, MessageEventData, Ret} from "oicq";
import path from "path";
import fs from 'fs'
import MongoStorageProvider from "../storageProviders/MongoStorageProvider";
import RedisStorageProvider from "../storageProviders/RedisStorageProvider";
// import IndexedStorageProvider from "../storageProviders/IndexedStorageProvider";
import StorageProvider from "../../types/StorageProvider";
import {loadMainWindow, sendToLoginWindow} from "../utils/windowManager";
import {createTray} from "../utils/trayManager";
import ui from '../utils/ui'
import formatDate from "../utils/formatDate";
import Message from "../../types/Message";

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
            bot.login(loginForm.password)
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
ipcMain.handle('sendMessage', async (_, {content, roomId, file, replyMessage, room, b64img, imgpath}) => {
    if (file && file.type && !file.type.includes('image')) {
        //群文件
        if (roomId > 0) {
            ui.messageError('暂时无法向好友发送文件')
            return
        }
        const gfs = bot.acquireGfs(-roomId)
        gfs.upload(file.path).then(ui.closeLoading)
        ui.message('文件上传中')
        return
    }

    const message: Message = {
        _id: "",
        senderId: bot.uin,
        username: "You",
        content,
        timestamp: formatDate("hh:mm"),
        date: formatDate("dd/MM/yyyy")
    }

    const chain = [];

    if (replyMessage) {
        message.replyMessage = {
            _id: replyMessage._id,
            username: replyMessage.username,
            content: replyMessage.content,
        };
        if (replyMessage.file) {
            message.replyMessage.file = replyMessage.file;
        }

        chain.push({
            type: "reply",
            data: {
                id: replyMessage._id,
            },
        });
    }
    if (content)
        chain.push({
            type: "text",
            data: {
                text: content,
            },
        });
    if (b64img) {
        chain.push({
            type: "image",
            data: {
                file: "base64://" + b64img.replace(/^data:.+;base64,/, ""),
            },
        });
        message.file = {
            type: "image/jpeg",
            url: b64img,
        };
    }
    if (imgpath) {
        chain.push({
            type: "image",
            data: {
                file: imgpath,
            },
        });
        message.file = {
            type: "image/jpeg",
            url: imgpath.replace(/\\/g, "/"),
        };
    }
    if (file) {
        chain.push({
            type: "image",
            data: {
                file: file.path,
            },
        });
        message.file = {
            url: file.path,
            size: file.size,
            type: file.type,
        };
    }
    //发送消息链
    let data: Ret<{ message_id: string }>
    if (roomId > 0) data = await bot.sendPrivateMsg(roomId, chain, true);
    else data = await bot.sendGroupMsg(-roomId, chain, true);

    ui.closeLoading()
    if (data.error) {
        ui.notifyError({
            title: "Failed to send",
            message: data.error.message,
        });
        return;
    }
    if (roomId > 0) {
        console.log(data);
        room.lastMessage = {
            content,
            timestamp: formatDate('hh:mm'),
        };
        if (file || b64img || imgpath) room.lastMessage.content += "[Image]";
        message._id = data.data.message_id;
        room.utime = new Date().getTime();
        message.time = new Date().getTime();
        ui.updateRoom(room)
        ui.addMessage(room.roomId, message)
        storage.addMessage(roomId, message)
        storage.updateRoom(room.roomId, {
            utime: room.utime,
            lastMessage: room.lastMessage
        })
    }
})
ipcMain.handle('isOnline', () => bot.getStatus().data.online)
ipcMain.handle('getNick', () => bot.nickname)
ipcMain.handle('fetchMessage', (_, {roomId, offset}: { roomId: number, offset: number }) => {
    if(!offset){
        storage.updateRoom(roomId, {
            unreadCount:0,
            at: false
        })
        if (roomId < 0) {
            const gid = -roomId
            const group = bot.gl.get(gid)
            if (group)
                ui.setShutUp(!!group.shutup_time_me)
            else {
                ui.setShutUp(true)
                ui.message('你已经不是群成员了')
            }
        }
        else {
            ui.setShutUp(false)
        }
    }
    return storage.fetchMessages(roomId, offset, 20)
})

