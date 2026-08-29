import Adapter, { CookiesDomain } from '@icalingua/types/Adapter'
import SQLStorageProvider from '@icalingua/storage-providers/SQLStorageProvider'
import BridgeVersionInfo from '@icalingua/types/BridgeVersionInfo'
import DatabaseUpgradeProgress from '@icalingua/types/DatabaseUpgradeProgress'
import IgnoreChatInfo from '@icalingua/types/IgnoreChatInfo'
import LoginForm from '@icalingua/types/LoginForm'
import Message from '@icalingua/types/Message'
import MessagePageOptions from '@icalingua/types/MessagePage'
import OnlineData from '@icalingua/types/OnlineData'
import RoamingStamp from '@icalingua/types/RoamingStamp'
import Room from '@icalingua/types/Room'
import SearchableFriend from '@icalingua/types/SearchableFriend'
import SendMessageParams from '@icalingua/types/SendMessageParams'
import axios from 'axios'
import { app, dialog, Notification as ElectronNotification } from 'electron'
import { fileTypeFromBuffer } from 'file-type'
import { Notification } from 'freedesktop-notifications'
import fs from 'fs'
import { sign } from '@noble/ed25519'
import { DeviceEventData, FakeMessage, FileElem, FriendInfo, GroupInfo, MemberInfo } from 'oicq-icalingua-plus-plus'
import path from 'path'
import { io, Socket } from 'socket.io-client'
import formatDate from '../../utils/formatDate'
import getAvatarUrl from '../../utils/getAvatarUrl'
import getStaticPath from '../../utils/getStaticPath'
import { newIcalinguaWindow } from '../../utils/IcalinguaWindow'
import { updateAppMenu } from '../ipc/menuManager'
import avatarCache from '../utils/avatarCache'
import { getConfig } from '../utils/configManager'
import errorHandler from '../utils/errorHandler'
import getBuildInfo from '../utils/getBuildInfo'
import isInlineReplySupported from '../utils/isInlineReplySupported'
import { createTray, requestTrayIconUpdate, updateTrayIcon } from '../utils/trayManager'
import ui from '../utils/ui'
import { checkUpdate, getCachedUpdate } from '../utils/updateChecker'
import {
    getLoginWindow,
    getMainWindow,
    isAppLocked,
    loadMainWindow,
    sendDatabaseUpgradeProgress,
    sendToLoginWindow,
    showLoginWindow,
    tryToShowAllWindows,
} from '../utils/windowManager'
import { updateNoctaliaRoom, updateNoctaliaOnlineData, updateNoctaliaRooms } from '../utils/noctaliaServer'
import ChatGroup from '@icalingua/types/ChatGroup'
import SpecialFeature from '@icalingua/types/SpecialFeature'
import removeGroupNameEmotes from '../../utils/removeGroupNameEmotes'
import { spacingNotification } from '../../utils/panguSpacing'
import crypto from 'crypto'
import si from 'systeminformation'

// 这是所对应服务端协议的版本号，如果协议有变动比如说调整了 API 才会更改。
// 如果只是功能上的变动的话就不会改这个版本号，混用协议版本相同的服务端完全没有问题
const EXCEPTED_PROTOCOL_VERSION = '2.26.3'

let socket: Socket
let uin = 0
let bkn = 0
let nickname = ''
let currentLoadedMessagesCount = 0
let cachedOnlineData: OnlineData & { serverInfo: string }
let versionInfo: BridgeVersionInfo
let rooms: Room[] = []
let chatGroups: ChatGroup[] = []
let loggedIn = false
let account: LoginForm
let disabledFeatures: SpecialFeature[]
let localStorage: SQLStorageProvider
let localStorageUin = 0
let localStorageInit: Promise<SQLStorageProvider | null>
let localStorageWriteQueue = Promise.resolve()
let localStorageClosePromise: Promise<void>
let remoteMessageSearchIndexReady = false
const FETCH_MESSAGES_BY_SENDER_TIMEOUT = 30_000

const ensureLocalStorage = (accountUin = uin): Promise<SQLStorageProvider | null> => {
    if (!getConfig().bridgeLocalDatabaseSync || !accountUin) return Promise.resolve(null)
    if (localStorage && localStorageUin === accountUin) return Promise.resolve(localStorage)
    if (localStorageInit && localStorageUin === accountUin) return localStorageInit

    localStorageUin = accountUin
    localStorageInit = (async () => {
        if (localStorage) await localStorage.close()
        const storage = new SQLStorageProvider(
            `${accountUin}`,
            'sqlite3',
            {
                dataPath: path.join(app.getPath('userData'), 'data'),
            },
            errorHandler,
        )
        storage.onUpgradeProgress = (progress) => sendDatabaseUpgradeProgress(progress)
        await storage.connect()
        localStorage = storage
        console.log(`Bridge 本地数据库同步已启用：${accountUin}`)
        return storage
    })().catch((error) => {
        localStorage = null
        localStorageInit = null
        localStorageUin = 0
        errorHandler(error, true)
        ui.messageError('Bridge 本地数据库初始化失败')
        return null
    })
    return localStorageInit
}

const queueLocalStorageWrite = (write: (storage: SQLStorageProvider) => Promise<any> | any) => {
    if (!getConfig().bridgeLocalDatabaseSync || !uin) return
    const accountUin = uin
    localStorageWriteQueue = localStorageWriteQueue
        .then(async () => {
            if (!getConfig().bridgeLocalDatabaseSync || accountUin !== uin) return
            const storage = await ensureLocalStorage(accountUin)
            if (storage) await write(storage)
        })
        .catch((error) => errorHandler(error, true))
}

const upsertLocalRoom = async (storage: SQLStorageProvider, room: Room) => {
    if (await storage.getRoom(room.roomId)) await storage.updateRoom(room.roomId, room)
    else await storage.addRoom(room)
}

