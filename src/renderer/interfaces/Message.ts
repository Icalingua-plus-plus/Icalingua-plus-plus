export default interface Message{
    _id: string;
    senderId: number;
    username: string;
    content: string;
    timestamp: string;
    date: string;
    role?: string
    time?: number;
    file?:{
        type: string
        url: string
        size?: number,
        name?: string
    }
}
