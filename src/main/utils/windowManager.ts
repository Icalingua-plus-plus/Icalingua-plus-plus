import {BrowserWindow, screen} from 'electron'
import path from 'path'
import settings from 'electron-settings'
import {clearCurrentRoomUnread} from '../ipc/ipcBotAndStorage'

let loginWindow: BrowserWindow, mainWindow: BrowserWindow

export const loadMainWindow = async () => {
    //start main window
    let winSize: WinSize
    if (!settings.hasSync('winSize')) {
        const size = screen.getPrimaryDisplay().size
        winSize = {
            height: size.height - 200,
            width: size.width - 300,
            max: false,
        }
        if (winSize.width > 1440)
            winSize.width = 1440
    } else {
        winSize = <WinSize>await settings.get('winSize')
    }
    mainWindow = new BrowserWindow({
        height: winSize.height,
        width: winSize.width,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            enableRemoteModule: true,
            webSecurity: false,
            contextIsolation: false,
        },
        icon: path.join(global.STATIC, '/512x512.png'),
    })

    loginWindow.destroy()

    if (winSize.max)
        mainWindow.maximize()

    if (process.env.NODE_ENV === 'development')
        mainWindow.webContents.session.loadExtension(
            '/usr/lib/node_modules/vue-devtools/vender/',
        )

    mainWindow.on('close', (e) => {
        e.preventDefault()
        mainWindow.hide()
    })

    mainWindow.on('focus', clearCurrentRoomUnread)

    mainWindow.loadURL(global.winURL + '#/main')
}
export const ready = () => {
    loginWindow = new BrowserWindow({
        height: 720,
        width: 450,
        maximizable: false,
        webPreferences: {
            nodeIntegration: true,
            enableRemoteModule: true,
            contextIsolation: false,
        },
        icon: path.join(global.STATIC, '/512x512.png'),
    })

    loginWindow.loadURL(global.winURL + '#/login')
}
export const sendToLoginWindow = (channel: string, payload?: any) => {
    if (loginWindow)
        loginWindow.webContents.send(channel, payload)
}
export const sendToMainWindow = (channel: string, payload?: any) => {
    if (mainWindow)
        mainWindow.webContents.send(channel, payload)
}
export const getMainWindow = () => mainWindow
export const showWindow = () => {
    if (mainWindow) {
        mainWindow.show()
        mainWindow.focus()
    } else if (loginWindow) {
        loginWindow.show()
        loginWindow.focus()
    }
}
export const destroyWindow = () => {
    if (mainWindow) mainWindow.destroy()
    if (loginWindow) loginWindow.destroy()
}
