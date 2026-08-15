import Aria2Config from '@icalingua/types/Aria2Config'
import AllConfig from '@icalingua/types/AllConfig'
import AtCacheItem from '@icalingua/types/AtCacheElem'
import ChatGroup from '@icalingua/types/ChatGroup'
import IgnoreChatInfo from '@icalingua/types/IgnoreChatInfo'
import Message from '@icalingua/types/Message'
import MessagePageOptions from '@icalingua/types/MessagePage'
import RoamingStamp from '@icalingua/types/RoamingStamp'
import Room from '@icalingua/types/Room'
import SearchableGroup from '@icalingua/types/SearchableGroup'
import { ipcRenderer } from 'electron'
import { FakeMessage, FriendInfo, GroupInfo, MemberInfo } from 'oicq-icalingua-plus-plus'
import SpecialFeature from '@icalingua/types/SpecialFeature'
import DatabaseUpgradeProgress from '@icalingua/types/DatabaseUpgradeProgress'

const ipc = {
    sendMessage(data) {
        return ipcRenderer.send('sendMessage', data)
    },
    async isOnline(): Promise<boolean> {
        return await ipcRenderer.invoke('isOnline')
    },
    async getDisabledFeatures(): Promise<SpecialFeature[]> {
        return await ipcRenderer.invoke('getDisabledFeatures')
    },
    async getNick(): Promise<string> {
        return await ipcRenderer.invoke('getNick')
    },
    async getNTPicURLbyFileid(fileId: string, appid: string): Promise<string> {
        return await ipcRenderer.invoke('getNTPicURLbyFileid', fileId, appid)
    },
    async getSettings(): Promise<AllConfig> {
        return await ipcRenderer.invoke('getSettings')
    },
    async getAria2Settings(): Promise<Aria2Config> {
        return (await this.getSettings()).aria2
    },
    async getlinkifySetting(): Promise<boolean> {
        return (await this.getSettings()).linkify
    },
    async getDisableChatGroupsSetting(): Promise<boolean> {
        return (await this.getSettings()).disableChatGroups
    },
    async getDebugSetting(): Promise<boolean> {
        return (await this.getSettings()).debugmode
    },
    async getOptimizeMethodSetting(): Promise<string> {
        return (await this.getSettings()).optimizeMethod || 'infinite-loading'
    },
    async getRoomPanelSetting(): Promise<{ roomPanelAvatarOnly: boolean; roomPanelWidth: number }> {
        return await ipcRenderer.invoke('getRoomPanelSetting')
    },
    async getMessgeTypeSetting(): Promise<string> {
        return (await ipcRenderer.invoke('getMessgeTypeSetting')) || 'text'
    },
    setRoomPanelSetting(roomPanelAvatarOnly: boolean, roomPanelWidth: number) {
        ipcRenderer.send('setRoomPanelSetting', roomPanelAvatarOnly, roomPanelWidth)
    },
    setStickerPanelHeight(height: number) {
        ipcRenderer.send('setStickerPanelHeight', height)
    },
    async getClearRoomsBehavior(): Promise<'AllUnpined' | '1WeekAgo' | '1DayAgo' | '1HourAgo'> {
        return await ipcRenderer.invoke('getClearRoomsBehavior')
    },
    async getKeyToSendMessage(): Promise<'Enter' | 'CtrlEnter' | 'ShiftEnter'> {
        return await ipcRenderer.invoke('getKeyToSendMessage')
    },
    async getStorePath(): Promise<string> {
        return await ipcRenderer.invoke('getStorePath')
    },
    async getUin(): Promise<number> {
        return await ipcRenderer.invoke('getUin')
    },
    async fetchMessage(roomId: number, options: MessagePageOptions = {}): Promise<Array<Message>> {
        return await ipcRenderer.invoke('fetchMessage', { roomId, options })
    },
    async fetchImageMessages(roomId: number, offset: number, endTime?: number): Promise<Array<Message>> {
        return await ipcRenderer.invoke('fetchImageMessages', { roomId, offset, endTime })
    },
    async fetchMessagesAround(
        roomId: number,
        messageId: string,
        before: number,
        after: number,
    ): Promise<Array<Message>> {
        return await ipcRenderer.invoke('fetchMessagesAround', { roomId, messageId, before, after })
    },
    async resolveUnreadTargetMessageId(roomId: number, unreadCount: number): Promise<string | null> {
        return await ipcRenderer.invoke('resolveUnreadTargetMessageId', { roomId, unreadCount })
    },
    async fetchMessagesBySender(roomId: number, senderId: number, offset: number): Promise<Array<Message>> {
        return await ipcRenderer.invoke('fetchMessagesBySender', { roomId, senderId, offset })
    },
    async searchMessages(
        roomId: number,
        keyword: string,
        offset: number,
        senderId?: number,
        startTime?: number,
        endTime?: number,
    ): Promise<Array<Message>> {
        return await ipcRenderer.invoke('searchMessages', { roomId, keyword, offset, senderId, startTime, endTime })
    },
    openGlobalMessageSearch() {
        ipcRenderer.send('openGlobalMessageSearch')
    },
    openMemberHistory(senderId: number, roomId: number, senderName: string) {
        ipcRenderer.send('openMemberHistory', senderId, roomId, senderName)
    },
    gotoMessage(roomId: number, messageId: string) {
        ipcRenderer.send('gotoMessage', roomId, messageId)
    },
    stopFetchMessage() {
        ipcRenderer.send('stopFetchMessage')
    },
    setSelectedRoom(roomId: number, name: string) {
        ipcRenderer.send('setSelectedRoom', roomId, name)
    },
    async getAccount() {
        return await ipcRenderer.invoke('getAccount')
    },
    async getPriority() {
        return await ipcRenderer.invoke('getPriority')
    },
    //todo 这俩玩意要封装的更细的说
    updateRoom(roomId: number, room: object) {
        ipcRenderer.send('updateRoom', roomId, room)
    },
    async updateMessage(roomId: number, messageId: string, message: object) {
        return await ipcRenderer.invoke('updateMessage', roomId, messageId, message)
    },
    updateChatGroup(name: string, chatGroup: ChatGroup) {
        ipcRenderer.send('updateChatGroup', name, chatGroup)
    },
    async getVersion(): Promise<string> {
        return await ipcRenderer.invoke('getVersion')
    },
    async getDbUpgradeProgress(): Promise<DatabaseUpgradeProgress> {
        return await ipcRenderer.invoke('getDbUpgradeProgress')
    },
    download(url: string, out: string, dir?: string) {
        ipcRenderer.send('download', url, out, dir)
    },
    downloadImage(url: string) {
        ipcRenderer.send('downloadImage', url)
    },
    downloadFileByMessageData(data: { action: string; message: Message; room: Room }) {
        ipcRenderer.send('downloadFileByMessageData', data)
    },
    cancelDownload(id: string) {
        ipcRenderer.send('cancelDownload', id)
    },
    openDownloadedFile(filePath: string) {
        ipcRenderer.send('openDownloadedFile', filePath)
    },
    sendGroupPoke(gin: number, uin: number) {
        ipcRenderer.send('sendGroupPoke', gin, uin)
    },
    reLogin() {
        ipcRenderer.send('reLogin')
    },
    updatePriority(level: 1 | 2 | 3 | 4 | 5) {
        ipcRenderer.send('updatePriority', level)
    },
    popupRoomMenu(roomId: number, e) {
        ipcRenderer.send('popupRoomMenu', roomId, { x: e.screenX, y: e.screenY })
    },
    openGroupAnnouncements(roomId: number) {
        ipcRenderer.send('openGroupAnnouncements', roomId)
    },
    openGroupFiles(roomId: number) {
        ipcRenderer.send('openGroupFiles', roomId)
    },
    openGroupAlbum(roomId: number) {
        ipcRenderer.send('openGroupAlbum', roomId)
    },
    openGroupEssence(roomId: number) {
        ipcRenderer.send('openGroupEssence', roomId)
    },
    popupAvatarMenu(message: Message, room: Room, e) {
        ipcRenderer.send('popupAvatarMenu', message, room, { x: e.screenX, y: e.screenY })
    },
    popupTextAreaMenu(e) {
        ipcRenderer.send('popupTextAreaMenu', { text: e.target.value, x: e.screenX, y: e.screenY })
    },
    popupStickerMenu(e, closePanel: boolean = true) {
        ipcRenderer.send('popupStickerMenu', closePanel, { x: e.screenX, y: e.screenY })
    },
    popupStickerItemMenu(itemName: string, itemList: Array<string>, e) {
        ipcRenderer.send('popupStickerItemMenu', itemName, itemList, { x: e.screenX, y: e.screenY })
    },
    popupStickerDirMenu(dirName: string, e) {
        ipcRenderer.send('popupStickerDirMenu', dirName, { x: e.screenX, y: e.screenY })
    },
    popupContactMenu(e, remark?: string, name?: string, displayId?: number, group?: SearchableGroup) {
        ipcRenderer.send('popupContactMenu', { x: e.screenX, y: e.screenY }, remark, name, displayId, group)
    },
    popupGroupMemberMenu(e, remark?: string, name?: string, displayId?: number, group?: SearchableGroup) {
        ipcRenderer.send('popupGroupMemberMenu', { x: e.screenX, y: e.screenY }, remark, name, displayId, group)
    },
    popupMessageMenu(e, room: Room, message: Message, sect?: string, history?: boolean) {
        ipcRenderer.send('popupMessageMenu', { x: e.screenX, y: e.screenY }, room, message, sect, history)
    },
    addRoom(room: Room) {
        ipcRenderer.send('addRoom', room)
    },
    addChatGroup(chatGroup: ChatGroup) {
        ipcRenderer.send('addChatGroup', chatGroup)
    },
    openForward(resId: string | any[], fileName?: string, fallbackResId?: string) {
        ipcRenderer.send('openForward', resId, fileName, fallbackResId)
    },
    makeForward(fakes: FakeMessage | Iterable<FakeMessage>, dm?: boolean, origin?: number, target?: number) {
        ipcRenderer.send('makeForward', fakes, dm, origin, target)
    },
    setAria2Config(config: Aria2Config) {
        ipcRenderer.send('setAria2Config', config)
    },
    getIgnoredChats(): Promise<IgnoreChatInfo[]> {
        return ipcRenderer.invoke('getIgnoredChats')
    },
    removeChat(roomId: number) {
        ipcRenderer.send('removeChat', roomId)
    },
    removeChatGroup(name: string) {
        ipcRenderer.send('removeChatGroup', name)
    },
    removeIgnoredChat(roomId: number) {
        ipcRenderer.send('removeIgnoredChat', roomId)
    },
    setLastUsedStickerType(type: 'remote' | 'stickers' | 'emojis') {
        ipcRenderer.send('setLastUsedStickerType', type)
    },
    setGroupNick(group: number, nick: string) {
        ipcRenderer.send('setGroupNick', group, nick)
    },
    async getRoamingStamp(no_cache?: boolean): Promise<RoamingStamp> {
        return await ipcRenderer.invoke('getRoamingStamp', no_cache)
    },
    async getLastUsedStickerType(): Promise<'face' | 'remote' | 'stickers' | 'emojis'> {
        return await ipcRenderer.invoke('getLastUsedStickerType')
    },
    async getSystemMsg() {
        return await ipcRenderer.invoke('getSystemMsg')
    },
    handleRequest(type: 'friend' | 'group', flag: string, accept: boolean = true): any {
        return ipcRenderer.send('handleRequest', type, flag, accept)
    },
    setGroupKick(gin: number, uin: number) {
        ipcRenderer.send('setGroupKick', gin, uin)
    },
    setGroupLeave(gin: number) {
        ipcRenderer.send('setGroupLeave', gin)
    },
    setGroupBan(gin: number, uin: number, duration?: number) {
        ipcRenderer.send('setGroupBan', gin, uin, duration)
    },
    setGroupAnonymousBan(gin: number, flag: string, duration?: number) {
        ipcRenderer.send('setGroupAnonymousBan', gin, flag, duration)
    },
    setGroupRemark(gin: number, remark: string) {
        ipcRenderer.send('setGroupRemark', gin, remark)
    },
    setFriendRemark(uin: number, remark: string) {
        ipcRenderer.send('setFriendRemark', uin, remark)
    },
    setCheckUpdate(enabled: boolean) {
        ipcRenderer.send('setCheckUpdate', enabled)
    },
    deleteMessage(roomId: number, messageId: string) {
        ipcRenderer.send('deleteMessage', roomId, messageId)
    },
    async getFriend(uin: number): Promise<FriendInfo> {
        return await ipcRenderer.invoke('getFriend', uin)
    },
    async getGroup(gin: number): Promise<GroupInfo> {
        return await ipcRenderer.invoke('getGroup', gin)
    },
    async getGroupMembers(gin: number): Promise<MemberInfo[]> {
        return await ipcRenderer.invoke('getGroupMembers', gin)
    },
    async getGroups(): Promise<SearchableGroup[]> {
        return await ipcRenderer.invoke('getGroups')
    },
    async pushAtCache(at: AtCacheItem): Promise<number> {
        return await ipcRenderer.invoke('pushAtCache', at)
    },
    ignoreChat(data: IgnoreChatInfo) {
        ipcRenderer.send('ignoreChat', data)
    },
    async getHideChatImageByDefault(): Promise<boolean> {
        return (await this.getSettings()).hideChatImageByDefault
    },
    async getHideChatVideoByDefault(): Promise<boolean> {
        return (await this.getSettings()).hideChatVideoByDefault
    },
    lock() {
        ipcRenderer.send('lock')
    },
    unlock(password: string) {
        ipcRenderer.send('unlock', password)
    },
    setLockPassword(password: string) {
        ipcRenderer.send('setLockPassword', password)
    },
    requestOnlineData() {
        ipcRenderer.send('requestOnlineData')
    },
    async getLoginDevices() {
        return await ipcRenderer.invoke('getLoginDevices')
    },
    deleteLoginDevice(flag: string): any {
        return ipcRenderer.send('deleteLoginDevice', flag)
    },

    // ==================== 独立聊天窗口相关 ====================

    /** 在新窗口中打开会话 */
    openRoomInNewWindow(roomId: number) {
        ipcRenderer.send('openRoomInNewWindow', roomId)
    },

    /** 检查会话是否在独立窗口打开 */
    async isRoomInChatWindow(roomId: number): Promise<boolean> {
        return await ipcRenderer.invoke('isRoomInChatWindow', roomId)
    },

    /** 聚焦独立聊天窗口 */
    focusChatWindow(roomId: number) {
        ipcRenderer.send('focusChatWindow', roomId)
    },

    /** 获取房间信息 */
    async getRoomInfo(roomId: number): Promise<Room> {
        return await ipcRenderer.invoke('getRoomInfo', roomId)
    },

    /** 独立窗口清除未读 */
    clearChatWindowUnread(roomId: number) {
        ipcRenderer.send('clearChatWindowUnread', roomId)
    },
}
export default ipc
