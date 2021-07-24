import {
    app,
    BrowserWindow,
    clipboard,
    dialog,
    ipcMain,
    Menu,
    MenuItem,
    nativeImage, screen,
    shell,
} from 'electron'
import {getConfig, saveConfigFile} from '../utils/configManager'
import exit from '../utils/exit'
import {getMainWindow} from '../utils/windowManager'
import openImage from './openImage'
import path from 'path'
import OnlineStatusType from '../../types/OnlineStatusType'
import {
    deleteMessage,
    fetchHistory,
    fetchLatestHistory,
    getRoom,
    getSelectedRoom,
    ignoreChat,
    pinRoom,
    removeChat, revealMessage, sendMessage,
    setRoomAutoDownload, setRoomAutoDownloadPath,
    setRoomPriority,
    setOnlineStatus as setStatus, getUin, getCookies,
} from './botAndStorage'
import Room from '../../types/Room'
import {download, downloadFileByMessageData, downloadImage} from './downloadManager'
import Message from '../../types/Message'
import axios from 'axios'
import ui from '../utils/ui'
import getStaticPath from '../../utils/getStaticPath'
import setPriority from '../utils/setPriority'
import getWinUrl from '../../utils/getWinUrl'
import openMedia from '../utils/openMedia'
import getImageUrlByMd5 from '../../renderer/utils/getImageUrlByMd5'
import getAvatarUrl from '../../utils/getAvatarUrl'
import fs from 'fs'