const upsertLocalChatGroup = async (storage: SQLStorageProvider, chatGroup: ChatGroup) => {
    const existing = (await storage.getAllChatGroups()).some(({ name }) => name === chatGroup.name)
    if (existing) await storage.updateChatGroup(chatGroup.name, chatGroup)
    else await storage.addChatGroup(chatGroup)
}

const persistLocalMessages = async (storage: SQLStorageProvider, roomId: number, messages: Message[] = []) => {
    const messagesByRoom = new Map<number, Message[]>()
    for (const message of messages) {
        const messageRoomId = (message as Message & { roomId?: number }).roomId ?? roomId
        // “所有群”搜索结果只有携带原始 roomId 时才能安全写入，避免把消息错误归入 room 0。
        if (!messageRoomId) continue
        if (!messagesByRoom.has(messageRoomId)) messagesByRoom.set(messageRoomId, [])
        messagesByRoom.get(messageRoomId).push(message)
    }
    await Promise.all(
        Array.from(messagesByRoom.entries()).map(([messageRoomId, roomMessages]) =>
            storage.addMessages(messageRoomId, roomMessages),
        ),
    )
}

const persistLocalMessageUpdate = async (
    storage: SQLStorageProvider,
    roomId: number,
    messageId: string | number,
    message: Partial<Message>,
) => {
    const existing = await storage.getMessage(roomId, String(messageId))
    if (existing) {
        await storage.replaceMessage(roomId, messageId, {
            ...existing,
            ...message,
            _id: messageId,
        })
    } else if (message._id !== undefined && message.files) {
        await storage.addMessage(roomId, message as Message)
    }
}

const closeLocalStorage = () => {
    if (localStorageClosePromise) return localStorageClosePromise
    localStorageClosePromise = (async () => {
        await localStorageWriteQueue
        const storage = localStorage || (localStorageInit && (await localStorageInit))
        if (storage) await storage.close()
        localStorage = null
        localStorageInit = null
        localStorageUin = 0
    })()
    return localStorageClosePromise
}

