import {BrowserWindow} from 'electron'
import path from 'path'
import {clearCurrentRoomUnread} from '../ipc/botAndStorage'
import {getConfig} from './configManager'
import getWinUrl from '../../utils/getWinUrl'
import getStaticPath from '../../utils/getStaticPath'

let loginWindow: BrowserWindow, mainWindow: BrowserWindow

export const loadMainWindow = async () => {
    //start main window
    const winSize = getConfig().winSize
    mainWindow = new BrowserWindow({
        height: winSize.height,
        width: winSize.width,
        webPreferences: {
            nodeIntegration: true,
            webSecurity: false,
            contextIsolation: false,
        },
        icon: path.join(getStaticPath(), '/512x512.png'),
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

    mainWindow.loadURL(getWinUrl() + '#/main')
}
export const showLoginWindow = () => {
    loginWindow = new BrowserWindow({
        height: 720,
        width: 450,
        maximizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        icon: path.join(getStaticPath(), '/512x512.png'),
    })

    loginWindow.loadURL(getWinUrl() + '#/login')
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
