import {getMainWindow} from "./windowManager";
import {ipcMain} from "electron";
import settings from 'electron-settings'

const exit = () => {
    const win = getMainWindow()
    const size = win.getSize()
    settings.set('winSize', {
        width: size[0],
        height: size[1],
        max: win.isMaximized()
    })
    win.destroy();
}
ipcMain.on('exit', exit)
export default exit
