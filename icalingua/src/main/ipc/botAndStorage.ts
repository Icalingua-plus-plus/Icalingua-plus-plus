import Adapter, { CookiesDomain } from '@icalingua/types/Adapter'
import AtCacheItem from '@icalingua/types/AtCacheElem'
import Cookies from '@icalingua/types/cookies'
import GroupOfFriend from '@icalingua/types/GroupOfFriend'
import IgnoreChatInfo from '@icalingua/types/IgnoreChatInfo'
import LoginForm from '@icalingua/types/LoginForm'
import SearchableFriend from '@icalingua/types/SearchableFriend'
import { ipcMain, screen, shell } from 'electron'
import getCharCount from '../../utils/getCharCount'
import getWinUrl from '../../utils/getWinUrl'
import { newIcalinguaWindow } from '../../utils/IcalinguaWindow'
import oicqAdapter from '../adapters/oicqAdapter'
import socketIoAdapter from '../adapters/socketIoAdapter'
import readOnlyAdapter from '../adapters/readOnlyAdapter'
import atCache from '../utils/atCache'
import { getConfig } from '../utils/configManager'
import errorHandler from '../utils/errorHandler'
import getFriends from '../utils/getFriends'
import * as themes from '../utils/themes'
import ChatGroup from '@icalingua/types/ChatGroup'
import { spacingSendMessage } from '../../utils/panguSpacing'
import silkEncode from '../utils/silkEncode'
import fs from 'fs'
import ui from '../utils/ui'
import { openChatWindow, isRoomInChatWindow, focusChatWindow } from '../utils/windowManager'
import removeGroupNameEmotes from '../../utils/removeGroupNameEmotes'
import { loadForwardMessages } from '../utils/forwardMessages'
import type { ForwardResId } from '../utils/forwardMessages'

let adapter: Adapter
if (getConfig().adapter === 'oicq') adapter = oicqAdapter
else if (getConfig().adapter === 'socketIo') adapter = socketIoAdapter
else if (getConfig().adapter === 'readOnly') adapter = readOnlyAdapter

export const {
    sendMessage,
    createBot,
    getMsgNewURL,
    getGroupMemberInfo,
    getGroupMembers,
    getUnreadRooms,
    requestGfsToken,
    getBkn,
    getUin,
    getNickname,
    getGroupFileMeta,
    getUnreadCount,
    getFirstUnreadRoom,
    getFriend,
    getGroup,
    getGroups,
    getSelectedRoom,
    getRoom,
    setOnlineStatus,
    logOut,
    sendOnlineData,
    getFriendsFallback,
    clearCurrentRoomUnread,
    clearRoomUnread,
    markRoomUnread,
    setRoomPriority,
    setRoomAutoDownload,
    setRoomAutoDownloadPath,
    pinRoom,
    ignoreChat,
    removeChat,
    deleteMessage,
    hideMessage,
    revealMessage,
    renewMessage,
    renewMessageURL,
    fetchHistory,
    fetch7DaysHistory,
    stopFetchingHistory,
    makeForward,
    submitSmsCode,
    reLogin,
    randomDevice,
    sendPacket,
    sendGroupSign,
    getDisabledFeatures,
    sendGroupPoke,
    getPrivateFileUrl,
} = adapter

export const canValidateMessageSearchIndex = () => adapter?.isMessageSearchIndexReady?.() === true

export const validateMessageSearchIndex = async () => {
    await adapter?.validateMessageSearchIndex?.()
}

export const fetchLatestHistory = (roomId: number) => {
    let buffer: Buffer
    let uid = roomId
    if (roomId < 0) {
        buffer = Buffer.alloc(21)
        uid = -uid
    } else buffer = Buffer.alloc(17)
    buffer.writeUInt32BE(uid, 0)
    fetchHistory(buffer.toString('base64'), roomId)
}
export const getCookies = async (domain: CookiesDomain): Promise<Cookies> => {
    const strCookies = await adapter.getCookies(domain)
    // 好家伙，原先那依托竟然也是我自己写的
    return Object.fromEntries(strCookies.split('; ').map((pair) => pair.replace(/;$/, '').split('=')))
}

