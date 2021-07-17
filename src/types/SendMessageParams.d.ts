import Room from './Room'

type SendMessageParams = {
    content: string,
    roomId?: number,
    file?: {
        type: string,
        path: string,
        size: number
    },
    replyMessage?: any,
    room?: Room,
    b64img?: string,
    imgpath?: string
}
export default SendMessageParams
