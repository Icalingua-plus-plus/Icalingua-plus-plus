import Room from '@icalingua/types/Room'
import { app, Menu, MenuItem, nativeImage, nativeTheme, Tray } from 'electron'
import path from 'path'
import getStaticPath from '../../utils/getStaticPath'
import { clearRoomUnread, getNickname, getUin } from '../ipc/botAndStorage'
import { getConfig, saveConfigFile } from './configManager'
import exit from './exit'
import setPriority from './setPriority'
import { pushUnreadCount } from './socketIoSlave'
import ui from './ui'
import OnlineStatusType from '@icalingua/types/OnlineStatusType'
import { setOnlineStatus, updateAppMenu } from '../ipc/menuManager'
import {
    getMainWindow,
    isAppLocked,
    lockMainWindow,
    setMainWindowTitleBarHidden,
    showSettingsWindow,
    tryToShowMainWindow,
} from './windowManager'
import openImage from '../ipc/openImage'
import removeGroupNameEmotes from '../../utils/removeGroupNameEmotes'
import { spacingNotification } from '../../utils/panguSpacing'

let tray: Tray
let trayUpdate: Promise<void> | null = null
let forceTrayUpdate = false
let currentTrayImage: Electron.NativeImage

let darknewmsgIcon = nativeImage.createFromPath(path.join(getStaticPath(), 'darknewmsg.png'))
let newmsgIcon = nativeImage.createFromPath(path.join(getStaticPath(), 'newmsg.png'))
let darkIcon = nativeImage.createFromPath(path.join(getStaticPath(), 'dark.png'))
let lightIcon = nativeImage.createFromPath(path.join(getStaticPath(), '256x256.png'))

export const createTray = () => {
    if (getConfig().hideTray) return
    tray = new Tray(path.join(getStaticPath(), 'trayTemplate.png'))
    tray.setToolTip(`Icalingua++: ${getNickname()} (${getUin()})\n通知优先级: ${getConfig().priority.toString()}`)
    tray.on('click', () => tryToShowMainWindow())
    return updateTrayIcon(true)
}

const updateTrayContextMenu = (unreadRooms: Room[]) => {
    tray.setToolTip(`Icalingua++: ${getNickname()} (${getUin()})\n通知优先级: ${getConfig().priority.toString()}`)
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
            const content = unreadRoom.lastMessage?.content || ''
            const lastMessage = getConfig().usePanguJsRecv ? spacingNotification(content.slice(0, 25)) : content
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
            label: '设置',
            click: showSettingsWindow,
        }),
    )
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
            label: '隐藏菜单栏',
            type: 'checkbox',
            checked: !getConfig().showAppMenu,
            click(item) {
                getConfig().showAppMenu = !item.checked
                getMainWindow().setMenuBarVisibility(!item.checked)
                getMainWindow().setAutoHideMenuBar(item.checked)
                saveConfigFile()
            },
        }),
    )
    menu.append(
        new MenuItem({
            label: '隐藏标题栏',
            type: 'checkbox',
            checked: getConfig().hideTitleBar,
            click: (item) => {
                void setMainWindowTitleBarHidden(item.checked).catch(console.error)
                updateAppMenu()
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
            label: '注销',
            sublabel: '删除记录的密码',
            visible: getConfig().adapter === 'oicq',
            click: () => {
                getConfig().account.password = ''
                getConfig().account.autologin = false
                exit()
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
const getTrayIconColor = () => {
    if (getConfig().darkTaskIcon === 'auto') return !nativeTheme.shouldUseDarkColors
    else return getConfig().darkTaskIcon === 'true'
}
const refreshTray = (force: boolean) => {
    const window = getMainWindow()
    if (!window || window.isDestroyed()) return

    const unreadRooms = ui.getUnreadRooms().sort((a, b) => b.utime - a.utime)
    const unread = unreadRooms.length
    const roomName = (roomId: number, name: string) =>
        roomId < 0 && getConfig().removeGroupNameEmotes ? removeGroupNameEmotes(name) : name
    const selectedRoomName = roomName(ui.getSelectedRoomId(), ui.getSelectedRoomName())
    const title = selectedRoomName ? selectedRoomName + ' — Icalingua++' : 'Icalingua++'
    const latest = unreadRooms[0]
    window.title = latest ? `(${unread} : ${roomName(latest.roomId, latest.roomName)}) ${title}` : title
    app.setBadgeCount(unread)
    pushUnreadCount(unread)
    if (!tray) return

    tray.setTitle(unread ? String(unread) : '')
    if (process.platform !== 'darwin') {
        const dark = getTrayIconColor()
        const image = unread ? (dark ? darknewmsgIcon : newmsgIcon) : dark ? darkIcon : lightIcon
        if (force || image !== currentTrayImage) {
            tray.setImage(image)
            currentTrayImage = image
        }
    }
    updateTrayContextMenu(unreadRooms)
}

export const updateTrayIcon = (force = false): Promise<void> => {
    forceTrayUpdate ||= force
    trayUpdate ??= Promise.resolve().then(() => {
        const force = forceTrayUpdate
        forceTrayUpdate = false
        trayUpdate = null
        try {
            refreshTray(force)
        } catch (error) {
            console.error('Failed to refresh tray', error)
        }
    })
    return trayUpdate
}

export const updateTrayMenu = () => updateTrayIcon()
