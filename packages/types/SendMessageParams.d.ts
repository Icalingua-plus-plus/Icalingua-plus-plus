import Room from './Room'
import AtCacheItem from './AtCacheElem'

/** 单张图片/音频附件 */
export interface ImageAttachment {
    /** base64 数据（data:image/xxx;base64,... 或 data:audio;base64,...） */
    b64?: string
    /** 图片/音频 URL 或路径 */
    url?: string
    /** Attachment position in the message text. */
    order?: number
}

type SendMessageParams = {
    content: string
    roomId?: number
    file?: {
        type: string
        path: string
        size: number
    }
    replyMessage?: any
    room?: Room
    /** 图片/音频附件列表 */
    media?: ImageAttachment[]
    at: AtCacheItem[]
    sticker?: boolean
    messageType?: string
}
export default SendMessageParams
