import Room from "./Room";
import Message from "./Message";

export default interface StorageProvider {
    connect():Promise<void>

    updateRoom(roomId: string, room: object): void

    addMessage(roomId: string, message: object): void

    addRoom(room: object): void

    removeRoom(roomId: string): void

    updateMessage(roomId: string, messageId: string, message: object): void

    fetchMessages(roomId: string, skip: number, limit: number): Promise<Message[]>

    getAllRooms(): Promise<Room[]>
}
