export interface MessageCursor {
    time: number
    id: string | number
}

export interface MessagePageCursor extends MessageCursor {
    /** Disambiguates messages with the same ID in different rooms. */
    roomId: number
    /** Number of loaded results, used when the connected Bridge needs offset pagination. */
    offset: number
}

export type MessagePagination = number | MessagePageCursor
export type MessageSearchCursor = MessagePageCursor
export type MessageSearchPagination = MessagePagination

export default interface MessagePageOptions {
    /** Return messages strictly older than this cursor. */
    before?: MessageCursor

    /** Return messages strictly newer than this cursor. */
    after?: MessageCursor
}