ipcMain.handle('getDisabledFeatures', () => getDisabledFeatures())
ipcMain.handle('getUin', () => getUin())
ipcMain.handle('getNick', () => getNickname())
ipcMain.handle('getNTPicURLbyFileid', async (_, fileId: string, appid: string) => {
    const timeoutPromise = new Promise<string>((resolve) => {
        const timeout = setTimeout(() => {
            resolve('')
        }, 5000)
    })
    return Promise.race([adapter.getNTPicURLbyFileid(fileId, appid), timeoutPromise])
})
ipcMain.on('createBot', (event, form: LoginForm) => createBot(form))
ipcMain.on('randomDevice', (event, username: number) => {
    randomDevice(username)
})
ipcMain.on('submitSmsCode', (event, smsCode: string) => submitSmsCode(smsCode))
ipcMain.on('QRCodeVerify', (event, url: string) => {
    const veriWin = newIcalinguaWindow({
        height: 500,
        width: 500,
        webPreferences: {},
    })
    veriWin.on('closed', () => {
        reLogin()
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
ipcMain.handle('getFriendsAndGroups', async () => {
    const groups = await getGroups()
    let friends: GroupOfFriend[]
    let friendsFallback: SearchableFriend[]
    try {
        friends = await getFriends()
    } catch (e) {
        errorHandler(e, true)
        friends = null
        friendsFallback = await getFriendsFallback()
    }
    return { groups, friends, friendsFallback }
})
ipcMain.on('sendMessage', async (_, data) => {
    data.at = atCache.get()
    if (getConfig().usePanguJsSend) {
        data.content = spacingSendMessage(data.content, data.at)
    }
    if (getConfig().sendSilkAudio) {
        if (data.file && data.file.type && data.file.type.startsWith('audio')) {
            const filepath = data.file.path
            // Memory-backed recordings may not have a local path. Their media
            // payload can still be sent, but they cannot be silk-encoded here.
            if (filepath && fs.existsSync(filepath)) {
                const fd = await fs.promises.open(filepath, 'r')
                const head = Buffer.alloc(7)
                await fd.read(head, 0, head.length, 0)
                await fd.close()
                const header = head.toString('ascii')
                if (!header.includes('SILK') && !header.includes('AMR')) {
                    ui.message('正在尝试编码高清语音...')
                    try {
                        const silkFilePath = await silkEncode(data.file.path)
                        const buffer = fs.readFileSync(silkFilePath)
                        data.file.path = silkFilePath
                        data.file.type = 'audio/silk'
                        data.media = [{ b64: `data:audio;base64,${buffer.toString('base64')}` }]
                        ui.messageSuccess('高清语音编码成功，正在发送...')
                    } catch (e) {
                        console.error(e)
                        ui.messageError('高清语音编码失败，将发送普通语音')
                    }
                }
            }
        }
    }
    sendMessage(data)
    atCache.clear()
})
ipcMain.on('deleteMessage', (_, roomId: number, messageId: string) => deleteMessage(roomId, messageId))
ipcMain.on('hideMessage', (_, roomId: number, messageId: string) => hideMessage(roomId, messageId))
ipcMain.handle('fetchMessage', (_, { roomId, offset }: { roomId: number; offset: number }) => {
    offset === 0 && getConfig().fetchHistoryOnChatOpen && fetchLatestHistory(roomId)
    return adapter.fetchMessages(roomId, offset)
})
ipcMain.handle(
    'fetchImageMessages',
    (_, { roomId, offset, endTime }: { roomId: number; offset: number; endTime?: number }) => {
        return adapter.fetchImageMessages(roomId, offset, endTime)
    },
)
ipcMain.handle(
    'fetchMessagesAround',
    (_, { roomId, messageId, before, after }: { roomId: number; messageId: string; before: number; after: number }) => {
        return adapter.fetchMessagesAround(roomId, messageId, before, after)
    },
)
ipcMain.handle(
    'fetchMessagesBySender',
    async (_, { roomId, senderId, offset }: { roomId: number; senderId: number; offset: number }) => {
        const messages = await adapter.fetchMessagesBySender(roomId, senderId, offset)
        if (roomId === 0) {
            // 所有群模式：为每条消息附加群头像和群名
            for (const msg of messages) {
                const msgRoomId = (msg as any).roomId
                if (msgRoomId && msgRoomId < 0) {
                    try {
                        const room = await adapter.getRoom(msgRoomId)
                        if (room) {
                            ;(msg as any)._roomName = getConfig().removeGroupNameEmotes
                                ? removeGroupNameEmotes(room.roomName)
                                : room.roomName
                        }
                    } catch (e) {}
                    ;(msg as any)._roomAvatar = `https://p.qlogo.cn/gh/${-msgRoomId}/${-msgRoomId}/0`
                }
            }
        }
        return messages
    },
)
ipcMain.handle(
    'searchMessages',
    async (_, { roomId, keyword, offset }: { roomId: number; keyword: string; offset: number }) => {
        const messages = await adapter.searchMessages(roomId, keyword, offset)
        if (roomId === 0) {
            const roomIds = Array.from(
                new Set(
                    messages
                        .map((message) => message.roomId)
                        .filter((messageRoomId): messageRoomId is number => messageRoomId !== undefined),
                ),
            )
            const roomEntries = await Promise.all(
                roomIds.map(async (messageRoomId) => {
                    try {
                        return [messageRoomId, await adapter.getRoom(messageRoomId)] as const
                    } catch (e) {
                        return [messageRoomId, null] as const
                    }
                }),
            )
            const rooms = new Map(roomEntries)
            return messages.map((message) => {
                if (message.roomId === undefined) return message
                const room = rooms.get(message.roomId)
                return {
                    ...message,
                    _roomName: room
                        ? message.roomId < 0 && getConfig().removeGroupNameEmotes
                            ? removeGroupNameEmotes(room.roomName)
                            : room.roomName
                        : `${message.roomId < 0 ? '群聊' : '私聊'} ${Math.abs(message.roomId)}`,
                }
            })
        }
        return messages
    },
)
ipcMain.on('openMemberHistory', async (_, senderId: number, roomId: number, senderName: string) => {
    const size = screen.getPrimaryDisplay().size
    let width = size.width - 300
    if (width > 1440) width = 900
    const win = newIcalinguaWindow({
        height: size.height - 200,
        width,
        backgroundColor: themes.getThemeBackgroundColor(),
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            webSecurity: false,
            contextIsolation: false,
        },
    })
    win.loadURL(getWinUrl() + '#/memberHistory')
    win.webContents.on('did-finish-load', function () {
        win.webContents.send('theme:sync-theme-data', themes.getThemeData())
        win.webContents.setZoomFactor(getConfig().zoomFactor / 100)
        win.webContents.setWindowOpenHandler((details) => {
            shell.openExternal(details.url)
            return { action: 'deny' }
        })
        win.webContents.send('initMemberHistory', { senderId, roomId, senderName })
    })
})
ipcMain.on('sliderLogin', (_, ticket: string) => adapter.sliderLogin(ticket))
ipcMain.on('reLogin', adapter.reLogin)
ipcMain.on('updateRoom', (_, roomId: number, room: object) => adapter.updateRoom(roomId, room))
ipcMain.on('updateChatGroup', (_, name: string, chatGroup: ChatGroup) => adapter.updateChatGroup(name, chatGroup))
ipcMain.on('updateMessage', (_, roomId: number, messageId: string, message: object) =>
    adapter.updateMessage(roomId, messageId, message),
)
ipcMain.on('sendGroupPoke', (_, gin, uin) => adapter.sendGroupPoke(gin, uin))
ipcMain.on('addRoom', (_, room) => adapter.addRoom(room))
ipcMain.on('addChatGroup', (_, chatGroup) => adapter.addChatGroup(chatGroup))
ipcMain.on('openForward', (_, resId: ForwardResId, fileName?: string, fallbackResId?: string) => {
    const size = screen.getPrimaryDisplay().size
    let width = size.width - 300
    if (width > 1440) width = 900
    const win = newIcalinguaWindow(
        {
            height: size.height - 200,
            width,
            backgroundColor: themes.getThemeBackgroundColor(),
            autoHideMenuBar: true,
            webPreferences: {
                nodeIntegration: true,
                webSecurity: false,
                contextIsolation: false,
            },
        },
        { stableTitle: 'Icalingua++ ForwardView' },
    )
    win.loadURL(getWinUrl() + '#/history')
    const messages = loadForwardMessages(adapter, resId, fileName, fallbackResId)
    win.webContents.on('did-finish-load', async function () {
        // theme
        win.webContents.send('theme:sync-theme-data', themes.getThemeData())
        win.webContents.setZoomFactor(getConfig().zoomFactor / 100)
        win.webContents.setWindowOpenHandler((details) => {
            shell.openExternal(details.url)
            return {
                action: 'deny',
            }
        })
        // load messages
        const loaded = await messages
        win.webContents.send('loadMessages', loaded.messages)
        win.webContents.send('setResId', loaded.resId)
    })
})
ipcMain.handle('getIgnoredChats', adapter.getIgnoredChats)
ipcMain.on('removeChat', (_, roomId) => adapter.removeChat(roomId))
ipcMain.on('removeChatGroup', (_, name) => adapter.removeChatGroup(name))
ipcMain.on('removeIgnoredChat', (_, roomId) => adapter.removeIgnoredChat(roomId))
ipcMain.on('stopFetchMessage', () => adapter.stopFetchingHistory())
ipcMain.handle('getRoamingStamp', async (_, no_cache) => await adapter.getRoamingStamp(no_cache))
ipcMain.on('setGroupNick', (_, group, nick) => adapter.setGroupNick(group, nick))
ipcMain.on('setGroupKick', (_, gin, uin) => adapter.setGroupKick(gin, uin))
ipcMain.on('setGroupLeave', (_, gin) => adapter.setGroupLeave(gin))
ipcMain.on('setGroupBan', (_, gin, uin, duration?) => adapter.setGroupBan(gin, uin, duration))
ipcMain.on('setGroupAnonymousBan', (_, gin, flag, duration?) => adapter.setGroupAnonymousBan(gin, flag, duration))
ipcMain.on('setGroupRemark', (_, gin, remark) => adapter.setGroupRemark(gin, remark))
ipcMain.on('setFriendRemark', (_, uin, remark) => adapter.setFriendRemark(uin, remark))
ipcMain.on('makeForward', (_, fakes, dm, origin, target) => adapter.makeForward(fakes, dm, origin, target))
ipcMain.handle('getSystemMsg', async () => await adapter.getSystemMsg())
ipcMain.on('handleRequest', (_, type: 'friend' | 'group', flag: string, accept: boolean = true) =>
    adapter.handleRequest(type, flag, accept),
)
ipcMain.handle('getAccount', () => {
    const localAccount = getConfig().account
    const adapterAccount = adapter.getAccount()
    return {
        ...localAccount,
        ...adapterAccount,
    }
})
ipcMain.handle('getFriend', (_, uin: number) => adapter.getFriend(uin))
ipcMain.handle('getGroup', (_, gin: number) => adapter.getGroup(gin))
ipcMain.handle('getGroupMembers', (_, gin: number) => adapter.getGroupMembers(gin))
ipcMain.handle('getGroups', () => adapter.getGroups())
ipcMain.handle('pushAtCache', (_, at: AtCacheItem) => atCache.push(at))
ipcMain.on('ignoreChat', (_, data: IgnoreChatInfo) => adapter.ignoreChat(data))
ipcMain.on('requestOnlineData', adapter.sendOnlineData)
ipcMain.handle('getLoginDevices', async () => await adapter.getLoginDevices())
ipcMain.on('deleteLoginDevice', async (_, flag) => await adapter.deleteLoginDevice(flag))

// ==================== 独立聊天窗口相关 IPC ====================

/** 打开独立聊天窗口 */
ipcMain.on('openRoomInNewWindow', async (_, roomId: number) => {
    const room = await adapter.getRoom(roomId)
    if (room) {
        const roomName =
            room.roomId < 0 && getConfig().removeGroupNameEmotes ? removeGroupNameEmotes(room.roomName) : room.roomName
        await openChatWindow(roomId, roomName)
        // 如果主窗口当前选中的是这个会话，取消选中
        if (ui.getSelectedRoomId() === roomId) {
            ui.chroom(0)
        }
    }
})

/** 检查会话是否在独立窗口打开 */
ipcMain.handle('isRoomInChatWindow', (_, roomId: number) => {
    return isRoomInChatWindow(roomId)
})

/** 聚焦独立聊天窗口 */
ipcMain.on('focusChatWindow', (_, roomId: number) => {
    focusChatWindow(roomId)
})

/** 获取房间信息（供独立窗口使用） */
ipcMain.handle('getRoomInfo', async (_, roomId: number) => {
    return await adapter.getRoom(roomId)
})

/** 独立窗口清除未读 */
ipcMain.on('clearChatWindowUnread', async (_, roomId: number) => {
    await clearRoomUnread(roomId)
})
