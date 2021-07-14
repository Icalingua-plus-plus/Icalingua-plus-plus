import {app, Menu, Tray} from 'electron'
import path from 'path'
import {getMainWindow} from './windowManager'
import exit from './exit'
import {getFirstUnreadRoom, getUnreadCount} from '../ipc/botAndStorage'
import {getConfig, saveConfigFile} from './configManager'
import getStaticPath from '../../utils/getStaticPath'
import {pushUnreadCount} from './socketIoSlave'
import openImage from '../ipc/openImage'
import setPriority from './setPriority'

let tray: Tray

export const createTray = () => {
    tray = new Tray(path.join(
        getStaticPath(),
        getConfig().darkTaskIcon ? 'darknewmsg.png' : 'newmsg.png',
    ))
    tray.setToolTip('Electron QQ')
    tray.on('click', () => {
        const window = getMainWindow()
        window.show()
        window.focus()
    })
    updateTrayMenu()
}
export const updateTrayMenu = () => {
    tray.setContextMenu(
        Menu.buildFromTemplate([
            {
                label: '打开',
                type: 'normal',
                click: () => {
                    const window = getMainWindow()
                    window.show()
                    window.focus()
                },
            },
            {
                label: '通知优先级',
                submenu: [
                    {
                        type: 'radio',
                        label: '1',
                        checked: getConfig().priority === 1,
                        click: () => setPriority(1),
                    },
                    {
                        type: 'radio',
                        label: '2',
                        checked: getConfig().priority === 2,
                        click: () => setPriority(2),
                    },
                    {
                        type: 'radio',
                        label: '3',
                        checked: getConfig().priority === 3,
                        click: () => setPriority(3),
                    },
                    {
                        type: 'radio',
                        label: '4',
                        checked: getConfig().priority === 4,
                        click: () => setPriority(4),
                    },
                    {
                        type: 'radio',
                        label: '5',
                        checked: getConfig().priority === 5,
                        click: () => setPriority(5),
                    },
                ],
            },
            {
                label: '深色图标',
                type: 'checkbox',
                checked: getConfig().darkTaskIcon,
                click(item) {
                    getConfig().darkTaskIcon = item.checked
                    updateTrayIcon()
                    saveConfigFile()
                },
            },
            {
                label: '退出',
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
        ? roomName + ' — Electron QQ'
        : 'Electron QQ'
    if (unread) {
        p = path.join(
            getStaticPath(),
            getConfig().darkTaskIcon ? 'darknewmsg.png' : 'newmsg.png',
        )
        const newMsgRoom = await getFirstUnreadRoom()
        const extra = newMsgRoom ? (' : ' + newMsgRoom.roomName) : ''
        getMainWindow().title = `(${unread}${extra}) ${title}`
    } else {
        p = path.join(getStaticPath(), getConfig().darkTaskIcon ? 'dark.png' : '256x256.png')
        getMainWindow().title = title
    }
    tray.setImage(p)
    app.setBadgeCount(unread)
    pushUnreadCount(unread)
}
