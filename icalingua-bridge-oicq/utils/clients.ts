import Message from '@icalingua/types/Message'
import OnlineData from '@icalingua/types/OnlineData'
import Room from '@icalingua/types/Room'
import { broadcast } from '../providers/socketIoProvider'

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
    renewMessage(roomId: number, messageId: string, message: Message) {
        broadcast('renewMessage', { roomId, messageId, message })
    },
    renewMessageURL(messageId: string | number, URL: string) {
        broadcast('renewMessageURL', { messageId, URL })
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
    addMessageText(text: string) {
        broadcast('addMessageText', text)
    },
    notify(data: { title: string; message: string }) {
        broadcast('notifyMessage', data)
    },
}
