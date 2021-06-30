import {app, ipcMain, Menu, Tray} from 'electron'
import path from 'path'
import {getMainWindow} from './windowManager'
import exit from './exit'
import {getFirstUnreadRoom, getUnreadCount} from '../ipc/ipcBotAndStorage'
import settings from 'electron-settings'

let tray: Tray

export const createTray = () => {
    tray = new Tray(path.join(global.STATIC, '/256x256.png'))
    tray.setToolTip('Electron QQ')
    tray.on('click', () => {
        const window = getMainWindow()
        window.show()
        window.focus()
    })
    tray.setContextMenu(
        Menu.buildFromTemplate([
            {
                label: 'Open',
                type: 'normal',
                click: () => {
                    const window = getMainWindow()
                    window.show()
                    window.focus()
                },
            },
            {
                label: 'Exit',
                type: 'normal',
                click: exit,
            },
        ]),
    )

}
export const updateTrayIcon = async (roomName?: string) => {
    let p
    const unread = await getUnreadCount()
    const title = roomName
        ? roomName
        : 'Electron QQ'
    if (unread) {
        p = path.join(
            global.STATIC,
            await settings.get('darkTaskIcon') ? 'darknewmsg.png' : 'newmsg.png',
        )
        const newMsgRoom = await getFirstUnreadRoom()
        const extra = newMsgRoom ? (' : ' + newMsgRoom.roomName) : ''
        document.title = `(${unread}${extra}) ${title}`
    } else {
        p = path.join(global.STATIC, await settings.get('darkTaskIcon') ? 'dark.png' : '256x256.png')
        document.title = title
    }
    tray.setImage(p);
    app.setBadgeCount(unread);
}
