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
import OnlineStatusType from '@icalingua/types/OnlineStatusType'
import { setOnlineStatus, updateAppMenu } from '../ipc/menuManager'
import { getMainWindow, isAppLocked, lockMainWindow, tryToShowMainWindow } from './windowManager'
import openImage from '../ipc/openImage'
import removeGroupNameEmotes from '../../utils/removeGroupNameEmotes'
import { spacingNotification } from '../../utils/panguSpacing'

let tray: Tray

let darknewmsgIcon = nativeImage.createFromPath(path.join(getStaticPath(), 'darknewmsg.png'))
let newmsgIcon = nativeImage.createFromPath(path.join(getStaticPath(), 'newmsg.png'))
let darkIcon = nativeImage.createFromPath(path.join(getStaticPath(), 'dark.png'))
let lightIcon = nativeImage.createFromPath(path.join(getStaticPath(), '256x256.png'))

export const createTray = () => {
    tray = new Tray(path.join(getStaticPath(), 'trayTemplate.png'))
    tray.setToolTip(`Icalingua++: ${getNickname()} (${getUin()})\n通知优先级: ${getConfig().priority.toString()}`)
    tray.on('click', () => tryToShowMainWindow())
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
            click: () => tryToShowMainWindow(),
        },
        {
            label: '锁定',
            type: 'checkbox',
            checked: isAppLocked(),
            click: () => {
                if (isAppLocked()) {
                    tryToShowMainWindow()
                } else {
                    lockMainWindow()
                }
            },
        },
    ])
    menu.append(new MenuItem({ type: 'separator' }))
    if (unreadRooms.length) {
        for (const unreadRoom of unreadRooms) {
            const roomName =
                unreadRoom.roomId < 0 && getConfig().removeGroupNameEmotes
                    ? removeGroupNameEmotes(unreadRoom.roomName)
                    : unreadRoom.roomName
            menu.append(
                new MenuItem({
                    label: `${roomName} (${unreadRoom.unreadCount})`,
                    click: () =>
                        tryToShowMainWindow(() => {
                            ui.chroom(unreadRoom.roomId)
                        }),
                }),
            )
            const lastMessage = getConfig().usePanguJsRecv
                ? spacingNotification(unreadRoom.lastMessage.content.slice(0, 25))
                : unreadRoom.lastMessage.content
            menu.append(
                new MenuItem({
                    label: lastMessage.length > 25 ? `${lastMessage.slice(0, 25)}...` : lastMessage,
                    enabled: false,
                    visible: !isAppLocked(),
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
            label: '通知设置',
            submenu: [
                {
                    label: '通知优先级',
                    submenu: [
                        ...([1, 2, 3, 4, 5] as const).map((e) => ({
                            type: 'radio' as const,
                            label: `${e}`,
                            checked: getConfig().priority === e,
                            click: () => setPriority(e),
                        })),
                        {
                            type: 'separator',
                        },
                        {
                            label: '帮助',
                            click: () => openImage(path.join(getStaticPath(), 'notification.webp')),
                        },
                    ],
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
                {
                    type: 'checkbox',
                    label: '禁用全体通知',
                    checked: getConfig().disableAtAll,
                    visible: !getConfig().disableNotification,
                    click: (item) => {
                        getConfig().disableAtAll = item.checked
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
    let selectedRoomId = ui.getSelectedRoomId()
    let selectedRoomName = ui.getSelectedRoomName()
    if (selectedRoomId < 0 && getConfig().removeGroupNameEmotes) {
        selectedRoomName = removeGroupNameEmotes(selectedRoomName)
    }
    const title = selectedRoomName ? selectedRoomName + ' — Icalingua++' : 'Icalingua++'
    const shouldUpdateIcon = currentIconUnread !== unread > 0
    currentIconUnread = unread > 0
    if (unread) {
        p = getTrayIconColor() ? darknewmsgIcon : newmsgIcon
        const newMsgRoom = await getFirstUnreadRoom()
        let extra = ''
        if (newMsgRoom) {
            let newMsgRoomName = newMsgRoom.roomName
            if (newMsgRoom.roomId < 0 && getConfig().removeGroupNameEmotes) {
                newMsgRoomName = removeGroupNameEmotes(newMsgRoomName)
            }
            extra = ' : ' + newMsgRoomName
        }
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
