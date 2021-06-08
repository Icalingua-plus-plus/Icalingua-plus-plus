interface MessageFile {
    type: string;
    url: string;
    size?: number;
    name?: string;
}

export default interface Message {
    _id: string;
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
}

interface MessageInidb extends Message{
    roomId: number;
}