const attachSocketEvents = () => {
    socket.off('connect_error')
    socket.on('connect_error', (e) => {
        ui.setOffline(`与服务器连接断开：${e.message}`)
    })
    socket.on('connect', () => ui.setOnline())
    socket.on('disconnect', () => {
        remoteMessageSearchIndexReady = false
        sendDatabaseUpgradeProgress({ active: false, step: 0, total: 0, message: '' }, 'bridge')
        void updateAppMenu()
    })
    socket.on('dbUpgradeProgress', (progress: DatabaseUpgradeProgress) => {
        remoteMessageSearchIndexReady = !progress.active
        sendDatabaseUpgradeProgress(progress, 'bridge')
        if (!progress.active) void updateAppMenu()
    })
    socket.on('updateRoom', (room: Room) => {
        if (room.roomId === ui.getSelectedRoomId() && getMainWindow().isFocused() && getMainWindow().isVisible()) {
            //把它点掉
            room.unreadCount = 0
            room.at = false
            room.atMessageId = null
            adapter.clearRoomUnread(room.roomId)
        }
        ui.updateRoom(room)
        try {
            Object.assign(
                rooms.find((e) => e.roomId === room.roomId),
                room,
            )
        } catch (e) {
            errorHandler(e, true)
        }
        queueLocalStorageWrite((storage) => upsertLocalRoom(storage, room))
        requestTrayIconUpdate()
        updateNoctaliaRoom(room)
    })
    socket.on('addMessage', ({ roomId, message }: { roomId: number; message: Message }) => {
        ui.addMessage(roomId, message)
        queueLocalStorageWrite((storage) => storage.addMessage(roomId, message))
        if (
            typeof message._id === 'string' &&
            roomId === ui.getSelectedRoomId() &&
            getMainWindow().isFocused() &&
            getMainWindow().isVisible()
        )
            adapter.reportRead(message._id)
    })
    socket.on('deleteMessage', (messageId: string | number) => {
        ui.deleteMessage(messageId)
        queueLocalStorageWrite((storage) =>
            storage.updateMessage(0, messageId, {
                deleted: true,
                reveal: false,
            }),
        )
    })
    socket.on('setOnline', ui.setOnline)
    socket.on('setOffline', ui.setOffline)
    socket.on(
        'onlineData',
        async (data: { online: boolean; nick: string; uin: number; sysInfo: string; bkn: number }) => {
            uin = data.uin
            bkn = data.bkn
            nickname = data.nick
            if (getConfig().bridgeLocalDatabaseSync) ensureLocalStorage(data.uin)
            if (!loggedIn) {
                loggedIn = true
                await loadMainWindow()
                await createTray()
            }
            if (getLoginWindow()) getLoginWindow().close()
            cachedOnlineData = {
                ...data,
                priority: getConfig().priority,
                serverInfo: data.sysInfo,
                updateCheck: getConfig().updateCheck,
            }
            adapter.sendOnlineData()
            updateNoctaliaOnlineData(data.uin, data.nick)
            await updateTrayIcon(true)
            await updateAppMenu()
        },
    )
    socket.on('setShutUp', ui.setShutUp)
    socket.on('message', ui.message)
    socket.on('messageError', ui.messageError)
    socket.on('messageSuccess', ui.messageSuccess)
    socket.on('addMessageText', ui.addMessageText)
    socket.on('notifyMessage', ui.notify)
    socket.on('setAllRooms', (serverRooms: Room[] = []) => {
        rooms = serverRooms
        ui.setAllRooms(rooms)
        updateNoctaliaRooms(rooms)
        queueLocalStorageWrite(async (storage) => {
            const localRoomIds = new Set((await storage.getAllRooms()).map(({ roomId }) => roomId))
            await Promise.all(
                serverRooms.map((room) =>
                    localRoomIds.has(room.roomId) ? storage.updateRoom(room.roomId, room) : storage.addRoom(room),
                ),
            )
        })
    })
    socket.on('setAllChatGroups', (serverChatGroups: ChatGroup[] = []) => {
        chatGroups = serverChatGroups
        ui.setAllChatGroups(chatGroups)
        queueLocalStorageWrite(async (storage) => {
            const localChatGroupNames = new Set((await storage.getAllChatGroups()).map(({ name }) => name))
            await Promise.all(
                serverChatGroups.map((chatGroup) =>
                    localChatGroupNames.has(chatGroup.name)
                        ? storage.updateChatGroup(chatGroup.name, chatGroup)
                        : storage.addChatGroup(chatGroup),
                ),
            )
        })
    })
    socket.on('closeLoading', ui.closeLoading)
    socket.on('notifyError', ui.notifyError)
    socket.on(
        'renewMessage',
        ({ roomId, messageId, message }: { roomId: number; messageId: string; message: Partial<Message> }) => {
            ui.renewMessage(roomId, messageId, message)
            queueLocalStorageWrite((storage) => persistLocalMessageUpdate(storage, roomId, messageId, message))
        },
    )
    socket.on('renewMessageURL', ({ messageId, URL }: { messageId: string | number; URL: string }) => {
        ui.renewMessageURL(messageId, URL)
    })
    socket.on('syncRead', (roomId: number) => {
        ui.clearRoomUnread(roomId)
        queueLocalStorageWrite((storage) =>
            storage.updateRoom(roomId, { unreadCount: 0, at: false, atMessageId: null }),
        )
    })
    socket.on('setMessages', ({ roomId, messages }: { roomId: number; messages: Message[] }) => {
        if (roomId === ui.getSelectedRoomId()) ui.setMessages(messages)
        queueLocalStorageWrite((storage) => persistLocalMessages(storage, roomId, messages))
    })
    let notif: ElectronNotification
    let isSteamVrRunning = false
    setInterval(async () => {
        const processes = await si.processes()
        isSteamVrRunning = processes.list.some((e) => e.name.toLowerCase() === 'vrserver.exe')
    }, 60 * 1000)
    socket.on(
        'notify',
        async (data: {
            priority: 1 | 2 | 3 | 4 | 5
            roomId: number
            at: string | boolean
            data: { title: string; body: string; hasReply: boolean; replyPlaceholder: string }
            isSelfMsg: boolean
            image?: string
        }) => {
            if (
                !isAppLocked() &&
                (!getMainWindow().isFocused() ||
                    !getMainWindow().isVisible() ||
                    data.roomId !== ui.getSelectedRoomId() ||
                    isSteamVrRunning) &&
                (data.priority >= getConfig().priority || data.at === true || (data.at && !getConfig().disableAtAll)) &&
                !data.isSelfMsg &&
                !getConfig().disableNotification
            ) {
                if (data.data.body === '[窗口抖动]') {
                    tryToShowAllWindows()
                    ui.chroom(data.roomId)
                }
                // notification
                const notifRoomName =
                    data.roomId < 0 && getConfig().removeGroupNameEmotes
                        ? removeGroupNameEmotes(data.data.title)
                        : data.data.title
                if (getConfig().usePanguJsRecv) {
                    const index = data.data.body.indexOf(': ')
                    if (index == -1) {
                        data.data.body = spacingNotification(data.data.body)
                    } else {
                        const username = data.data.body.slice(0, index)
                        const content = data.data.body.slice(index + 2)
                        data.data.body = username + ': ' + spacingNotification(content)
                    }
                }
                if (process.platform === 'darwin') {
                    if (!ElectronNotification.isSupported()) return
                    if (notif) {
                        notif.close()
                    }
                    notif = new ElectronNotification({
                        title: notifRoomName,
                        body: data.data.body,
                        hasReply: data.data.hasReply,
                        replyPlaceholder: data.data.replyPlaceholder,
                        icon: await avatarCache(getAvatarUrl(data.roomId, true)),
                        actions: [
                            {
                                text: '标为已读',
                                type: 'button',
                            },
                        ],
                    })
                    notif.on('click', () => {
                        notif.close()
                        tryToShowAllWindows()
                        ui.chroom(data.roomId)
                    })
                    notif.on('action', () => adapter.clearRoomUnread(data.roomId))
                    notif.on('reply', (e, r) => {
                        adapter.clearRoomUnread(data.roomId)
                        adapter.sendMessage({
                            content: r,
                            roomId: data.roomId,
                            at: [],
                        })
                    })
                    notif.show()
                } else if (process.platform === 'win32') {
                    if (!ElectronNotification.isSupported()) return
                    if (notif) {
                        notif.close()
                    }
                    const { showWinToast } = await import('../utils/winToast')
                    notif = showWinToast({
                        title: notifRoomName,
                        body: data.data.body,
                        icon: await avatarCache(getAvatarUrl(data.roomId, true)),
                        image: data.image ? await avatarCache(data.image) : undefined,
                        roomId: data.roomId,
                        hasReply: data.data.hasReply,
                        replyPlaceholder: data.data.replyPlaceholder,
                    })
                } else {
                    const actions = {
                        default: '',
                        read: '标为已读',
                    }
                    if (await isInlineReplySupported()) actions['inline-reply'] = '回复...'

                    const notifParams = {
                        ...data.data,
                        summary: notifRoomName,
                        appName: 'Icalingua++',
                        category: 'im.received',
                        'desktop-entry': 'icalingua',
                        urgency: 1,
                        timeout: 5000,
                        icon: await avatarCache(getAvatarUrl(data.roomId, true)),
                        'x-kde-reply-placeholder-text': '发送到 ' + notifRoomName,
                        'x-kde-reply-submit-button-text': '发送',
                        actions,
                    }
                    if (data.image) notifParams['x-kde-urls'] = await avatarCache(data.image)
                    const notif = new Notification(notifParams)
                    notif.on('action', (action: string) => {
                        switch (action) {
                            case 'default':
                                tryToShowAllWindows()
                                ui.chroom(data.roomId)
                                break
                            case 'read':
                                adapter.clearRoomUnread(data.roomId)
                                break
                        }
                    })
                    notif.on('reply', (r: string) => {
                        adapter.clearRoomUnread(data.roomId)
                        adapter.sendMessage({
                            content: r,
                            roomId: data.roomId,
                            at: [],
                        })
                    })
                    notif.push()
                }
            }
        },
    )
    socket.on('requestSetup', async (data: LoginForm) => {
        console.log('bridge 未登录')
        account = data
        const disabledFeatures = await adapter.getDisabledFeatures()
        showLoginWindow(true, disabledFeatures.includes('IdLogin'))
    })
    socket.on('fatal', async (message: string) => {
        socket.off('connect_error')
        await dialog.showMessageBox(getMainWindow(), {
            title: '服务端错误',
            message,
            type: 'error',
        })
        app.quit()
    })
    socket.on('login-verify', async (url: string) => {
        const veriWin = newIcalinguaWindow({
            height: 500,
            width: 500,
            webPreferences: {},
        })
        veriWin.on('close', () => {
            socket.emit('login-verify-reLogin')
        })
        veriWin.webContents.on('did-finish-load', function () {
            veriWin.webContents.executeJavaScript(
                'console.log=(a)=>{' +
                    'if(typeof a === "string"&&' +
                    'a.includes("手Q扫码验证[新设备] - 验证成功页[兼容老版本] - 点击「前往登录QQ」"))' +
                    'window.close()}',
            )
        })
        veriWin.loadURL(url.replace('safe/verify', 'safe/qrcode'))
    })
    socket.on('login-qrcodeLogin', (url: string) => {
        sendToLoginWindow('qrcodeLogin', url)
    })
    socket.on('login-smsCodeVerify', (data: DeviceEventData) => {
        showLoginWindow(true)
        sendToLoginWindow('smsCodeVerify', JSON.stringify(data))
    })
    socket.on('login-error', (message: string) => {
        showLoginWindow(true)
        sendToLoginWindow('error', message)
    })
    socket.on('login-slider', (url: string) => {
        const veriWin = newIcalinguaWindow({
            height: 500,
            width: 500,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
            },
        })
        const inject = fs.readFileSync(path.join(getStaticPath(), '/sliderinj.js'), 'utf-8')
        veriWin.webContents.on('did-finish-load', function () {
            veriWin.webContents.executeJavaScript(inject)
        })
        veriWin.loadURL(url, {
            userAgent:
                'Mozilla/5.0 (Linux; Android 7.1.1; MIUI ONEPLUS/A5000_23_17; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/98.0.4758.102 MQQBrowser/6.2 TBS/046403 Mobile Safari/537.36 V1_AND_SQ_8.9.50_3898_YYB_D QQ/8.9.50.10650 NetType/WIFI WebP/0.3.0 AppId/537155599 Pixel/720 StatusBarHeight/36 SimpleUISwitch/0 QQTheme/1000 StudyMode/0 CurrentMode/0 CurrentFontScale/1.0 GlobalDensityScale/1.0285714 AllowLandscape/false InMagicWin/0',
        })
    })
}

