import MessageMirai from './MessageMirai'

interface MessageFile {
    type: string
    url: string
    /**
     * UTF-16 offset in `Message.content` where this attachment appeared.
     * Older messages omit it and keep the legacy media-before-text layout.
     */
    order?: number
    size?: number
    name?: string
    fid?: string
    isFace?: boolean // 或者说是 sticker
    height?: number
    width?: number
}

export default interface Message {
    _id: string | number
    /** Present when a message is returned from a cross-room query. */
    roomId?: number
    /** Display metadata attached to cross-room query results. */
    _roomName?: string
    senderId?: number
    username: string
    content: string
    code?: string
    timestamp?: string
    date?: string
    role?: string
    file?: MessageFile
    files: MessageFile[]
    time?: number
    replyMessage?: Message
    at?: boolean | 'all'
    deleted?: boolean
    system?: boolean
    mirai?: MessageMirai
    reveal?: boolean
    flash?: boolean
    title?: string
    anonymousId?: number
    anonymousflag?: string
    hide?: boolean
    bubble_id?: number
    subid?: number
    head_img?: string
    recallInfo?: string
}
