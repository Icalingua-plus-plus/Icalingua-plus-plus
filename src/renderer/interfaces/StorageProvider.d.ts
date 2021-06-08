import Room from "./Room";
import Message from "./Message";

export default interface StorageProvider {
    connect():Promise<void>

    updateRoom(roomId: number, room: object): void

    addMessage(roomId: number, message: object): void

    addRoom(room: object): void

    removeRoom(roomId: number): void

    updateMessage(roomId: number, messageId: string, message: object): void

    fetchMessages(roomId: number, skip: number, limit: number): Promise<Message[]>

    getMessage(roomId: number, messageId: string): Promise<Message>

    addMessages(roomId: number, messages: Message[]):Promise<any>

    getAllRooms(): Promise<Room[]>
}
