import Aria2Config from '@icalingua/types/Aria2Config'
import AllConfig from '@icalingua/types/AllConfig'
import AtCacheItem from '@icalingua/types/AtCacheElem'
import ChatGroup from '@icalingua/types/ChatGroup'
import IgnoreChatInfo from '@icalingua/types/IgnoreChatInfo'
import Message from '@icalingua/types/Message'
import RoamingStamp from '@icalingua/types/RoamingStamp'
import Room from '@icalingua/types/Room'
import SearchableGroup from '@icalingua/types/SearchableGroup'
import { ipcRenderer } from 'electron'
import { FakeMessage, MemberInfo } from 'oicq-icalingua-plus-plus'
import SpecialFeature from '@icalingua/types/SpecialFeature'

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
    async fetchMessage(roomId: number, offset: number): Promise<Array<Message>> {
        return await ipcRenderer.invoke('fetchMessage', { roomId, offset })
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
    download(url: string, out: string, dir?: string) {
        ipcRenderer.send('download', url, out, dir)
    },
    downloadImage(url: string) {
        ipcRenderer.send('downloadImage', url)
    },
    downloadFileByMessageData(data: { action: string; message: Message; room: Room }) {
        ipcRenderer.send('downloadFileByMessageData', data)
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
    popupRoomMenu(roomId: number) {
        ipcRenderer.send('popupRoomMenu', roomId)
    },
    popupAvatarMenu(message: Message, room: Room) {
        ipcRenderer.send('popupAvatarMenu', message, room)
    },
    popupTextAreaMenu() {
        ipcRenderer.send('popupTextAreaMenu')
    },
    popupStickerMenu() {
        ipcRenderer.send('popupStickerMenu')
    },
    popupStickerItemMenu(itemName: string) {
        ipcRenderer.send('popupStickerItemMenu', itemName)
    },
    popupStickerDirMenu(dirName: string) {
        ipcRenderer.send('popupStickerDirMenu', dirName)
    },
    popupContactMenu(remark?: string, name?: string, displayId?: number, group?: SearchableGroup) {
        ipcRenderer.send('popupContactMenu', remark, name, displayId, group)
    },
    popupGroupMemberMenu(remark?: string, name?: string, displayId?: number, group?: SearchableGroup) {
        ipcRenderer.send('popupGroupMemberMenu', remark, name, displayId, group)
    },
    popupMessageMenu(room: Room, message: Message, sect?: string, history?: boolean) {
        ipcRenderer.send('popupMessageMenu', room, message, sect, history)
    },
    addRoom(room: Room) {
        ipcRenderer.send('addRoom', room)
    },
    addChatGroup(chatGroup: ChatGroup) {
        ipcRenderer.send('addChatGroup', chatGroup)
    },
    openForward(resId: string, fileName?: string) {
        ipcRenderer.send('openForward', resId, fileName)
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
    setCheckUpdate(enabled: boolean) {
        ipcRenderer.send('setCheckUpdate', enabled)
    },
    deleteMessage(roomId: number, messageId: string) {
        ipcRenderer.send('deleteMessage', roomId, messageId)
    },
    async getGroup(gin: number): Promise<SearchableGroup> {
        return await ipcRenderer.invoke('getGroup', gin)
    },
    async getGroupMembers(gin: number): Promise<MemberInfo[]> {
        return await ipcRenderer.invoke('getGroupMembers', gin)
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
    lock() {
        ipcRenderer.send('lock')
    },
    unlock(password: string) {
        ipcRenderer.send('unlock', password)
    },
    setLockPassword(password: string) {
        ipcRenderer.send('setLockPassword', password)
    },
}
export default ipc
