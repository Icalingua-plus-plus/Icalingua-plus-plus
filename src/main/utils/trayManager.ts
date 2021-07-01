import {app, Menu, Tray} from 'electron'
import path from 'path'
import {getMainWindow} from './windowManager'
import exit from './exit'
import {getFirstUnreadRoom, getUnreadCount} from '../ipc/botAndStorage'
import {getConfig} from './configManager'

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
            getConfig().darkTaskIcon ? 'darknewmsg.png' : 'newmsg.png',
        )
        const newMsgRoom = await getFirstUnreadRoom()
        const extra = newMsgRoom ? (' : ' + newMsgRoom.roomName) : ''
        getMainWindow().title = `(${unread}${extra}) ${title}`
    } else {
        p = path.join(global.STATIC, getConfig().darkTaskIcon ? 'dark.png' : '256x256.png')
        getMainWindow().title = title
    }
    tray.setImage(p)
    app.setBadgeCount(unread)
}
