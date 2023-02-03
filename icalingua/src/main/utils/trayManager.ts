import Room from '@icalingua/types/Room'
import { app, Menu, MenuItem, nativeImage, nativeTheme, Tray } from 'electron'
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
import OnlineStatusType from '@icalingua/types/OnlineStatusType'
import { setOnlineStatus, updateAppMenu } from '../ipc/menuManager'

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
                {
                    type: 'separator',
                },
                {
                    type: 'checkbox',
                    label: '禁用通知',
                    checked: getConfig().disableNotification,
                    click: (item) => {
                        getConfig().disableNotification = item.checked
                        updateAppMenu()
                        updateTrayMenu()
                        saveConfigFile()
                    },
                },
            ],
        }),
    )
    menu.append(
        new MenuItem({
            label: '显示菜单栏',
            type: 'checkbox',
            checked: getConfig().showAppMenu,
            click(item) {
                getConfig().showAppMenu = item.checked
                getMainWindow().setMenuBarVisibility(item.checked)
                getMainWindow().setAutoHideMenuBar(!item.checked)
                saveConfigFile()
            },
        }),
    )
    menu.append(
        new MenuItem({
            label: '在线状态',
            submenu: [
                {
                    type: 'radio',
                    label: '在线',
                    checked: getConfig().account.onlineStatus === OnlineStatusType.Online,
                    click: () => setOnlineStatus(OnlineStatusType.Online),
                },
                {
                    type: 'radio',
                    label: '离开',
                    checked: getConfig().account.onlineStatus === OnlineStatusType.Afk,
                    click: () => setOnlineStatus(OnlineStatusType.Afk),
                },
                {
                    type: 'radio',
                    label: '隐身',
                    checked: getConfig().account.onlineStatus === OnlineStatusType.Hide,
                    click: () => setOnlineStatus(OnlineStatusType.Hide),
                },
                {
                    type: 'radio',
                    label: '忙碌',
                    checked: getConfig().account.onlineStatus === OnlineStatusType.Busy,
                    click: () => setOnlineStatus(OnlineStatusType.Busy),
                },
                {
                    type: 'radio',
                    label: 'Q我吧',
                    checked: getConfig().account.onlineStatus === OnlineStatusType.Qme,
                    click: () => setOnlineStatus(OnlineStatusType.Qme),
                },
                {
                    type: 'radio',
                    label: '请勿打扰',
                    checked: getConfig().account.onlineStatus === OnlineStatusType.DontDisturb,
                    click: () => setOnlineStatus(OnlineStatusType.DontDisturb),
                },
            ],
        }),
    )
    process.platform !== 'darwin' &&
        menu.append(
            new MenuItem({
                label: '图标颜色',
                submenu: [
                    {
                        label: '与系统颜色相反',
                        type: 'radio',
                        checked: getConfig().darkTaskIcon === 'auto',
                        click(item) {
                            getConfig().darkTaskIcon = 'auto'
                            updateTrayIcon(true)
                            saveConfigFile()
                        },
                    },
                    {
                        label: '深色图标',
                        type: 'radio',
                        checked: getConfig().darkTaskIcon === 'true',
                        click(item) {
                            getConfig().darkTaskIcon = 'true'
                            updateTrayIcon(true)
                            saveConfigFile()
                        },
                    },
                    {
                        label: '浅色图标',
                        type: 'radio',
                        checked: getConfig().darkTaskIcon === 'false',
                        click(item) {
                            getConfig().darkTaskIcon = 'false'
                            updateTrayIcon(true)
                            saveConfigFile()
                        },
                    },
                ],
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
const getTrayIconColor = () => {
    if (getConfig().darkTaskIcon === 'auto') return !nativeTheme.shouldUseDarkColors
    else return getConfig().darkTaskIcon === 'true'
}
let currentIconUnread = false
export const updateTrayIcon = async (force = false) => {
    let p: Electron.NativeImage
    const unread = await getUnreadCount()
    const title = ui.getSelectedRoomName() ? ui.getSelectedRoomName() + ' — Icalingua++' : 'Icalingua++'
    const shouldUpdateIcon = currentIconUnread !== unread > 0
    currentIconUnread = unread > 0
    if (unread) {
        p = getTrayIconColor() ? darknewmsgIcon : newmsgIcon
        const newMsgRoom = await getFirstUnreadRoom()
        const extra = newMsgRoom ? ' : ' + newMsgRoom.roomName : ''
        getMainWindow().title = `(${unread}${extra}) ${title}`
    } else {
        p = getTrayIconColor() ? darkIcon : lightIcon
        getMainWindow().title = title
    }
    tray.setTitle(unread === 0 ? '' : `${unread}`)
    if (shouldUpdateIcon || force) process.platform !== 'darwin' && tray.setImage(p)
    app.setBadgeCount(unread)
    pushUnreadCount(unread)
    updateTrayMenu()
}
