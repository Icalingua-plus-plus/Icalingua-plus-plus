import Room from './Room'
import AtCacheItem from './AtCacheElem'

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
    b64img?: string
    imgpath?: string
    at: AtCacheItem[]
    sticker?: boolean
    messageType?: string
}
export default SendMessageParams
