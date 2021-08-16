import {BrowserWindow, shell} from 'electron'
import {clearCurrentRoomUnread, sendOnlineData} from '../ipc/botAndStorage'
import {getConfig} from './configManager'
import getWinUrl from '../../utils/getWinUrl'
import {updateTrayIcon} from './trayManager'
import path from 'path'

let loginWindow: BrowserWindow,
    mainWindow: BrowserWindow,
    requestWindow: BrowserWindow

export const loadMainWindow = () => {
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
    })

    if (loginWindow)
        loginWindow.destroy()

    if (winSize.max)
        mainWindow.maximize()

    mainWindow.on('close', (e) => {
        e.preventDefault()
        mainWindow.hide()
    })

    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.session.loadExtension(
            path.join(process.cwd(), "node_modules/vue-devtools/vender/")
        )
        mainWindow.minimize()
    }

    setTimeout(() => mainWindow.on('focus', async () => {
        clearCurrentRoomUnread()
        await updateTrayIcon()
    }), 5000)

    mainWindow.webContents.setWindowOpenHandler(details => {
        shell.openExternal(details.url)
        return {
            action: 'deny',
        }
    })

    mainWindow.webContents.on('did-finish-load', sendOnlineData)

    return mainWindow.loadURL(getWinUrl() + '#/main')
}
export const showLoginWindow = () => {
    if (loginWindow) {
        loginWindow.show()
        loginWindow.focus()
    } else {
        loginWindow = new BrowserWindow({
            height: 720,
            width: 450,
            maximizable: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
            },
        })

        if (process.env.NODE_ENV === 'development') {
            loginWindow.webContents.session.loadExtension(
                path.join(process.cwd(), "node_modules/vue-devtools/vender/")
            )
            loginWindow.minimize()
        }

        loginWindow.loadURL(getWinUrl() + '#/login')
    }
}
export const showRequestWindow = () => {
    if (requestWindow) {
        requestWindow.show()
        requestWindow.focus()
    } else {
        requestWindow = new BrowserWindow({
            width: 750,
            height: 600,
            webPreferences: {
                nodeIntegration: true,
                webSecurity: false,
                contextIsolation: false,
            }
        })

        if (process.env.NODE_ENV === 'development') {
            requestWindow.webContents.session.loadExtension(
                path.join(process.cwd(), "node_modules/vue-devtools/vender/")
            )
        }

        requestWindow.loadURL(getWinUrl() + "#/friendRequest")
    }
}
export const sendToLoginWindow = (channel: string, payload?: any) => {
    if (loginWindow)
        loginWindow.webContents.send(channel, payload)
}
export const sendToMainWindow = (channel: string, payload?: any) => {
    if (mainWindow)
        mainWindow.webContents.send(channel, payload)
}
export const sendToRequestWindow = (channel: string, payload?: any) => {
    if (requestWindow)
        requestWindow.webContents.send(channel, payload)
}
export const getMainWindow = () => mainWindow
export const showWindow = () => {
    if (mainWindow) {
        mainWindow.show()
        mainWindow.focus()
    } else if (loginWindow) {
        loginWindow.show()
        loginWindow.focus()
    } else if (requestWindow) {
        requestWindow.show()
        requestWindow.focus()
    }
}
export const destroyWindow = () => {
    if (mainWindow) mainWindow.destroy()
    if (loginWindow) loginWindow.destroy()
    if (requestWindow) requestWindow.destroy()
}