const setOnlineStatus = (status: OnlineStatusType) => {
    setStatus(status)
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
    const menu = Menu.buildFromTemplate([
        {
            label: '优先级',
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
            label: '删除会话',
            click: () => removeChat(room.roomId),
        },
        {
            label: '屏蔽消息',
            click: () => ignoreChat({id: room.roomId, name: room.roomName}),
        },
        {
            label: '复制名称',
            click: () => {
                clipboard.writeText(room.roomName)
            },
        },
        {
            label: '复制 ID',
            click: () => {
                clipboard.writeText(String(Math.abs(room.roomId)))
            },
        },
        {
            label: '查看头像',
            click: () => {
                openImage(room.avatar, false)
            },
        },
        {
            label: '下载头像',
            click: () => {
                downloadImage(room.avatar)
            },
        },
        {
            label: '自动下载',
            submenu: [
                {
                    type: 'checkbox',
                    label: '聊天文件',
                    checked: !!room.autoDownload,
                    click: (menuItem) => setRoomAutoDownload(room.roomId, menuItem.checked),
                },
                {
                    label: '设置下载路径',
                    click: () => {
                        const selection = dialog.showOpenDialogSync(getMainWindow(), {
                            title: '设置下载路径',
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
    ])
    if (room.roomId < 0) {
        menu.append(new MenuItem({
            label: '查看精华消息',
            async click() {
                const size = screen.getPrimaryDisplay().size
                const win = new BrowserWindow({
                    height: size.height - 200,
                    width: 500,
                    autoHideMenuBar: true,
                    webPreferences: {
                        preload: path.join(getStaticPath(), 'essenceInj.js'),
                        contextIsolation: false,
                    },
                })
                const cookies = await getCookies('qun.qq.com')
                for (const i in cookies) {
                    await win.webContents.session.cookies.set({
                        url: 'https://qun.qq.com',
                        name: i,
                        value: cookies[i],
                    })
                }
                await win.loadURL('https://qun.qq.com/essence/index?gc=' + -room.roomId)
            },
        }))
        menu.append(new MenuItem({
            label: '查看群公告',
            async click() {
                const size = screen.getPrimaryDisplay().size
                const win = new BrowserWindow({
                    height: size.height - 200,
                    width: 500,
                    autoHideMenuBar: true,
                })
                const cookies = await getCookies('qun.qq.com')
                for (const i in cookies) {
                    await win.webContents.session.cookies.set({
                        url: 'https://web.qun.qq.com',
                        name: i,
                        value: cookies[i],
                    })
                }
                await win.loadURL('https://web.qun.qq.com/mannounce/index.html#gc=' + -room.roomId)
            },
        }))
    }
    menu.append(new MenuItem({
            label: '获取历史消息',
            click: () => fetchLatestHistory(room.roomId),
        },
    ))
    return menu
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
                    label: '帮助',
                    click: () => openImage(path.join(getStaticPath(), 'notification.webp')),
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
                        label: '隐身',
                        checked: getConfig().account.onlineStatus === OnlineStatusType.Hide,
                        click: () => setOnlineStatus(OnlineStatusType.Hide),
                    },
                ],
            }),
            new MenuItem({
                label: '管理屏蔽的会话',
                enabled: false,
                click: () => {
                },//todo 做一个单独的窗口来管理,
            }),
            new MenuItem({
                label: 'Aria2 下载管理器设置',
                click: () => {
                    new BrowserWindow({
                        height: 460,
                        width: 500,
                        maximizable: false,
                        webPreferences: {
                            nodeIntegration: true,
                            contextIsolation: false,
                        },
                        autoHideMenuBar: true,
                    }).loadURL(getWinUrl() + '#/aria2')
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
            label: '选项',
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
ipcMain.on('popupRoomMenu', async (_, roomId: number) => {
    buildRoomMenu(await getRoom(roomId)).popup({
        window: getMainWindow(),
    })
})
ipcMain.on('popupMessageMenu', (_, room: Room, message: Message, sect?: string, history?: boolean) => {
    const menu = new Menu()
    if (message.deleted && !message.reveal)
        menu.append(
            new MenuItem({
                label: '显示',
                type: 'normal',
                click: () => {
                    revealMessage(room.roomId, message._id)
                },
            }),
        )
    else {
        if (sect) {
            menu.append(
                new MenuItem({
                    label: '复制选区',
                    type: 'normal',
                    click: () => {
                        clipboard.writeText(sect)
                    },
                }),
            )
        }
        if (message.content)
            menu.append(
                new MenuItem({
                    label: '复制文本',
                    type: 'normal',
                    click: () => {
                        clipboard.writeText(message.content)
                    },
                }),
            )
        if (message.replyMessage && message.replyMessage.content) {
            menu.append(
                new MenuItem({
                    label: '复制回复文本',
                    type: 'normal',
                    click: () => {
                        clipboard.writeText(message.replyMessage.content)
                    },
                }),
            )
        }
        if (message.code) {
            menu.append(
                new MenuItem({
                    label: '复制代码',
                    type: 'normal',
                    click() {
                        clipboard.writeText(message.code)
                    },
                }),
            )
        }
        if (message.file && message.file.type.includes('image')) {
            menu.append(
                new MenuItem({
                    label: '复制图片',
                    type: 'normal',
                    click: async () => {
                        const res = await axios.get(message.file.url, {
                            responseType: 'arraybuffer',
                        })
                        const buf = Buffer.from(res.data, 'binary')
                        clipboard.writeImage(nativeImage.createFromBuffer(buf))
                    },
                }),
            )
            menu.append(
                new MenuItem({
                    label: '添加为表情',
                    type: 'normal',
                    click: () => {
                        download(message.file.url, String(new Date().getTime()), path.join(app.getPath('userData'), 'stickers'))
                    },
                }),
            )
        }
        if (message.replyMessage && message.replyMessage.file) {
            menu.append(
                new MenuItem({
                    label: '复制回复文件 URL',
                    type: 'normal',
                    click: () => {
                        clipboard.writeText(message.replyMessage.file.url)
                    },
                }),
            )
            menu.append(
                new MenuItem({
                    label: '下载回复文件',
                    click: () => downloadFileByMessageData({
                        message: message.replyMessage,
                        room,
                        action: 'download',
                    }),
                }),
            )
        }
        if (message.file) {
            menu.append(
                new MenuItem({
                    label: '复制 URL',
                    type: 'normal',
                    click: () => {
                        clipboard.writeText(message.file.url)
                    },
                }),
            )
            if (message.file.type.startsWith('image/'))
                menu.append(
                    new MenuItem({
                        label: '使用本地查看器打开',
                        click: () =>
                            openImage(message.file.url, true),
                    }),
                )
            if (message.file.type.startsWith('video/') || message.file.type.startsWith('audio/'))
                menu.append(
                    new MenuItem({
                        label: '使用本地播放器打开',
                        click: () =>
                            openMedia(message.file.url),
                    }),
                )
            menu.append(
                new MenuItem({
                    label: '下载',
                    click: () =>
                        downloadFileByMessageData({action: 'download', message, room}),
                }),
            )
        }
        menu.append(
            new MenuItem({
                label: '复制消息 ID',
                type: 'normal',
                click: () => {
                    clipboard.writeText(String(message._id))
                },
            }),
        )
        if (message.senderId === getUin()) {
            menu.append(
                new MenuItem({
                    label: '撤回',
                    click: () => {
                        deleteMessage(room.roomId, message._id as string)
                    },
                }),
            )
            menu.append(
                new MenuItem({
                    label: '一分钟后撤回',
                    click: () => {
                        setTimeout(() => deleteMessage(room.roomId, message._id as string), 1000 * 60)
                    },
                }),
            )
        }
        if (!history) {
            menu.append(
                new MenuItem({
                    label: '回复',
                    click: () => {
                        ui.replyMessage(message)
                    },
                }),
            )
            if (!message.file)
                menu.append(
                    new MenuItem({
                        label: '+1',
                        click: () => {
                            const msgToSend = {
                                content: message.content,
                                replyMessage: message.replyMessage,
                                imgpath: undefined,
                            }
                            if (message.file) {
                                msgToSend.imgpath = message.file.url
                            }
                            sendMessage(msgToSend)
                        },
                    }),
                )
            menu.append(
                new MenuItem({
                    label: '获取历史消息',
                    click: () => fetchHistory(message._id as string),
                }),
            )
        }
    }
    menu.popup({window: getMainWindow()})
})
ipcMain.on('popupTextAreaMenu', () => {
    Menu.buildFromTemplate([
        {
            role: 'cut',
        },
        {
            role: 'copy',
        },
        {
            role: 'paste',
        },
    ]).popup({window: getMainWindow()})
})
ipcMain.on('popupStickerMenu', () => {
    Menu.buildFromTemplate([
        {
            label: 'Open stickers folder',
            type: 'normal',
            click() {
                shell.openPath(path.join(app.getPath('userData'), 'stickers'))
            },
        },
        {
            label: 'Close panel',
            type: 'normal',
            click: ui.closePanel,
        },
    ]).popup({window: getMainWindow()})
})
ipcMain.on('popupAvatarMenu', (_, message: Message) => {
    const menu = Menu.buildFromTemplate([
        {
            label: `复制 "${message.username}"`,
            click: () => {
                clipboard.writeText(message.username)
            },
        },
        {
            label: `复制 "${message.senderId}"`,
            click: () => {
                clipboard.writeText(message.senderId.toString())
            },
        },
    ])
    if (message.replyMessage) {
        menu.append(
            new MenuItem({
                label: `复制 "${message.replyMessage.username}"`,
                click: () => {
                    clipboard.writeText(message.replyMessage.username)
                },
            }),
        )
    }
    menu.append(
        new MenuItem({
            label: `查看头像`,
            click: () => {
                if (message.mirai && message.mirai.eqq.avatarMd5) {
                    openImage(getImageUrlByMd5(message.mirai.eqq.avatarMd5))
                } else {
                    openImage(getAvatarUrl(message.senderId))
                }
            },
        }),
    )
    menu.append(
        new MenuItem({
            label: `下载头像`,
            click: () => downloadImage(`https://q1.qlogo.cn/g?b=qq&nk=${message.senderId}&s=640`),
        }),
    )
    menu.append(
        new MenuItem({
            label: `发起私聊`,
            click: () => ui.startChat(message.senderId, message.username),
        }),
    )
    menu.popup({window: getMainWindow()})
})
ipcMain.on('popupContactMenu', (_, remark?: string, name?: string, displayId?: number) => {
    const menu = new Menu()
    if (remark) {
        menu.append(
            new MenuItem({
                label: `复制 "${remark}"`,
                click: () => {
                    clipboard.writeText(remark)
                },
            }),
        )
    }
    if (name) {
        menu.append(
            new MenuItem({
                label: `复制 "${name}"`,
                click: () => {
                    clipboard.writeText(name)
                },
            }),
        )
    }
    if (displayId) {
        menu.append(
            new MenuItem({
                label: `复制 "${displayId}"`,
                click: () => {
                    clipboard.writeText(displayId.toString())
                },
            }),
        )
    }
    menu.popup({window: getMainWindow()})
})
