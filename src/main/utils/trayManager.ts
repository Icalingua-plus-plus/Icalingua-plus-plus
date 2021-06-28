import {ipcMain, Tray} from "electron";
import path from "path";

let tray: Tray

export const createTray = () => {
    tray = new Tray(path.join(global.STATIC, "/256x256.png"))
}
