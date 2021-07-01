import {app, clipboard, dialog, ipcRenderer, Menu, MenuItem, shell} from 'electron'
import {getConfig, saveConfigFile} from '../utils/configManager'
import ipc from '../../renderer/utils/ipc'
import exit from '../utils/exit'
import {getMainWindow} from '../utils/windowManager'
import openImage from './openImage'
import path from 'path'
import OnlineStatusType from '../../types/OnlineStatusType'
import {
    fetchLatestHistory,
    getBot, getRoom,
    getSelectedRoom,
    ignoreChat,
    pinRoom,
    removeChat,
    setRoomAutoDownload, setRoomAutoDownloadPath,
    setRoomPriority,
} from './botAndStorage'
import Room from '../../types/Room'
import {downloadImage} from './downloadManager'

const updatePriority = (lev: 1 | 2 | 3 | 4 | 5) => {
    getConfig().priority = lev
    updateAppMenu()
    //todo ui
    saveConfigFile()
}
const setOnlineStatus = (status: OnlineStatusType) => {
    getBot().setOnlineStatus(status)
        .then(() => {
            getConfig().account.onlineStatus = status
            updateAppMenu()
            saveConfigFile()
        })
        .catch(res => console.log(res))
}


Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
        role: 'toggleDevTools',
    },
]))

const buildRoomMenu = (room: Room): Menu => {
    const pinTitle = room.index ? '解除置顶' : '置顶'
    const updateRoomPriority = (lev: 1 | 2 | 3 | 4 | 5) => setRoomPriority(room.roomId, lev)
    return Menu.buildFromTemplate([
        {
            label: 'Notification Priority',
            submenu: [
                {
                    type: 'radio',
                    label: '1',
                    checked: room.priority === 1,
                    click: () => updateRoomPriority(1),
                },
                {
                    type: 'radio',
                    label: '2',
                    checked: room.priority === 2,
                    click: () => updateRoomPriority(2),
                },
                {
                    type: 'radio',
                    label: '3',
                    checked: room.priority === 3,
                    click: () => updateRoomPriority(3),
                },
                {
                    type: 'radio',
                    label: '4',
                    checked: room.priority === 4,
                    click: () => updateRoomPriority(4),
                },
                {
                    type: 'radio',
                    label: '5',
                    checked: room.priority === 5,
                    click: () => updateRoomPriority(5),
                },
            ],
        },
        {
            label: pinTitle,
            click: () => pinRoom(room.roomId, !room.index),
        },
        {
            label: 'Delete Chat',
            click: () => removeChat(room.roomId),
        },
        {
            label: 'Ignore Chat',
            click: () => ignoreChat({id: room.roomId, name: room.roomName}),
        },
        {
            label: 'Copy Name',
            click: () => {
                clipboard.writeText(room.roomName)
            },
        },
        {
            label: 'Copy ID',
            click: () => {
                clipboard.writeText(String(Math.abs(room.roomId)))
            },
        },
        {
            label: 'View Avatar',
            click: () => {
                openImage(room.avatar, false)
            },
        },
        {
            label: 'Download Avatar',
            click: () => {
                downloadImage(room.avatar)
            },
        },
        {
            label: 'Auto Download',
            submenu: [
                {
                    type: 'checkbox',
                    label: 'Files in this chat',
                    checked: !!room.autoDownload,
                    click: (menuItem) => setRoomAutoDownload(room.roomId, menuItem.checked),
                },
                {
                    label: 'Set downloadManager path',
                    click: () => {
                        const selection = dialog.showOpenDialogSync(getMainWindow(), {
                            title: 'Select downloadManager path',
                            properties: ['openDirectory'],
                            defaultPath: room.downloadPath,
                        })
                        console.log(selection)
                        if (selection && selection.length) {
                            setRoomAutoDownloadPath(room.roomId, selection[0])
                        }
                    },
                },
            ],
        },
        {
            label: 'Get History',
            click: () => fetchLatestHistory(room.roomId),
        },
    ])
}

export const updateAppMenu = async () => {
    let globalMenu = {
        //应用菜单
        app: [
            new MenuItem({
                label: app.getVersion(),
                enabled: false,
            }),
            new MenuItem({
                label: 'GitHub',
                click: () => shell.openExternal('https://github.com/Clansty/electron-qq'),
            }),
            new MenuItem({
                label: '重新加载',
                click: () => {
                    getMainWindow().reload()
                },
            }),
            new MenuItem({
                label: '开发者工具',
                role: 'toggleDevTools',
            }),
            new MenuItem({
                label: '退出',
                click: exit,
            }),
        ],
        priority: new MenuItem({
            label: '通知优先级',
            submenu: [
                {
                    type: 'radio',
                    label: '1',
                    checked: getConfig().priority === 1,
                    click: () => updatePriority(1),
                },
                {
                    type: 'radio',
                    label: '2',
                    checked: getConfig().priority === 2,
                    click: () => updatePriority(2),
                },
                {
                    type: 'radio',
                    label: '3',
                    checked: getConfig().priority === 3,
                    click: () => updatePriority(3),
                },
                {
                    type: 'radio',
                    label: '4',
                    checked: getConfig().priority === 4,
                    click: () => updatePriority(4),
                },
                {
                    type: 'radio',
                    label: '5',
                    checked: getConfig().priority === 5,
                    click: () => updatePriority(5),
                },
                {
                    type: 'separator',
                },
                {
                    label: '帮助',
                    click: () => openImage(path.join(global.STATIC, 'notification.webp')),
                },
            ],
        }),
        //设置
        options: [
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
                        label: 'Hide',
                        checked: getConfig().account.onlineStatus === OnlineStatusType.Hide,
                        click: () => setOnlineStatus(OnlineStatusType.Hide),
                    },
                ],
            }),
            new MenuItem({
                label: '管理屏蔽的会话',
                click: () => {
                },//todo 做一个单独的窗口来管理,
            }),
            new MenuItem({
                label: 'Aria2 下载管理器设置',
                click: () => {
                    //这个也 todo
                },
            }),
            new MenuItem({
                label: '自动登录',
                type: 'checkbox',
                checked: getConfig().account.autologin,
                click: (menuItem) => {
                    getConfig().account.autologin = menuItem.checked
                    saveConfigFile()
                },
            }),
        ],
    }
    const menu = Menu.buildFromTemplate([
        {
            label: 'Electron QQ',
            submenu: Menu.buildFromTemplate(globalMenu.app),
        },
        globalMenu.priority,
        {
            label: 'Options',
            submenu: Menu.buildFromTemplate(globalMenu.options),
        },
    ])
    const selectedRoom = await getSelectedRoom()
    if (selectedRoom) {
        menu.append(
            new MenuItem({
                label: selectedRoom.roomName,
                submenu: buildRoomMenu(selectedRoom),
            }),
        )
    }
    Menu.setApplicationMenu(menu)
}
export const popupRoomMenu = async (roomId: number) => {
    buildRoomMenu(await getRoom(roomId)).popup({
        window: getMainWindow(),
    })
}
// ipcRenderer.on('popupRoomMenu', (_, id) => popupRoomMenu(id))
