import {sendToMainWindow} from "./windowManager";
import Room from "../../types/Room";
import Message from "../../types/Message";

export default {
    closeLoading() {
        sendToMainWindow('closeLoading')
    },
    notify(data: { title: string, message: string }) {
        sendToMainWindow('notify', data)
    },
    notifyError(data: { title: string, message: string }) {
        sendToMainWindow('notifyError', data)
    },
    notifySuccess(data: { title: string, message: string }) {
        sendToMainWindow('notifySuccess', data)
    },
    message(string: string) {
        sendToMainWindow('message', string)
    },
    messageError(string: string) {
        sendToMainWindow('messageError', string)
    },
    messageSuccess(string: string) {
        sendToMainWindow('messageSuccess', string)
    },
    updateRoom(room: Room) {
        sendToMainWindow('messageSuccess', room)
    },
    setShutUp(isShutUp: boolean) {
        sendToMainWindow('setShutUp', isShutUp)
    },
    addMessage(roomId: number, message: Message) {
        sendToMainWindow('messageSuccess', {roomId, message})
    },
}
