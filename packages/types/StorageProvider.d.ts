import Room from './Room'
import Message from './Message'
import IgnoreChatInfo from './IgnoreChatInfo'
import ChatGroup from './ChatGroup'
import MessagePageOptions from './MessagePage'
import DatabaseUpgradeProgress from './DatabaseUpgradeProgress'

export default interface StorageProvider {
    connect(): Promise<void>

    /** Optional progress callback for disposable database indexes and upgrades. */
    onUpgradeProgress?: (progress: DatabaseUpgradeProgress) => void

    /** Whether the disposable message search index has finished building. */
    isMessageSearchIndexReady?(): boolean

    /** Run the message search index consistency check on demand. */
    validateMessageSearchIndex?(): Promise<void>

    updateRoom(roomId: number, room: Partial<Room>): Promise<any>

    addMessage(roomId: number, message: Message): Promise<any>

    addRoom(room: Room): Promise<any>

    removeRoom(roomId: number): Promise<any>

    updateMessage(roomId: number, messageId: string | number, message: Partial<Message>): Promise<any>

    replaceMessage(roomId: number, messageId: string | number, message: Message): Promise<any>

    fetchMessages(roomId: number, options: MessagePageOptions, limit: number): Promise<Message[]>

    fetchImageMessages(roomId: number, options: MessagePageOptions, limit: number): Promise<Message[]>

    fetchMessagesInTimeRange(roomId: number, startTime?: number, endTime?: number, limit?: number): Promise<Message[]>

    fetchMessagesAround(roomId: number, messageId: string, before: number, after: number): Promise<Message[]>

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

    fetchMessagesBySender(
        roomId: number,
        senderId: string,
        options: MessagePageOptions,
        limit: number,
    ): Promise<Message[]>

    /** Use roomId 0 to search all conversations; global results include their original roomId. */
    searchMessages(roomId: number, keyword: string, options: MessagePageOptions, limit: number): Promise<Message[]>

    /** 关闭数据库连接，释放资源。应在进程退出前调用。 */
    close(): Promise<void>
}
