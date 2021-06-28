import {ipcRenderer} from "electron";
import Room from "../../types/Room";

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
export const fetchMessage = async (roomId: number, offset: number) => {
    return await ipcRenderer.invoke('fetchMessage', {roomId, offset})
}

