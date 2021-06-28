import {ipcRenderer} from "electron";
import Room from "../../types/Room";

export const getAllRooms = async () => {
    return await ipcRenderer.invoke('getAllRooms') as Room[]
}
export const sendMessage = async (data) => {
    return await ipcRenderer.invoke('sendMessage', data)
}

