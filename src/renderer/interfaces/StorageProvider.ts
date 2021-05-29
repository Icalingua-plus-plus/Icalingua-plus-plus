import Room from "./Room";
import Message from "./Message";

export default interface StorageProvider {
    updateRoom(room: Room): void
    addMessage(roomId: string, message:Message):void
}
