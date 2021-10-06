import {BrowserWindow, ipcMain, screen} from 'electron'
import LoginForm from '../../types/LoginForm'
import {getConfig} from '../utils/configManager'
import getWinUrl from '../../utils/getWinUrl'
import {CookiesDomain} from '../../types/Adapter'
import socketIoAdapter from '../adapters/socketIoAdapter'
import getCharCount from '../../utils/getCharCount'
import Cookies from '../../types/cookies'
import getFriends from '../utils/getFriends'
import atCache from '../utils/atCache'
import GroupOfFriend from '../../types/GroupOfFriend'
import errorHandler from '../utils/errorHandler'
import SearchableFriend from '../../types/SearchableFriend'
import * as themes from '../utils/themes'
import SearchableGroup from '../../types/SearchableGroup'

let adapter = socketIoAdapter
let groups: SearchableGroup[]

export const {
    sendMessage, createBot, getGroupMemberInfo, getGroupMembers, getUnreadRooms,
    getUin, getNickname, getGroupFileMeta, getUnreadCount, getFirstUnreadRoom, getGroups,
    getSelectedRoom, getRoom, setOnlineStatus, logOut, sendOnlineData, getFriendsFallback,
    clearCurrentRoomUnread, clearRoomUnread, setRoomPriority, setRoomAutoDownload, setRoomAutoDownloadPath,
    pinRoom, ignoreChat, removeChat, deleteMessage, revealMessage, fetchHistory, stopFetchingHistory,
} = adapter
export const fetchLatestHistory = (roomId: number) => {
    let buffer: Buffer
    let uid = roomId
    if (roomId < 0) {
        buffer = Buffer.alloc(21)
        uid = -uid
    }
    else buffer = Buffer.alloc(17)
    buffer.writeUInt32BE(uid, 0)
    fetchHistory(buffer.toString('base64'), roomId)
}
export const getCookies = async (domain: CookiesDomain): Promise<Cookies> => {
    const strCookies = await adapter.getCookies(domain)
    if (getCharCount(strCookies, ';') < 2)
        return null
    const cookies = strCookies.split(';', 4)
    const ret: Cookies = {
        uin: cookies[0].substr(4),
        skey: cookies[1].trim().substr(5),
    }
    if (getCharCount(strCookies, ';') === 4) {
        ret.p_uin = cookies[2].trim().substr(6)
        ret.p_skey = cookies[3].trim().substr(7)
    }
    return ret
}

ipcMain.on('createBot', (event, form: LoginForm) => createBot(form))
ipcMain.handle('getFriendsAndGroups', async () => {
    groups = await getGroups()
    let friends: GroupOfFriend[]
    let friendsFallback: SearchableFriend[]
    try {
        friends = await getFriends()
    } catch (e) {
        errorHandler(e, true)
        friends = null
        friendsFallback = await getFriendsFallback()
    }
    return {groups, friends, friendsFallback}
})
ipcMain.on('sendMessage', (_, data) => {
    data.at = atCache.get()
    sendMessage(data)
    atCache.clear()
})
ipcMain.on('deleteMessage', (_, roomId: number, messageId: string) => deleteMessage(roomId, messageId))
ipcMain.handle('fetchMessage', (_, {roomId, offset}: { roomId: number, offset: number }) => {
    offset === 0 && getConfig().fetchHistoryOnChatOpen && fetchLatestHistory(roomId)
    return adapter.fetchMessages(roomId, offset)
})
ipcMain.on('sliderLogin', (_, ticket: string) => adapter.sliderLogin(ticket))
ipcMain.on('reLogin', adapter.reLogin)
ipcMain.on('updateRoom', (_, roomId: number, room: object) => adapter.updateRoom(roomId, room))
ipcMain.on('updateMessage', (_, roomId: number, messageId: string, message: object) =>
    adapter.updateMessage(roomId, messageId, message))
ipcMain.on('sendGroupPoke', (_, gin, uin) => adapter.sendGroupPoke(gin, uin))
ipcMain.on('addRoom', (_, room) => adapter.addRoom(room))
ipcMain.on('openForward', async (_, resId: string) => {
    const messages = await adapter.getForwardMsg(resId)
    const size = screen.getPrimaryDisplay().size
    let width = size.width - 300
    if (width > 1440) width = 900
    const win = new BrowserWindow({
        height: size.height - 200,
        width,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            webSecurity: false,
            contextIsolation: false,
        },
    })
    win.loadURL(getWinUrl() + '#/history')
    win.webContents.on('did-finish-load', function () {
        win.webContents.send('loadMessages', messages)
        // theme
        win.webContents.send('theme:sync-theme-data', themes.getThemeData())
    })
})
ipcMain.handle('getIgnoredChats', adapter.getIgnoredChats)
ipcMain.on('removeIgnoredChat', (_, roomId) => adapter.removeIgnoredChat(roomId))
ipcMain.on('stopFetchMessage', () => adapter.stopFetchingHistory())
ipcMain.handle('getRoamingStamp', async () => await adapter.getRoamingStamp())
ipcMain.on('setGroupNick', (_, group, nick) => adapter.setGroupNick(group, nick))
ipcMain.on('setGroupKick', (_, gin, uin) => adapter.setGroupKick(gin, uin))
ipcMain.on('setGroupLeave', (_, gin) => adapter.setGroupLeave(gin))
ipcMain.handle('getSystemMsg', async () => await adapter.getSystemMsg())
ipcMain.on('handleRequest', (_, type: 'friend' | 'group', flag: string, accept: boolean = true) =>
    adapter.handleRequest(type, flag, accept))
ipcMain.handle('getAccount', adapter.getAccount)
ipcMain.handle('getGroup', (_, gin: number) => groups.find(e => e.group_id === gin))
