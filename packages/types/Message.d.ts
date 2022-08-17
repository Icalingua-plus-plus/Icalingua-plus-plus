import MessageMirai from './MessageMirai'

interface MessageFile {
    type: string
    url: string
    size?: number
    name?: string
    fid?: string
}

export default interface Message {
    _id: string | number
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
}
