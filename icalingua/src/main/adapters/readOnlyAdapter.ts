import MongoStorageProvider from '@icalingua/storage-providers/MongoStorageProvider'
import RedisStorageProvider from '@icalingua/storage-providers/RedisStorageProvider'
import SQLStorageProvider from '@icalingua/storage-providers/SQLStorageProvider'
import Adapter, { CookiesDomain } from '@icalingua/types/Adapter'
import IgnoreChatInfo from '@icalingua/types/IgnoreChatInfo'
import LoginForm from '@icalingua/types/LoginForm'
import Message from '@icalingua/types/Message'
import RoamingStamp from '@icalingua/types/RoamingStamp'
import Room from '@icalingua/types/Room'
import SearchableFriend from '@icalingua/types/SearchableFriend'
import SendMessageParams from '@icalingua/types/SendMessageParams'
import StorageProvider from '@icalingua/types/StorageProvider'
import ChatGroup from '@icalingua/types/ChatGroup'
import SpecialFeature from '@icalingua/types/SpecialFeature'
import { app, dialog } from 'electron'
import path from 'path'
import { FakeMessage, FriendInfo, GroupInfo, MemberInfo, FileElem } from 'oicq-icalingua-plus-plus'
import { getConfig, saveConfigFile } from '../utils/configManager'
import { createTray, updateTrayIcon } from '../utils/trayManager'
import { getMainWindow, loadMainWindow, showLoginWindow } from '../utils/windowManager'
import errorHandler from '../utils/errorHandler'
import getBuildInfo from '../utils/getBuildInfo'
import ui from '../utils/ui'
import { checkUpdate, getCachedUpdate } from '../utils/updateChecker'
import { updateAppMenu } from '../ipc/menuManager'

let storage: StorageProvider
let loginForm: LoginForm
let loggedIn = false

/**
 * 只读模式 Adapter
 * 仅连接数据库，以只读方式浏览历史聊天记录
 */

const initStorage = async () => {
    try {
        switch (loginForm.storageType) {
            case 'mdb':
                storage = new MongoStorageProvider(loginForm.mdbConnStr, loginForm.username)
                break
            case 'redis':
                storage = new RedisStorageProvider(loginForm.rdsHost, `${loginForm.username}`)
                break
            case 'sqlite':
                storage = new SQLStorageProvider(
                    `${loginForm.username}`,
                    'sqlite3',
                    {
                        dataPath: path.join(app.getPath('userData'), 'data'),
                    },
                    errorHandler,
                )
                break
            case 'mysql':
                storage = new SQLStorageProvider(
                    `${loginForm.username}`,
                    'mysql',
                    {
                        host: loginForm.sqlHost,
                        user: loginForm.sqlUsername,
                        password: loginForm.sqlPassword,
                        database: loginForm.sqlDatabase,
                    },
                    errorHandler,
                )
                break
            case 'pg':
                storage = new SQLStorageProvider(
                    `${loginForm.username}`,
                    'pg',
                    {
                        host: loginForm.sqlHost,
                        user: loginForm.sqlUsername,
                        password: loginForm.sqlPassword,
                        database: loginForm.sqlDatabase,
                    },
                    errorHandler,
                )
                break
            default:
                break
        }
        await storage.connect()
    } catch (err) {
        errorHandler(err, true)
        getConfig().account.autologin = false
        saveConfigFile()
        await dialog.showMessageBox(getMainWindow(), {
            title: '错误',
            message: '无法连接数据库',
            type: 'error',
        })
        app.quit()
    }
}

