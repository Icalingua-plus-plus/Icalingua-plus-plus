import SendMessageParams from './SendMessageParams'
import LoginForm from './LoginForm'
import Message from './Message'
import { FakeMessage, FileElem, GroupInfo, MemberInfo } from 'oicq-icalingua-plus-plus'
import Room from './Room'
import IgnoreChatInfo from './IgnoreChatInfo'
import SearchableGroup from './SearchableGroup'
import RoamingStamp from './RoamingStamp'
import SearchableFriend from './SearchableFriend'

type CookiesDomain =
    | 'tenpay.com'
    | 'docs.qq.com'
    | 'office.qq.com'
    | 'connect.qq.com'
    | 'vip.qq.com'
    | 'mail.qq.com'
    | 'qzone.qq.com'
    | 'gamecenter.qq.com'
    | 'mma.qq.com'
    | 'game.qq.com'
    | 'qqweb.qq.com'
    | 'openmobile.qq.com'
    | 'qun.qq.com'
    | 'ti.qq.com'

export default interface Adapter {
    getMsgNewURL(id: string): Promise<string>

    getGroup(gin: number): Promise<GroupInfo>

    getAccount(): LoginForm

    randomDevice(username: number): void

    sendPacket(type: string, cmd: string, body: Object): Promise<Buffer>

    clearRoomUnread(roomId: number): any

    getUnreadRooms(): Promise<Room[]>

    reportRead(messageId: string): any

    getGroupMembers(group: number): Promise<MemberInfo[]>

    setGroupNick(group: number, nick: string): any

    getGroupMemberInfo(group: number, member: number, noCache?: boolean): Promise<MemberInfo>

    sendMessage(data: SendMessageParams): any

    createBot(form: LoginForm): any

    submitSmsCode(smsCode: string): any

    getGroups(): Promise<SearchableGroup[]>

    getFriendsFallback(): Promise<SearchableFriend[]>

    fetchMessages(roomId: number, offset: number): Promise<Message[]>

    sliderLogin(ticket: string): void

    reLogin(): void

    updateRoom(roomId: number, room: object): any

    updateMessage(roomId: number, messageId: string, message: object): any

    sendGroupPoke(gin: number, uin: number): any

    addRoom(room: Room): any

    getForwardMsg(resId: string, fileName?: string): Promise<Message[]>

    makeForward(fakes: FakeMessage | Iterable<FakeMessage>, dm?: boolean, origin?: number, target?: number): any

    getUin(): number

    getNickname(): string

    getGroupFileMeta(gin: number, fid: string): Promise<FileElem['data']>

    getUnreadCount(): Promise<number>

    getFirstUnreadRoom(): Promise<Room>

    getSelectedRoom(): Promise<Room>

    getRoom(roomId: number): Promise<Room>

    setOnlineStatus(status: number): any

    logOut(): void

    clearCurrentRoomUnread(): any

    setRoomPriority(roomId: number, priority: 1 | 2 | 3 | 4 | 5): any

    setRoomAutoDownload(roomId: number, autoDownload: boolean): any

    setRoomAutoDownloadPath(roomId: number, downloadPath: string): any

    pinRoom(roomId: number, pin: boolean): any

    ignoreChat(data: IgnoreChatInfo): any

    removeChat(roomId: number): any

    deleteMessage(roomId: number, messageId: string): any

    hideMessage(roomId: number, messageId: string): any

    revealMessage(roomId: number, messageId: string | number): any

    renewMessage(roomId: number, messageId: string, message: Message): any

    renewMessageURL(roomId: number, messageId: string | number, URL: string): any

    fetchHistory(messageId: string, roomId?: number): any

    stopFetchingHistory(): any

    getCookies(domain: CookiesDomain): Promise<string>

    getIgnoredChats(): Promise<IgnoreChatInfo[]>

    removeIgnoredChat(roomId: number): any

    getRoamingStamp(no_cache?: boolean): Promise<RoamingStamp[]>

    sendOnlineData(): any

    getSystemMsg(): any

    handleRequest(type: 'friend' | 'group', flag: string, accept?: boolean): any

    setGroupKick(gin: number, uin: number): any

    setGroupLeave(gin: number): any

    setGroupBan(gin: number, uin: number, duration?: number): any

    setGroupAnonymousBan(gin: number, flag: string, duration?: number): any

    requestGfsToken(gin: number): Promise<string>
}