type BridgeUploadResponse = {
    allSuccess: boolean
    uploaded: number[]
}

const uploadFileToBridge = async (
    filePath: string,
    fileName = path.basename(filePath),
    onProgress?: (value: number) => void,
) => {
    const fileSize = fs.statSync(filePath).size
    const fileHash = await new Promise<string>((resolve, reject) => {
        const hash = crypto.createHash('sha256')
        const stream = fs.createReadStream(filePath)
        stream.on('data', (chunk) => hash.update(chunk))
        stream.on('end', () => resolve(hash.digest('hex')))
        stream.on('error', reject)
    })
    const chunkSize = 512 * 1024
    const totalChunks = Math.ceil(fileSize / chunkSize)
    const readChunk = (offset: number, length: number): Promise<Buffer> => {
        return new Promise((resolve, reject) => {
            const buffer = Buffer.alloc(length)
            fs.open(filePath, 'r', (err, fd) => {
                if (err) return reject(err)
                fs.read(fd, buffer, 0, length, offset, (err) => {
                    fs.close(fd, () => {})
                    if (err) return reject(err)
                    resolve(buffer)
                })
            })
        })
    }
    const requestUpload = (): Promise<BridgeUploadResponse> => {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('requestUpload 响应超时')), 30000)
            socket.emit('requestUpload', fileName, fileHash, fileSize, (result: BridgeUploadResponse) => {
                clearTimeout(timer)
                resolve(result)
            })
        })
    }
    const uploadChunk = (offset: number, chunk: Buffer, chunkHash: string): Promise<boolean> => {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('uploadFile 响应超时')), 60000)
            socket.emit('uploadFile', fileHash, offset, chunk, chunkHash, (result: boolean) => {
                clearTimeout(timer)
                resolve(result)
            })
        })
    }
    const response = await requestUpload()
    if (!response.allSuccess) {
        const uploadedOffsets = response.uploaded || []
        let uploadedChunks = uploadedOffsets.length
        if (totalChunks) onProgress?.((uploadedChunks / totalChunks) * 100)
        for (let i = 0; i < totalChunks; i++) {
            if (uploadedOffsets.includes(i * chunkSize)) continue
            const offset = i * chunkSize
            const length = Math.min(chunkSize, fileSize - offset)
            const chunk = await readChunk(offset, length)
            const chunkHash = crypto.createHash('sha256').update(chunk).digest('hex')
            let success = false
            let retry = 0
            while (!success && retry < 3) {
                success = await uploadChunk(offset, chunk, chunkHash)
                retry++
            }
            if (!success) throw new Error('文件上传 bridge 失败')
            uploadedChunks++
            onProgress?.(totalChunks ? (uploadedChunks / totalChunks) * 100 : 100)
        }
    }
    onProgress?.(100)
    return fileHash
}

