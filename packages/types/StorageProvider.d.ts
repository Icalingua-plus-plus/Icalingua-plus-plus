import Room from './Room'
import Message from './Message'
import IgnoreChatInfo from './IgnoreChatInfo'

export default interface StorageProvider {
    connect(): Promise<void>

    updateRoom(roomId: number, room: Partial<Room>): Promise<any>

    addMessage(roomId: number, message: Message): Promise<any>

    addRoom(room: Room): Promise<any>

    removeRoom(roomId: number): Promise<any>

    updateMessage(roomId: number, messageId: string | number, message: Partial<Message>): Promise<any>

    //updateURL(roomId: number, messageId: string | number, message: Record<string, any>): Promise<any>

    replaceMessage(roomId: number, messageId: string | number, message: Message): Promise<any>

    fetchMessages(roomId: number, skip: number, limit: number): Promise<Message[]>

    getMessage(roomId: number, messageId: string): Promise<Message>

    addMessages(roomId: number, messages: Message[]): Promise<any>

    getAllRooms(): Promise<Room[]>

    getRoom(roomId: number): Promise<Room>

    getUnreadCount(priority: number): Promise<number>

    getFirstUnreadRoom(priority: number): Promise<Room>

    getIgnoredChats(): Promise<IgnoreChatInfo[]>

    isChatIgnored(id: number): Promise<boolean>

    addIgnoredChat(info: IgnoreChatInfo): Promise<any>

    removeIgnoredChat(roomId: number): Promise<any>
}
