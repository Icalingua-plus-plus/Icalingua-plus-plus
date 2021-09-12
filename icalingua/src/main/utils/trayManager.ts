import {app, Menu, MenuItem, Tray} from 'electron'
import path from 'path'
import {getMainWindow} from './windowManager'
import exit from './exit'
import {getUin, getNickname, getFirstUnreadRoom, getUnreadCount, getUnreadRooms} from '../ipc/botAndStorage'
import {getConfig, saveConfigFile} from './configManager'
import getStaticPath from '../../utils/getStaticPath'
import {pushUnreadCount} from './socketIoSlave'
import setPriority from './setPriority'
import ui from './ui'

let tray: Tray

export const createTray = () => {
    tray = new Tray(path.join(
        getStaticPath(),
        getConfig().darkTaskIcon ? 'darknewmsg.png' : 'newmsg.png',
    ))
    tray.setToolTip('Icalingua')
    tray.on('click', () => {
        const window = getMainWindow()
        window.show()
        window.focus()
    })
    updateTrayMenu()
}
export const updateTrayMenu = async () => {
    const unreadRooms = await getUnreadRooms()
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
    menu.append(new MenuItem({type: 'separator'}))
    if (unreadRooms.length) {
        for (const unreadRoom of unreadRooms) {
            menu.append(new MenuItem({
                label: `${unreadRoom.roomName} (${unreadRoom.unreadCount})`,
                click() {
                    const window = getMainWindow()
                    window.show()
                    window.focus()
                    ui.chroom(unreadRoom.roomId)
                },
            }))
        }
        menu.append(new MenuItem({type: 'separator'}))
    }
    menu.append(new MenuItem({
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
    }))
    menu.append(new MenuItem({
        label: '深色图标',
        type: 'checkbox',
        checked: getConfig().darkTaskIcon,
        click(item) {
            getConfig().darkTaskIcon = item.checked
            updateTrayIcon()
            saveConfigFile()
        },
    }))
    menu.append(new MenuItem({
        label: '退出',
        type: 'normal',
        click: exit,
    }))
    tray.setContextMenu(menu)
}
export const updateTrayIcon = async () => {
    let p
    const unread = await getUnreadCount()
    const title = ui.getSelectedRoomName()
        ? ui.getSelectedRoomName() + ' — Icalingua'
        : 'Icalingua'
    if (unread) {
        p = path.join(
            getStaticPath(),
            getConfig().darkTaskIcon ? 'darknewmsg.png' : 'newmsg.png',
        )
        const newMsgRoom = await getFirstUnreadRoom()
        const extra = newMsgRoom ? (' : ' + newMsgRoom.roomName) : ''
        getMainWindow().title = `(${unread}${extra}) ${title}`
    }
    else {
        p = path.join(getStaticPath(), getConfig().darkTaskIcon ? 'dark.png' : '256x256.png')
        getMainWindow().title = title
    }
    tray.setImage(p)
    app.setBadgeCount(unread)
    pushUnreadCount(unread)
    updateTrayMenu()
}
