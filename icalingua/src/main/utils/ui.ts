import IgnoreChatInfo from '@icalingua/types/IgnoreChatInfo'
import Message from '@icalingua/types/Message'
import OnlineData from '@icalingua/types/OnlineData'
import Room from '@icalingua/types/Room'
import ChatGroup from '@icalingua/types/ChatGroup'
import { ipcMain } from 'electron'
import { updateAppMenu } from '../ipc/menuManager'
import { getConfig } from './configManager'
import { updateTrayIcon } from './trayManager'
import { sendToMainWindow, sendToRequestWindow } from './windowManager'
import removeGroupNameEmotes from '../../utils/removeGroupNameEmotes'

let selectedRoomId = 0
let selectedRoomName = ''
ipcMain.on('setSelectedRoom', (_, id: number, name: string) => {
    selectedRoomId = id
    selectedRoomName = name
    updateAppMenu()
    if (id === 0) updateTrayIcon()
})

export default {
    openGroupMemberPanel(shown: boolean, gin: number = 0) {
        sendToMainWindow('openGroupMemberPanel', { shown, gin })
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
    notifyProgress(id: string, string: string) {
        sendToMainWindow('notifyProgress', { id, string })
        return {
            value: (value: number) => sendToMainWindow('notifyProgressValue', { id, value }),
            close: () => sendToMainWindow('notifyProgressClose', id),
        }
    },
    message(string: string) {
        if (getConfig().silentFetchHistory && string.endsWith(' 条消息')) return
        sendToMainWindow('message', string)
    },
    messageError(string: string) {
        sendToMainWindow('messageError', string)
    },
    messageSuccess(string: string) {
        if (getConfig().silentFetchHistory && (string.endsWith(' 条消息') || string === '开始拉取消息')) return
        if (getConfig().removeGroupNameEmotes && string.endsWith(' 条消息')) string = removeGroupNameEmotes(string)
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
    setAllChatGroups(chatGroups: ChatGroup[]) {
        sendToMainWindow('setAllChatGroups', chatGroups)
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
    setClearRoomsBehavior(behavior: 'AllUnpined' | '1WeekAgo' | '1DayAgo' | '1HourAgo' | 'disabled') {
        sendToMainWindow('setClearRoomsBehavior', behavior)
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
    setDisableChatGroupsSeeting(a: boolean) {
        sendToMainWindow('setDisableChatGroupsSeeting', a)
    },
    setDisableChatGroupsRedPointSeeting(a: boolean) {
        sendToMainWindow('setDisableChatGroupsRedPointSeeting', a)
    },
    uploadProgress(progress: string) {
        sendToMainWindow('uploadProgress', progress)
    },
    setLocalImageViewerByDefault(enable: boolean) {
        sendToMainWindow('setLocalImageViewerByDefault', enable)
    },
    setDisableQLottie(enable: boolean) {
        sendToMainWindow('setDisableQLottie', enable)
    },
    useSinglePanel(enable: boolean) {
        sendToMainWindow('useSinglePanel', enable)
    },
    setRemoveGroupNameEmotes(enable: boolean) {
        sendToMainWindow('setRemoveGroupNameEmotes', enable)
    },
}
