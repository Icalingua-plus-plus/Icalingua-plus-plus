import {ipcRenderer} from 'electron'
import Room from '../../types/Room'
import Message from '../../types/Message'

const ipc = {
    async getAllRooms() {
        return await ipcRenderer.invoke('getAllRooms') as Room[]
    },
    async sendMessage(data) {
        return await ipcRenderer.invoke('sendMessage', data)
    },
    async isOnline(): Promise<boolean> {
        return await ipcRenderer.invoke('isOnline')
    },
    async getNick(): Promise<string> {
        return await ipcRenderer.invoke('getNick')
    },
    async getStorePath(): Promise<string> {
        return await ipcRenderer.invoke('getStorePath')
    },
    async getUin(): Promise<number> {
        return await ipcRenderer.invoke('getUin')
    },
    async fetchMessage(roomId: number, offset: number): Promise<Array<Message>> {
        return await ipcRenderer.invoke('fetchMessage', {roomId, offset})
    },
    setSelectedRoom(roomId: number, name: string) {
        ipcRenderer.send('setSelectedRoom', roomId, name)
    },
    async getAccount() {
        return await ipcRenderer.invoke('getAccount')
    },
    async getPriority() {
        return await ipcRenderer.invoke('getPriority')
    },
    //todo 这俩玩意要封装的更细的说
    async updateRoom(roomId: number, room: object) {
        return await ipcRenderer.invoke('updateRoom', roomId, room)
    },
    async updateMessage(roomId: number, messageId: string, message: object) {
        return await ipcRenderer.invoke('updateMessage', roomId, messageId, message)
    },
    async getVersion(): Promise<string> {
        return await ipcRenderer.invoke('getVersion')
    },
    download(url: string, out: string, dir?: string) {
        ipcRenderer.send('download', url, out, dir)
    },
    downloadImage(url: string) {
        ipcRenderer.send('downloadImage', url)
    },
    downloadFileByMessageData(data: { action: string, message: Message, room: Room }) {
        ipcRenderer.send('downloadFileByMessageData', data)

    },
    sendGroupPoke(gin: number, uin: number) {
        ipcRenderer.send('sendGroupPoke', gin, uin)
    },
    reLogin() {
        ipcRenderer.send('reLogin')
    },
    updatePriority(level: 1 | 2 | 3 | 4 | 5) {
        ipcRenderer.send('updatePriority', level)
    },
    popupRoomMenu(roomId: number) {
        ipcRenderer.send('popupRoomMenu', roomId)
    },
    popupAvatarMenu(message: Message) {
        ipcRenderer.send('popupAvatarMenu', message)
    },
    popupTextAreaMenu() {
        ipcRenderer.send('popupTextAreaMenu')
    },
    popupContactMenu(remark?: string, name?: string, displayId?: number) {
        ipcRenderer.send('popupContactMenu', remark, name, displayId)
    },
    popupMessageMenu(room: Room, message: Message, sect?: string, history?: boolean) {
        ipcRenderer.send('popupMessageMenu', room, message, sect, history)
    },
    addRoom(room: Room) {
        ipcRenderer.send('addRoom', room)
    },
    openForward(resId: string) {
        ipcRenderer.send('openForward', resId)
    },
}
export default ipc
