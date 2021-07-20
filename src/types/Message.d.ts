import MessageMirai from './MessageMirai'

interface MessageFile {
    type: string;
    url: string;
    size?: number;
    name?: string;
    fid?: string
}

export default interface Message {
    avatar?: string
    mirai?: MessageMirai
    reveal?: boolean
    code?: string;
    at?: string | boolean;
    _id: string | number;
    senderId?: number;
    username: string;
    content: string;
    timestamp?: string;
    date?: string;
    role?: string;
    time?: number;
    deleted?: boolean | Date | number;
    file?: MessageFile;
    replyMessage?: Message,
    system?: boolean
}

interface MessageInIDB extends Message {
    roomId: number;
}
