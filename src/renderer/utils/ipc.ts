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
    exit() {
        ipcRenderer.send('exit')
    },
    async getNick(): Promise<string> {
        return await ipcRenderer.invoke('getNick')
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
    async getSetting(kp: string | Array<string | number>) {
        return await ipcRenderer.invoke('getSetting', kp)
    },
    async setSetting(kp: string | Array<string | number>, value) {
        return await ipcRenderer.invoke('setSetting', kp, value)
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
    downloadGroupFile(gin: number, fid: string) {
        ipcRenderer.send('downloadGroupFile', gin, fid)
    },
    downloadFileByMessageData(data: { action: string, message: Message, room: Room }) {
        if (data.action === 'download') {
            if (data.message.file.type.includes('image')) {
                ipc.downloadImage(data.message.file.url)
            } else {
                if (data.room.roomId < 0 && data.message.file.fid)
                    ipc.downloadGroupFile(-data.room.roomId, data.message.file.fid)
                else
                    ipc.download(data.message.file.url, data.message.content)
            }
        }
    },
    sendGroupPoke(gin: number, uin: number) {
        ipcRenderer.send('sendGroupPoke', gin, uin)
    },
    deleteMessage(roomId: number, messageId: string) {
        ipcRenderer.send('deleteMessage', roomId, messageId)
    },
}
export default ipc
