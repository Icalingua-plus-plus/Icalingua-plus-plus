import Room from '../types/Room'
import { broadcast } from '../providers/socketIoProvider'
import Message from '../types/Message'
import OnlineData from '../types/OnlineData'

export default {
    updateRoom(room: Room) {
        broadcast('updateRoom', room)
    },
    addMessage(roomId: number, message: Message) {
        broadcast('addMessage', { roomId, message })
    },
    deleteMessage(messageId: string) {
        broadcast('deleteMessage', messageId)
    },
    setOnline() {
        broadcast('setOnline')
    },
    setOffline(message: string) {
        broadcast('setOffline', message)
    },
    sendOnlineData(data: OnlineData) {
        broadcast('onlineData', data)
    },
    setShutUp(isShutUp: boolean) {
        broadcast('setShutUp', isShutUp)
    },
    message(msg: string) {
        broadcast('message', msg)
    },
    messageError(msg: string) {
        broadcast('messageError', msg)
    },
    messageSuccess(msg: string) {
        broadcast('messageSuccess', msg)
    },
    setAllRooms(rooms: Room[]) {
        broadcast('setAllRooms', rooms)
    },
    closeLoading() {
        broadcast('closeLoading')
    },
    notifyError(msg: { title: string; message: string }) {
        broadcast('notifyError', msg)
    },
    revealMessage(messageId: string | number) {
        broadcast('revealMessage', messageId)
    },
    setMessages(roomId: number, messages: Message[]) {
        broadcast('setMessages', { roomId, messages })
    },
    sendAddRequest(data) {
        broadcast('sendAddRequest', data)
    },
    syncRead(roomId: number) {
        broadcast('syncRead', roomId)
    },
}
