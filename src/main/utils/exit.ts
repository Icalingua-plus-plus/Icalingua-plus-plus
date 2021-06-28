import {getMainWindow} from "./windowManager";
import {ipcMain} from "electron";

const exit = () => {
    const win = getMainWindow()
    const size = win.getSize()
    global.glodb.set('winSize', {
        width: size[0],
        height: size[1],
        max: win.isMaximized()
    }).write()
    win.destroy();
}
ipcMain.on('exit', exit)
export default exit