const adapter: Adapter = {
    // ==================== 需要实现的读取方法 ====================

    async createBot(form: LoginForm) {
        loginForm = form
        await initStorage()

        if (!loggedIn) {
            loggedIn = true
            await loadMainWindow()
            await createTray()
        }

        // 发送在线数据
        adapter.sendOnlineData()
        await updateTrayIcon(true)
        await updateAppMenu()
    },

    async sendOnlineData() {
        let sysInfo = getBuildInfo()
        const updateInfo = getCachedUpdate()
        if (updateInfo && updateInfo.hasUpdate) {
            if (sysInfo) sysInfo += '\n\n'
            sysInfo += '新版本可用: ' + updateInfo.latestVersion
        }
        if (sysInfo) sysInfo += '\n\n'
        sysInfo += '只读模式 - 仅可浏览历史消息'

        ui.sendOnlineData({
            online: true,
            nick: '只读模式',
            uin: Number(loginForm.username) || 0,
            priority: getConfig().priority,
            sysInfo,
            updateCheck: getConfig().updateCheck,
        })

        // 设置禁言状态以隐藏输入框
        ui.setShutUp(true)

        // 加载所有房间和分组
        ui.setAllRooms(await storage.getAllRooms())
        ui.setAllChatGroups(await storage.getAllChatGroups())

        if (!updateInfo) {
            checkUpdate().then(adapter.sendOnlineData)
        }
    },

    async fetchMessages(roomId: number, offset: number): Promise<Message[]> {
        // 只读模式始终禁言
        if (!offset) {
            ui.setShutUp(true)
        }
        const messages = (await storage.fetchMessages(roomId, offset, 20)) || []
        return messages
    },

    async getRoom(roomId: number): Promise<Room> {
        return await storage.getRoom(roomId)
    },

    async getSelectedRoom(): Promise<Room> {
        return await adapter.getRoom(ui.getSelectedRoomId())
    },

    async getUnreadCount(): Promise<number> {
        return await storage.getUnreadCount(getConfig().priority)
    },

    async getUnreadRooms(): Promise<Room[]> {
        const rooms = await storage.getAllRooms()
        return rooms.filter((e) => e.unreadCount && e.priority >= getConfig().priority)
    },

    async getFirstUnreadRoom(): Promise<Room> {
        return await storage.getFirstUnreadRoom(getConfig().priority)
    },

    getIgnoredChats(): Promise<IgnoreChatInfo[]> {
        return storage.getIgnoredChats()
    },

    async getForwardMsg(resId: string, fileName?: string): Promise<Message[]> {
        // 只读模式无法获取转发消息（需要在线）
        return []
    },

    // ==================== 返回默认值/空实现的方法 ====================

    getMsgNewURL(id: string): Promise<string> {
        return Promise.resolve('error')
    },

    getFriend(uin: number): Promise<FriendInfo> {
        return Promise.resolve(null)
    },

    getGroup(gin: number): Promise<GroupInfo> {
        return Promise.resolve(null)
    },

    requestGfsToken(gin: number): Promise<string> {
        return Promise.resolve('')
    },

    setGroupKick(gin: number, uin: number): any {},
    setGroupLeave(gin: number): any {},
    setGroupBan(gin: number, uin: number, duration?: number): any {},
    setGroupAnonymousBan(gin: number, flag: string, duration?: number): any {},
    setGroupRemark(gin: number, remark: string): any {},
    setFriendRemark(uin: number, remark: string): any {},

    makeForward(fakes: FakeMessage | Iterable<FakeMessage>, dm?: boolean, origin?: number, target?: number): any {},

    reportRead(messageId: string): any {},

    async getGroupMembers(group: number): Promise<MemberInfo[]> {
        return []
    },

    setGroupNick(group: number, nick: string): any {},

    async getGroupMemberInfo(group: number, member: number, noCache?: boolean): Promise<MemberInfo> {
        return null
    },

    async _getGroupMemberInfo(group: number, member: number, noCache?: boolean): Promise<MemberInfo> {
        return null
    },

    async getFriendsFallback(): Promise<SearchableFriend[]> {
        return []
    },

    removeIgnoredChat(roomId: number): any {
        // 只读模式不允许修改
    },

    async getCookies(domain: CookiesDomain): Promise<string> {
        return ''
    },

    sendMessage(data: SendMessageParams): any {
        // 只读模式不允许发送消息
    },

    randomDevice(username: number): void {},

    submitSmsCode(smsCode: string): any {},

    async getGroups(): Promise<any[]> {
        return []
    },

    sliderLogin(ticket: string): void {},

    reLogin(): void {
        // 只读模式重新加载数据
        if (storage) {
            adapter.sendOnlineData()
        }
    },

    updateRoom(roomId: number, room: object): any {
        // 只读模式不允许修改
    },

    updateChatGroup(name: string, chatGroup: ChatGroup): any {
        // 只读模式不允许修改
    },

    updateMessage(roomId: number, messageId: string, message: object): any {
        // 只读模式不允许修改
    },

    sendGroupPoke(gin: number, uin: number): any {},
    sendGroupSign(gin: number): any {},

    addRoom(room: Room): any {
        // 只读模式不允许添加
    },

    addChatGroup(chatGroup: ChatGroup): any {
        // 只读模式不允许添加
    },

    getBkn: () => 0,
    getUin: () => Number(loginForm?.username) || 0,
    getNickname: () => '只读模式',
    getAccount: () => loginForm,

    getGroupFileMeta(gin: number, fid: string): Promise<FileElem['data']> {
        return Promise.resolve(null)
    },

    setOnlineStatus(status: number): any {},

    logOut(): void {},

    clearCurrentRoomUnread(): any {},

    clearRoomUnread(roomId: number): any {
        // 只读模式可以清除未读（本地操作）
        ui.clearRoomUnread(roomId)
    },

    setRoomPriority(roomId: number, priority: 1 | 2 | 3 | 4 | 5): any {
        // 只读模式不允许修改
    },

    setRoomAutoDownload(roomId: number, autoDownload: boolean): any {
        // 只读模式不允许修改
    },

    setRoomAutoDownloadPath(roomId: number, downloadPath: string): any {
        // 只读模式不允许修改
    },

    pinRoom(roomId: number, pin: boolean): any {
        // 只读模式不允许修改
    },

    ignoreChat(data: IgnoreChatInfo): any {
        // 只读模式不允许修改
    },

    removeChat(roomId: number): any {
        // 只读模式不允许删除
    },

    removeChatGroup(name: string): any {
        // 只读模式不允许删除
    },

    deleteMessage(roomId: number, messageId: string): any {
        // 只读模式不允许删除
    },

    hideMessage(roomId: number, messageId: string): any {
        // 只读模式不允许修改
    },

    revealMessage(roomId: number, messageId: string | number): any {
        // 只读模式不允许修改
    },

    renewMessage(roomId: number, messageId: string, message: Message): any {
        // 只读模式不允许修改
    },

    renewMessageURL(roomId: number, messageId: string | number, URL: string): any {
        // 只读模式不允许修改
    },

    fetchHistory(messageId: string, roomId?: number): any {
        // 只读模式无法拉取历史（需要在线）
    },

    fetch7DaysHistory(): any {
        // 只读模式无法拉取历史（需要在线）
    },

    stopFetchingHistory(): any {},

    getRoamingStamp(no_cache?: boolean): Promise<RoamingStamp[]> {
        return Promise.resolve([])
    },

    getSystemMsg(): any {
        return Promise.resolve(null)
    },

    handleRequest(type: 'friend' | 'group', flag: string, accept?: boolean): any {},

    sendPacket(type: string, cmd: string, body: Object): Promise<Buffer> {
        return Promise.resolve(Buffer.alloc(0))
    },

    getDisabledFeatures(): Promise<SpecialFeature[]> {
        // 只读模式禁用所有特殊功能
        return Promise.resolve([])
    },

    getLoginDevices(): any {
        return Promise.resolve([])
    },

    deleteLoginDevice(flag: string): any {},

    getPrivateFileUrl(fileId: string): Promise<string> {
        return Promise.resolve('')
    },
}

export default adapter
