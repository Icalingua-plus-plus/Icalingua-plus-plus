import SendMessageParams from './SendMessageParams'
import LoginForm from './LoginForm'
import Message from './Message'
import {FileElem, GroupMessageEventData, MessageElem, PrivateMessageEventData, Ret} from 'oicq'
import Room from './Room'
import IgnoreChatInfo from './IgnoreChatInfo'

export default interface Adapter {
    sendMessage(data: SendMessageParams): any

    createBot(form: LoginForm): any

    getFriendsAndGroups(): Promise<{ friendsAll: any[], groupsAll: any[] }>

    fetchMessages(roomId: number, offset: number): Promise<Message[]>

    sliderLogin(ticket: string): void

    reLogin(): void

    updateRoom(roomId: number, room: object): Promise<any>

    updateMessage(roomId: number, messageId: string, message: object): Promise<any>

    sendGroupPoke(gin: number, uin: number): Promise<Ret<null>>

    addRoom(room: Room): any

    getForwardMsg(resId: string): Promise<Ret<{ group_id?: number, user_id: number, nickname: number, time: number, message: MessageElem[], raw_message: string }[]>>

    getUin(): number

    getGroupFileMeta(gin: number, fid: string): Promise<FileElem['data']>

    getUnreadCount(): Promise<number>

    getFirstUnreadRoom(): Promise<Room>

    getSelectedRoom(): Promise<Room>

    getRoom(roomId: number): Promise<Room>

    setOnlineStatus(status: number): Promise<Ret>

    logOut(): void

    clearCurrentRoomUnread(): any

    setRoomPriority(roomId: number, priority: 1 | 2 | 3 | 4 | 5): any

    setRoomAutoDownload(roomId: number, autoDownload: boolean): any

    setRoomAutoDownloadPath(roomId: number, downloadPath: string): any

    pinRoom(roomId: number, pin: boolean): any

    ignoreChat(data: IgnoreChatInfo): any

    removeChat(roomId: number): any

    deleteMessage(roomId: number, messageId: string): any

    revealMessage(roomId: number, messageId: string | number): any

    fetchHistory(messageId: string, roomId?: number): any
}
