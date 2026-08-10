import Room from './Room'
import Message from './Message'
import IgnoreChatInfo from './IgnoreChatInfo'
import ChatGroup from './ChatGroup'
import DatabaseUpgradeProgress from './DatabaseUpgradeProgress'
import MessagePageOptions from './MessagePage'

export default interface StorageProvider {
    connect(): Promise<void>

    onUpgradeProgress?: (progress: DatabaseUpgradeProgress) => void

    isMessageSearchIndexReady?(): boolean

    validateMessageSearchIndex?(): Promise<void>

    updateRoom(roomId: number, room: Partial<Room>): Promise<any>

    addMessage(roomId: number, message: Message): Promise<any>

    addRoom(room: Room): Promise<any>

    removeRoom(roomId: number): Promise<any>

    updateMessage(roomId: number, messageId: string | number, message: Partial<Message>): Promise<any>

    replaceMessage(roomId: number, messageId: string | number, message: Message): Promise<any>

    fetchMessages(roomId: number, options: MessagePageOptions, limit: number): Promise<Message[]>

    fetchImageMessages(roomId: number, skip: number, limit: number, endTime?: number): Promise<Message[]>

    fetchMessagesAround(roomId: number, messageId: string, before: number, after: number): Promise<Message[]>

    resolveUnreadTargetMessageId(roomId: number, unreadCount: number): Promise<string | null>

    /** Count non-system messages from and including the specified message. */
    countUnreadMessagesFrom(roomId: number, messageId: string | number): Promise<number>

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

    addChatGroup(chatGroup: ChatGroup): Promise<any>

    removeChatGroup(name: string): Promise<any>

    updateChatGroup(name: string, chatGroup: Partial<ChatGroup>): Promise<any>

    getAllChatGroups(): Promise<ChatGroup[]>

    fetchMessagesBySender(roomId: number, senderId: string, skip: number, limit: number): Promise<Message[]>

    /** Use roomId 0 to search all conversations; global results include their original roomId. */
    searchMessages(roomId: number, keyword: string, skip: number, limit: number, senderId?: string): Promise<Message[]>

    /** 关闭数据库连接，释放资源。应在进程退出前调用。 */
    close(): Promise<void>
}
