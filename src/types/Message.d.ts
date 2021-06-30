interface MessageFile {
    type: string;
    url: string;
    size?: number;
    name?: string;
    fid?: string
}

export default interface Message {
    code?: string;
    at?: string | boolean;
    _id: string | number;
    senderId: number;
    username: string;
    content: string;
    timestamp: string;
    date: string;
    role?: string;
    time?: number;
    file?: MessageFile;
    replyMessage?: {
        _id: string,
        username: string,
        content: string,
        file?: MessageFile
    },
    system?: boolean
}

interface MessageInIDB extends Message {
    roomId: number;
}
