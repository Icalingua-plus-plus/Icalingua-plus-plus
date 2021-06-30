import {ipcRenderer} from "electron";
import Room from "../../types/Room";
import {app} from '@electron/remote';

export const getAllRooms = async () => {
    return await ipcRenderer.invoke('getAllRooms') as Room[]
}
export const sendMessage = async (data) => {
    return await ipcRenderer.invoke('sendMessage', data)
}
export const exit = () => {
    ipcRenderer.send('exit')
}
export const isOnline = async (): Promise<boolean> => {
    return await ipcRenderer.invoke('isOnline')
}
export const getNick = async (): Promise<string> => {
    return await ipcRenderer.invoke('getNick')
}
export const getUin = async (): Promise<number> => {
    return await ipcRenderer.invoke('getUin')
}
export const fetchMessage = async (roomId: number, offset: number) => {
    return await ipcRenderer.invoke('fetchMessage', {roomId, offset})
}
export const setSelectedRoomId = (roomId: number) => {
    ipcRenderer.send('setSelectedRoomId', roomId)
}
export const getSetting = async (kp: string | Array<string | number>) => {
    return await ipcRenderer.invoke('getSetting', kp)
}
export const setSetting = async (kp: string | Array<string | number>, value) => {
    return await ipcRenderer.invoke('setSetting', kp, value)
}
//todo remote 也是 ipc！
export const getVersion = app.getVersion

