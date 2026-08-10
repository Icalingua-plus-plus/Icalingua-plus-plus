export interface MessageCursor {
    time: number
    id: string | number
}

export default interface MessagePageOptions {
    /** Return messages strictly older than this cursor. */
    before?: MessageCursor

    /** Return messages strictly newer than this cursor. */
    after?: MessageCursor
}
