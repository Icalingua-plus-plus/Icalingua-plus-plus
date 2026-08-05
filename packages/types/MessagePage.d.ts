export interface MessageCursor {
    time: number
    id: string
    roomId?: number
}

export interface MessagePageOptions {
    before?: MessageCursor
    endTime?: number
}

export default MessagePageOptions

export interface MessageHistoryWindow {
    oldestTime: number
    endTime: number
    loadedCount: number
}
