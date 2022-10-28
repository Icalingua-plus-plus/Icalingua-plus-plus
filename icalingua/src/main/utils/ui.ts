import IgnoreChatInfo from '@icalingua/types/IgnoreChatInfo'
import Message from '@icalingua/types/Message'
import OnlineData from '@icalingua/types/OnlineData'
import Room from '@icalingua/types/Room'
import { ipcMain } from 'electron'
import { updateAppMenu } from '../ipc/menuManager'
import { getConfig } from './configManager'
import { updateTrayIcon } from './trayManager'
import { sendToMainWindow, sendToRequestWindow } from './windowManager'

let selectedRoomId = 0
let selectedRoomName = ''
ipcMain.on('setSelectedRoom', (_, id: number, name: string) => {
    selectedRoomId = id
    selectedRoomName = name
    updateAppMenu()
    if (id === 0) updateTrayIcon()
})

export default {
    openGroupMemberPanel(shown: boolean) {
        sendToMainWindow('openGroupMemberPanel', shown)
    },
    startForward(_id: string) {
        sendToMainWindow('startForward', _id)
    },
    confirmDeleteMessage(roomId: number, messageId: string) {
        sendToMainWindow('confirmDeleteMessage', { roomId, messageId })
    },
    confirmIgnoreChat(data: IgnoreChatInfo) {
        sendToMainWindow('confirmIgnoreChat', data)
    },
    confirmDeleteSticker(filename: string) {
        sendToMainWindow('confirmDeleteSticker', filename)
    },
    moveSticker(filename: string) {
        sendToMainWindow('moveSticker', filename)
    },
    confirmDeleteStickerDir(dirname: string) {
        sendToMainWindow('confirmDeleteStickerDir', dirname)
    },
    sendRps() {
        sendToMainWindow('sendRps')
    },
    sendDice() {
        sendToMainWindow('sendDice')
    },
    closeLoading() {
        sendToMainWindow('closeLoading')
    },
    notify(data: { title: string; message: string }) {
        sendToMainWindow('notify', data)
    },
    notifyError(data: { title: string; message: string }) {
        sendToMainWindow('notifyError', data)
    },
    notifySuccess(data: { title: string; message: string }) {
        sendToMainWindow('notifySuccess', data)
    },
    message(string: string) {
        if (getConfig().silentFetchHistory && string.startsWith('已拉取')) return
        sendToMainWindow('message', string)
    },
    messageError(string: string) {
        sendToMainWindow('messageError', string)
    },
    messageSuccess(string: string) {
        if (getConfig().silentFetchHistory && (string.startsWith('已拉取') || string === '开始拉取消息')) return
        sendToMainWindow('messageSuccess', string)
    },
    updateRoom(room: Room) {
        sendToMainWindow('updateRoom', room)
    },
    setShutUp(isShutUp: boolean) {
        sendToMainWindow('setShutUp', isShutUp)
    },
    addMessage(roomId: number, message: Message) {
        sendToMainWindow('addMessage', { roomId, message })
    },
    chroom(roomId: number) {
        sendToMainWindow('chroom', roomId)
    },
    deleteMessage(messageId: string | number) {
        sendToMainWindow('deleteMessage', messageId)
    },
    hideMessage(messageId: string | number) {
        sendToMainWindow('hideMessage', messageId)
    },
    revealMessage(messageId: string | number) {
        sendToMainWindow('revealMessage', messageId)
    },
    renewMessage(roomId: number, messageId: string, message: Message) {
        sendToMainWindow('renewMessage', { roomId, messageId, message })
    },
    renewMessageURL(messageId: string | number, URL: string) {
        sendToMainWindow('renewMessageURL', { messageId, URL })
    },
    setOnline() {
        sendToMainWindow('setOnline')
    },
    setOffline(message: string) {
        sendToMainWindow('setOffline', message)
    },
    clearCurrentRoomUnread() {
        sendToMainWindow('clearCurrentRoomUnread')
    },
    clearRoomUnread(roomId: number) {
        sendToMainWindow('clearRoomUnread', roomId)
    },
    setAllRooms(rooms: Room[]) {
        sendToMainWindow('setAllRooms', rooms)
    },
    setMessages(messages: Message[]) {
        sendToMainWindow('setMessages', messages)
    },
    replyMessage(message: Message) {
        sendToMainWindow('replyMessage', message)
    },
    startChat(id: number, name: string) {
        sendToMainWindow('startChat', { id, name })
    },
    closePanel() {
        sendToMainWindow('closePanel')
    },
    updatePriority(lev: 1 | 2 | 3 | 4 | 5) {
        sendToMainWindow('updatePriority', lev)
    },
    addHistoryCount(count: number) {
        sendToMainWindow('addHistoryCount', count)
    },
    clearHistoryCount() {
        sendToMainWindow('clearHistoryCount')
    },
    stopGettingHistory() {
        sendToMainWindow('stopGettingHistory')
    },
    sendOnlineData(data: OnlineData) {
        sendToMainWindow('gotOnlineData', data)
    },
    addMessageText(text: string) {
        sendToMainWindow('addMessageText', text)
    },
    getSelectedRoomId: () => selectedRoomId,
    getSelectedRoomName: () => selectedRoomName,
    sendAddRequest(data: any) {
        sendToMainWindow('sendAddRequest', data)
        sendToRequestWindow('sendAddRequest', data)
    },
    setKeyToSendMessage(key: 'Enter' | 'CtrlEnter' | 'ShiftEnter') {
        sendToMainWindow('setKeyToSendMessage', key)
    },
    pasteGif(url: string) {
        sendToMainWindow('pasteGif', url)
    },
    setOptimizeMethodSetting(method: string) {
        sendToMainWindow('setOptimizeMethodSetting', method)
    },
    setHideChatImageByDefault(enabled: boolean) {
        sendToMainWindow('setHideChatImageByDefault', enabled)
    },
}
