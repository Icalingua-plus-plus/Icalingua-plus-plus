import {BrowserWindow} from "electron";
import path from "path";

let loginWindow: BrowserWindow, mainWindow: BrowserWindow

export const ready = () => {
    loginWindow = new BrowserWindow({
        height: 720,
        width: 450,
        maximizable: false,
        webPreferences: {
            nodeIntegration: true,
            enableRemoteModule: true,
            contextIsolation: false
        },
        icon: path.join(__static, "/512x512.png"),
    });

}
