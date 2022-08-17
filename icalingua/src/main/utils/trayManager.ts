import Room from '@icalingua/types/Room'
import { app, Menu, MenuItem, nativeImage, Tray } from 'electron'
import path from 'path'
import getStaticPath from '../../utils/getStaticPath'
import {
    clearRoomUnread,
    getFirstUnreadRoom,
    getNickname,
    getUin,
    getUnreadCount,
    getUnreadRooms,
} from '../ipc/botAndStorage'
import { getConfig, saveConfigFile } from './configManager'
import exit from './exit'
import setPriority from './setPriority'
import { pushUnreadCount } from './socketIoSlave'
import ui from './ui'
import { getMainWindow } from './windowManager'

let tray: Tray

let darknewmsgIcon = nativeImage.createFromPath(path.join(getStaticPath(), 'darknewmsg.png'))
let newmsgIcon = nativeImage.createFromPath(path.join(getStaticPath(), 'newmsg.png'))
let darkIcon = nativeImage.createFromPath(path.join(getStaticPath(), 'dark.png'))
let lightIcon = nativeImage.createFromPath(path.join(getStaticPath(), '256x256.png'))

export const createTray = () => {
    tray = new Tray(path.join(getStaticPath(), 'trayTemplate.png'))
    tray.setToolTip(`Icalingua++: ${getNickname()} (${getUin()})\n通知优先级: ${getConfig().priority.toString()}`)
    tray.on('click', () => {
        const window = getMainWindow()
        window.show()
        window.focus()
    })
    return updateTrayMenu()
}
export const updateTrayMenu = async () => {
    tray.setToolTip(`Icalingua++: ${getNickname()} (${getUin()})\n通知优先级: ${getConfig().priority.toString()}`)
    const unreadRooms: Room[] = await getUnreadRooms()
    const menu = Menu.buildFromTemplate([
        {
            label: `${getNickname()} (${getUin()})`,
            enabled: false,
        },
        {
            label: '打开',
            type: 'normal',
            click: () => {
                const window = getMainWindow()
                window.show()
                window.focus()
            },
        },
    ])
    menu.append(new MenuItem({ type: 'separator' }))
    if (unreadRooms.length) {
        for (const unreadRoom of unreadRooms) {
            menu.append(
                new MenuItem({
                    label: `${unreadRoom.roomName} (${unreadRoom.unreadCount})`,
                    click() {
                        const window = getMainWindow()
                        window.show()
                        window.focus()
                        ui.chroom(unreadRoom.roomId)
                    },
                }),
            )
            menu.append(
                new MenuItem({
                    label:
                        unreadRoom.lastMessage.content.length > 25
                            ? `${unreadRoom.lastMessage.content.slice(0, 25)}...`
                            : unreadRoom.lastMessage.content,
                    enabled: false,
                }),
            )
        }
        menu.append(
            new MenuItem({
                label: '全部已读',
                click() {
                    unreadRooms.forEach((e) => clearRoomUnread(e.roomId))
                },
            }),
        )
        menu.append(new MenuItem({ type: 'separator' }))
    }
    menu.append(
        new MenuItem({
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
        }),
    )
    process.platform !== 'darwin' &&
        menu.append(
            new MenuItem({
                label: '深色图标',
                type: 'checkbox',
                checked: getConfig().darkTaskIcon,
                click(item) {
                    getConfig().darkTaskIcon = item.checked
                    updateTrayIcon()
                    saveConfigFile()
                },
            }),
        )
    menu.append(
        new MenuItem({
            label: '退出',
            type: 'normal',
            click: exit,
        }),
    )
    tray.setContextMenu(menu)
}
export const updateTrayIcon = async () => {
    let p
    const unread = await getUnreadCount()
    const title = ui.getSelectedRoomName() ? ui.getSelectedRoomName() + ' — Icalingua++' : 'Icalingua++'
    if (unread) {
        p = getConfig().darkTaskIcon ? darknewmsgIcon : newmsgIcon
        const newMsgRoom = await getFirstUnreadRoom()
        const extra = newMsgRoom ? ' : ' + newMsgRoom.roomName : ''
        getMainWindow().title = `(${unread}${extra}) ${title}`
    } else {
        p = getConfig().darkTaskIcon ? darkIcon : lightIcon
        getMainWindow().title = title
    }
    tray.setTitle(unread === 0 ? '' : `${unread}`)
    process.platform !== 'darwin' && tray.setImage(p)
    app.setBadgeCount(unread)
    pushUnreadCount(unread)
    updateTrayMenu()
}