export const uploadGroupFileToBridge = async (
    groupId: number,
    filePath: string,
    pid: string,
    fileName: string,
    onProgress?: (value: number) => void,
) => {
    const fileHash = await uploadFileToBridge(filePath, fileName, onProgress)
    return await new Promise<{ ok: boolean; error?: string }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('群文件上传响应超时')), 10 * 60 * 1000)
        socket.emit('uploadGroupFile', fileHash, groupId, pid, fileName, (result: { ok: boolean; error?: string }) => {
            clearTimeout(timer)
            if (!result?.ok) {
                reject(new Error(result?.error || '群文件上传失败'))
                return
            }
            resolve(result)
        })
    })
}

const adapter: Adapter = {
    isMessageSearchIndexReady: () =>
        (loggedIn && remoteMessageSearchIndexReady) || localStorage?.isMessageSearchIndexReady?.() === true,
    validateMessageSearchIndex: () => {
        if (loggedIn && remoteMessageSearchIndexReady) {
            remoteMessageSearchIndexReady = false
            return new Promise<void>((resolve, reject) => {
                socket.emit('validateMessageSearchIndex', (result?: { ok?: boolean; error?: string }) => {
                    if (result?.ok === false) {
                        reject(new Error(result.error || '消息搜索索引校验失败'))
                        return
                    }
                    resolve()
                })
            })
        }
        return localStorage?.validateMessageSearchIndex?.() || Promise.resolve()
    },
    getMsgNewURL(id: string): Promise<string> {
        return new Promise((resolve) => socket.emit('getMsgNewURL', id, resolve))
    },
    getNTPicURLbyFileid(fileId: string, appid: string): Promise<string> {
        return new Promise((resolve) => socket.emit('getNTPicURLbyFileid', fileId, appid, resolve))
    },
    getFriend(uin: number): Promise<FriendInfo> {
        return new Promise((resolve) => {
            socket.emit('getFriend', uin, resolve)
        })
    },
    getGroup(gin: number): Promise<GroupInfo> {
        return new Promise((resolve) => {
            socket.emit('getGroup', gin, resolve)
        })
    },
    requestGfsToken(gin: number): Promise<string> {
        return new Promise((resolve) => socket.emit('requestGfsToken', gin, resolve))
    },
    async getUnreadRooms(): Promise<Room[]> {
        return rooms.filter((e) => e.unreadCount && e.priority >= getConfig().priority)
    },
    setGroupKick(gin: number, uin: number): any {
        socket.emit('setGroupKick', gin, uin)
    },
    setGroupLeave(gin: number): any {
        socket.emit('setGroupLeave', gin)
    },
    setGroupBan(gin: number, uin: number, duration?: number): any {
        socket.emit('setGroupBan', gin, uin, duration)
    },
    setGroupAnonymousBan(gin: number, flag: string, duration?: number): any {
        socket.emit('setGroupAnonymousBan', gin, flag, duration)
    },
    setGroupRemark(gin: number, remark: string): any {
        socket.emit('setGroupRemark', gin, remark)
    },
    setFriendRemark(uin: number, remark: string): any {
        socket.emit('setFriendRemark', uin, remark)
    },
    makeForward(fakes: FakeMessage | Iterable<FakeMessage>, dm?: boolean, origin?: number, target?: number): any {
        socket.emit('makeForward', fakes, dm, origin, target)
    },
    reportRead(messageId: string): any {
        socket.emit('reportRead', messageId)
    },
    getGroupMembers(group: number): Promise<MemberInfo[]> {
        return new Promise((resolve) => socket.emit('getGroupMembers', group, resolve))
    },
    setGroupNick(group: number, nick: string): any {
        socket.emit('setGroupNick', group, nick)
    },
    getGroupMemberInfo(group: number, member: number, noCache = true): Promise<MemberInfo> {
        return new Promise((resolve) => socket.emit('getGroupMemberInfo', group, member, noCache, resolve))
    },
    _getGroupMemberInfo(group: number, member: number, noCache = true): Promise<MemberInfo> {
        return new Promise((resolve) => socket.emit('getGroupMemberInfo', group, member, noCache, resolve))
    },
    async sendOnlineData() {
        if (!cachedOnlineData) return
        let sysInfo = getBuildInfo()
        const updateInfo = getCachedUpdate()
        if (updateInfo && updateInfo.hasUpdate) {
            if (sysInfo) sysInfo += '\n\n'
            sysInfo += '新版本可用: ' + updateInfo.latestVersion
        }
        if (formatDate('MM-dd') === '11-20') {
            if (sysInfo) sysInfo += '\n\n'
            sysInfo += '11月20日是跨性别纪念日，纪念那些因暴力而不幸逝世的跨性别者们\n愿你也能被他人温柔以待'
        }
        if (sysInfo) sysInfo += '\n\n'
        sysInfo += cachedOnlineData.serverInfo
        cachedOnlineData.sysInfo = sysInfo
        const processes = await si.processes()
        ui.sendOnlineData({
            ...cachedOnlineData,
            isSteamVrRunning: processes.list.some((e) => e.name.toLowerCase() === 'vrserver.exe'),
        })
        ui.setAllRooms(rooms)
        ui.setAllChatGroups(chatGroups)
        if (!updateInfo) {
            checkUpdate().then(adapter.sendOnlineData)
        }
    },
    getIgnoredChats(): Promise<IgnoreChatInfo[]> {
        return new Promise((resolve) =>
            socket.emit('getIgnoredChats', (ignoredChats: IgnoreChatInfo[]) => {
                queueLocalStorageWrite(async (storage) => {
                    const localIgnoredChatIds = new Set((await storage.getIgnoredChats()).map(({ id }) => id))
                    await Promise.all(
                        ignoredChats
                            .filter(({ id }) => !localIgnoredChatIds.has(id))
                            .map((ignoredChat) => storage.addIgnoredChat(ignoredChat)),
                    )
                })
                resolve(ignoredChats)
            }),
        )
    },
    getFriendsFallback(): Promise<SearchableFriend[]> {
        return new Promise((resolve) => socket.emit('getFriendsFallback', resolve))
    },
    removeIgnoredChat(roomId: number): any {
        socket.emit('removeIgnoredChat', roomId)
        queueLocalStorageWrite((storage) => storage.removeIgnoredChat(roomId))
    },
    getCookies(domain: CookiesDomain): Promise<string> {
        return new Promise((resolve, reject) => {
            socket.emit('getCookies', domain, resolve)
        })
    },
    addRoom(room: Room) {
        rooms.unshift(room)
        socket.emit('addRoom', room)
        queueLocalStorageWrite((storage) => upsertLocalRoom(storage, room))
    },
    addChatGroup(chatGroup: ChatGroup) {
        chatGroups.unshift(chatGroup)
        socket.emit('addChatGroup', chatGroup)
        queueLocalStorageWrite((storage) => upsertLocalChatGroup(storage, chatGroup))
    },
    clearCurrentRoomUnread() {
        if (!ui.getSelectedRoomId()) return
        adapter.clearRoomUnread(ui.getSelectedRoomId())
    },
    clearRoomUnread(roomId: number) {
        if (!socket) return
        ui.clearRoomUnread(roomId)
        const room = rooms.find((e) => e.roomId === roomId)
        if (room) {
            room.unreadCount = 0
            room.at = false
            room.atMessageId = null
        }
        adapter.updateRoom(roomId, { unreadCount: 0, at: false, atMessageId: null })
        updateTrayIcon()
    },
    markRoomUnread(roomId: number) {
        if (!socket) return
        const room = rooms.find((e) => e.roomId === roomId)
        if (!room) return
        room.unreadCount = Math.max(room.unreadCount || 0, 1)
        room.at = false
        room.atMessageId = null
        ui.updateRoom(room)
        adapter.updateRoom(roomId, { unreadCount: room.unreadCount, at: false, atMessageId: null })
        updateTrayIcon()
    },
    markMessageUnread(roomId: number, messageId: string) {
        if (!socket) return
        socket.emit('markMessageUnread', roomId, messageId, (unreadCount: number) => {
            const count = Math.max(0, Math.trunc(Number(unreadCount) || 0))
            if (!count) return
            const room = rooms.find((e) => e.roomId === roomId)
            if (!room) return
            room.unreadCount = count
            room.at = false
            room.atMessageId = null
            ui.updateRoom(room)
            queueLocalStorageWrite((storage) =>
                storage.updateRoom(roomId, { unreadCount: count, at: false, atMessageId: null }),
            )
            updateTrayIcon()
        })
    },
    async createBot(form: LoginForm) {
        if (account) {
            //是登录远端
            socket.emit('login', form)
        } else {
            //是初始化程序
            socket = io(getConfig().server, {
                transports: ['websocket'],
            })
            socket.once('connect_error', async (e) => {
                errorHandler(e, true)
                await dialog.showMessageBox(getMainWindow(), {
                    title: '错误',
                    message: e && e.message ? e.message : '连接失败',
                    type: 'error',
                })
                app.quit()
            })
            socket.on('requireAuth', async (salt: string, version: BridgeVersionInfo) => {
                versionInfo = version
                if (version.protocolVersion !== EXCEPTED_PROTOCOL_VERSION && !getConfig().disableBridgeVersionCheck) {
                    const action = await dialog.showMessageBox(getMainWindow(), {
                        title: '提示',
                        message: `当前版本的 Icalingua++ 要求 Bridge 的协议版本为 ${EXCEPTED_PROTOCOL_VERSION}，而服务器的协议版本为 ${version.protocolVersion}`,
                        buttons: ['继续', '退出'],
                        defaultId: 1,
                    })
                    if (action.response === 1) {
                        app.quit()
                        return
                    }
                }
                socket.emit('auth', await sign(salt, getConfig().privateKey))
                console.log('已向服务端提交身份验证')
            })
            socket.once('authSucceed', attachSocketEvents)
            socket.once('authFailed', async () => {
                await dialog.showMessageBox(getMainWindow(), {
                    title: '错误',
                    message: '认证失败',
                    type: 'error',
                })
                app.quit()
            })
        }
    },
    randomDevice(username: number) {
        socket.emit('randomDevice', username)
    },
    submitSmsCode(smsCode: string) {
        socket.emit('submitSmsCode', smsCode)
    },
    deleteMessage(roomId: number, messageId: string) {
        socket.emit('deleteMessage', roomId, messageId)
        queueLocalStorageWrite((storage) =>
            storage.updateMessage(roomId, messageId, {
                deleted: true,
                reveal: false,
            }),
        )
    },
    hideMessage(roomId: number, messageId: string) {
        ui.hideMessage(messageId, roomId)
        socket.emit('hideMessage', roomId, messageId)
        queueLocalStorageWrite((storage) =>
            storage.updateMessage(roomId, messageId, {
                hide: true,
                reveal: false,
            }),
        )
    },
    fetchHistory(messageId: string, roomId?: number) {
        if (!roomId) roomId = ui.getSelectedRoomId()
        socket.emit('fetchHistory', messageId, roomId, currentLoadedMessagesCount)
    },
    stopFetchingHistory() {
        socket.emit('stopFetchingHistory')
    },
    fetch7DaysHistory() {
        socket.emit('fetch7DaysHistory')
    },
    fetchMessages(roomId: number, options: MessagePageOptions): Promise<Message[]> {
        const initialPage = !options?.before && !options?.after
        if (initialPage) adapter.clearCurrentRoomUnread()
        updateTrayIcon()
        return new Promise((resolve, reject) => {
            socket.emit('fetchMessages', roomId, options || {}, (messages: Message[]) => {
                if (initialPage) currentLoadedMessagesCount = messages.length
                else if (options?.before) currentLoadedMessagesCount += messages.length
                queueLocalStorageWrite((storage) => persistLocalMessages(storage, roomId, messages))
                resolve(messages)
            })
        })
    },
    fetchImageMessages(roomId: number, offset: number, endTime?: number): Promise<Message[]> {
        return new Promise((resolve, reject) => {
            socket.emit('fetchImageMessages', roomId, offset, endTime, (messages: Message[]) => {
                queueLocalStorageWrite((storage) => persistLocalMessages(storage, roomId, messages))
                resolve(messages)
            })
        })
    },
    fetchMessagesAround(roomId: number, messageId: string, before: number, after: number): Promise<Message[]> {
        return new Promise((resolve, reject) => {
            socket.emit('fetchMessagesAround', roomId, messageId, before, after, (messages: Message[]) => {
                queueLocalStorageWrite((storage) => persistLocalMessages(storage, roomId, messages))
                resolve(messages)
            })
        })
    },
    resolveUnreadTargetMessageId(roomId: number, unreadCount: number): Promise<string | null> {
        return new Promise((resolve) => {
            socket.emit('resolveUnreadTargetMessageId', roomId, unreadCount, resolve)
        })
    },
    fetchMessagesBySender(roomId: number, senderId: number, offset: number): Promise<Message[]> {
        return new Promise((resolve, reject) => {
            let settled = false
            const timer = setTimeout(() => {
                settled = true
                reject(new Error('fetchMessagesBySender 响应超时'))
            }, FETCH_MESSAGES_BY_SENDER_TIMEOUT)
            socket.emit('fetchMessagesBySender', roomId, senderId, offset, (messages: Message[]) => {
                if (settled) return
                settled = true
                clearTimeout(timer)
                queueLocalStorageWrite((storage) => persistLocalMessages(storage, roomId, messages))
                resolve(messages)
            })
        })
    },
    searchMessages(
        roomId: number,
        keyword: string,
        offset: number,
        senderId?: number,
        startTime?: number,
        endTime?: number,
    ): Promise<Message[]> {
        return new Promise((resolve, reject) => {
            const handleMessages = (messages: Message[]) => {
                queueLocalStorageWrite((storage) => persistLocalMessages(storage, roomId, messages))
                resolve(messages)
            }
            socket.emit('searchMessages', roomId, keyword, offset, senderId, startTime, endTime, handleMessages)
        })
    },
    getFirstUnreadRoom(): Promise<Room> {
        return new Promise((resolve, reject) => {
            socket.emit('getFirstUnreadRoom', getConfig().priority, resolve)
        })
    },
    getForwardMsg(resId: string, fileName?: string) {
        return new Promise((resolve, reject) => {
            socket.emit('getForwardMsg', resId, fileName, resolve)
        })
    },
    getGroups() {
        return new Promise((resolve, reject) => {
            socket.emit('getGroups', resolve)
        })
    },
    getGroupFileMeta(gin: number, fid: string): Promise<FileElem['data']> {
        return new Promise((resolve, reject) => {
            socket.emit('getGroupFileMeta', gin, fid, resolve)
        })
    },
    async getRoom(roomId: number): Promise<Room> {
        return rooms.find((e) => e.roomId === roomId)
    },
    getSelectedRoom(): Promise<Room> {
        return adapter.getRoom(ui.getSelectedRoomId())
    },
    getBkn: () => bkn,
    getUin: () => uin,
    getNickname: () => nickname,
    getAccount: () => account,
    async getUnreadCount(): Promise<number> {
        return rooms.filter((e) => e.unreadCount && e.priority >= getConfig().priority).length
    },
    ignoreChat(data: IgnoreChatInfo) {
        socket.emit('ignoreChat', data)
        queueLocalStorageWrite(async (storage) => {
            if (!(await storage.isChatIgnored(data.id))) await storage.addIgnoredChat(data)
            await storage.removeRoom(data.id)
        })
    },
    logOut() {
        socket?.disconnect()
        return closeLocalStorage()
    },
    pinRoom(roomId: number, pin: boolean) {
        socket.emit('pinRoom', roomId, pin)
        queueLocalStorageWrite((storage) => storage.updateRoom(roomId, { index: pin ? 1 : 0 }))
    },
    reLogin(): void {
        if (socket.disconnected) socket.connect()
        else socket.emit('reLogin')
    },
    removeChat(roomId: number) {
        socket.emit('removeChat', roomId)
        queueLocalStorageWrite((storage) => storage.removeRoom(roomId))
        ui.chroom(0)
    },
    removeChatGroup(name: string) {
        socket.emit('removeChatGroup', name)
        queueLocalStorageWrite((storage) => storage.removeChatGroup(name))
    },
    revealMessage(roomId: number, messageId: string | number) {
        ui.revealMessage(messageId, roomId)
        socket.emit('revealMessage', roomId, messageId)
        queueLocalStorageWrite((storage) =>
            storage.updateMessage(roomId, messageId, {
                hide: false,
                reveal: true,
            }),
        )
    },
    renewMessage(roomId: number, messageId: string, message: Message) {
        socket.emit('renewMessage', roomId, messageId, message)
    },
    renewMessageURL(roomId: number, messageId: string | number, URL: string) {
        socket.emit('renewMessageURL', roomId, messageId, URL)
    },
    sendGroupPoke(gin: number, uin: number) {
        socket.emit('sendGroupPoke', gin, uin)
    },
    sendGroupSign(gin: number) {
        socket.emit('sendGroupSign', gin)
    },
    sendButtonCallback(groupId: number, msgSeq: number, appid: number, id: string, data: string): any {
        socket.emit('sendButtonCallback', groupId, msgSeq, appid, id, data)
    },
    async sendMessage(data: SendMessageParams) {
        if (!data.roomId && !data.room) data.roomId = ui.getSelectedRoomId()
        // 将本地路径转为 base64
        if (data.media && data.media.length) {
            for (const img of data.media) {
                // 收到的语音使用协议资源 fid 直接 +1，不要尝试读取本地解码缓存文件。
                if (img.type?.startsWith('audio/') && img.fid) continue
                if (img.url && !img.b64 && !/^https?:\/\//.test(img.url)) {
                    const fileContent = fs.readFileSync(img.url)
                    const type = await fileTypeFromBuffer(fileContent)
                    img.b64 = 'data:' + type.mime + ';base64,' + fileContent.toString('base64')
                    img.url = null
                }
            }
        }
        if (data.file && data.file.type.startsWith('audio/')) {
            socket.emit('requestToken', (token: string) =>
                axios
                    .post(getConfig().server + `/api/${token}/sendMessage`, data, {
                        proxy: false,
                    })
                    .catch((e) => {
                        errorHandler(e, true)
                        if (e.response.status === 413) {
                            ui.messageError('语音过大，无法发送')
                        } else {
                            ui.messageError('语音上传失败，请检查日志')
                        }
                    }),
            )
            return
        }
        if (data.media && data.media.some((i) => i.b64)) {
            socket.emit('requestToken', (token: string) =>
                axios
                    .post(getConfig().server + `/api/${token}/sendMessage`, data, {
                        proxy: false,
                    })
                    .catch((e) => {
                        errorHandler(e, true)
                        if (e.response.status === 413) {
                            ui.messageError('图片过大，无法发送')
                        } else {
                            ui.messageError('图片上传失败，请检查日志')
                        }
                    }),
            )
            return
        } else if (data.file) {
            const fileName = data.file.path.split('\\').pop().split('/').pop()
            const progress = ui.notifyProgress('uploadFile-' + data.file.path, '正在上传到 bridge: ' + fileName)
            try {
                data.file.path = await uploadFileToBridge(data.file.path, fileName, (value) => progress.value(value))
            } catch (e) {
                ui.messageError('文件上传 bridge 失败')
                console.error('文件上传 bridge 失败')
                errorHandler(e, true)
                return
            } finally {
                progress.close()
            }
        } else {
        }
        console.log(data.file)
        socket.emit('sendMessage', data)
    },
    setOnlineStatus(status: number) {
        socket.emit('setOnlineStatus', status)
    },
    setRoomAutoDownload(roomId: number, autoDownload: boolean) {
        socket.emit('setRoomAutoDownload', roomId, autoDownload)
        queueLocalStorageWrite((storage) => storage.updateRoom(roomId, { autoDownload }))
    },
    setRoomAutoDownloadPath(roomId: number, downloadPath: string) {
        socket.emit('setRoomAutoDownloadPath', roomId, downloadPath)
        queueLocalStorageWrite((storage) => storage.updateRoom(roomId, { downloadPath }))
    },
    setRoomPriority(roomId: number, priority: 1 | 2 | 3 | 4 | 5) {
        socket.emit('setRoomPriority', roomId, priority)
        queueLocalStorageWrite((storage) => storage.updateRoom(roomId, { priority }))
    },
    sliderLogin(ticket: string): void {
        socket.emit('login-slider-ticket', ticket)
    },
    updateMessage(roomId: number, messageId: string, message: object) {
        socket.emit('updateMessage', roomId, messageId, message)
        queueLocalStorageWrite((storage) => persistLocalMessageUpdate(storage, roomId, messageId, message))
    },
    updateRoom(roomId: number, room: object) {
        try {
            Object.assign(
                rooms.find((e) => e.roomId === roomId),
                room,
            )
        } catch (e) {
            errorHandler(e, true)
        }
        socket.emit('updateRoom', roomId, room)
        queueLocalStorageWrite((storage) => storage.updateRoom(roomId, room))
    },
    updateChatGroup(name: string, chatGroup: ChatGroup) {
        try {
            Object.assign(
                chatGroups.find((e) => e.name === name),
                chatGroup,
            )
        } catch (e) {
            errorHandler(e, true)
        }
        // TODO
        socket.emit('updateChatGroup', name, chatGroup)
        queueLocalStorageWrite((storage) => storage.updateChatGroup(name, chatGroup))
    },
    getRoamingStamp(no_cache?: boolean): Promise<RoamingStamp[]> {
        return new Promise((resolve, reject) => {
            socket.emit('getRoamingStamp', no_cache, resolve)
        })
    },
    getSystemMsg(): any {
        return new Promise((resolve, reject) => {
            socket.emit('getSystemMsg', resolve)
        })
    },
    handleRequest(type: 'friend' | 'group', flag: string, accept?: boolean): any {
        socket.emit('handleRequest', type, flag, accept)
    },
    sendPacket(type: string, cmd: string, body: Object): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            socket.emit('sendPacket', type, cmd, body, resolve)
        })
    },
    getDisabledFeatures(): Promise<SpecialFeature[]> {
        if (disabledFeatures) return Promise.resolve(disabledFeatures)
        return new Promise((resolve, reject) => {
            socket.emit('getDisabledFeatures', (features) => {
                disabledFeatures = features
                resolve(features)
            })
        })
    },
    getLoginDevices(): any {
        return new Promise((resolve, reject) => {
            socket.emit('getLoginDevices', resolve)
        })
    },
    deleteLoginDevice(flag: string): any {
        socket.emit('deleteLoginDevice', flag)
    },
    getPrivateFileUrl(fileId: string): Promise<string> {
        return new Promise((resolve, reject) => {
            socket.emit('getPrivateFileUrl', fileId, resolve)
        })
    },
}

export default adapter
