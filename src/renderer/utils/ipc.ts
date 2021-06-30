import {ipcRenderer} from 'electron'
import Room from '../../types/Room'
import Message from '../../types/Message'

export default {
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
    setSelectedRoomId(roomId: number) {
        ipcRenderer.send('setSelectedRoomId', roomId)
    },
    async getSetting(kp: string | Array<string | number>) {
        return await ipcRenderer.invoke('getSetting', kp)
    },
    async setSetting(kp: string | Array<string | number>, value) {
        return await ipcRenderer.invoke('setSetting', kp, value)
    },
    async updateRoom(roomId: number, room: object) {
        return await ipcRenderer.invoke('updateRoom', roomId, room)
    },
    async getVersion(): Promise<string> {
        return await ipcRenderer.invoke('getVersion')
    },
    download(url: string, out: string, dir: string){
        ipcRenderer.invoke('download', url, out, dir)
    }
}
