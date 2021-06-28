import {ipcMain, Menu, Tray} from "electron";
import path from "path";
import {getMainWindow} from "./windowManager";
import exit from "./exit";

let tray: Tray

export const createTray = () => {
    tray = new Tray(path.join(global.STATIC, "/256x256.png"))
    tray.setToolTip("Electron QQ");
    tray.on("click", () => {
        const window = getMainWindow()
        window.show();
        window.focus();
    });
    tray.setContextMenu(
        Menu.buildFromTemplate([
            {
                label: "Open",
                type: "normal",
                click: () => {
                    const window = getMainWindow()
                    window.show();
                    window.focus();
                },
            },
            {
                label: "Exit",
                type: "normal",
                click: exit,
            },
        ])
    );

}
