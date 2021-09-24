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
import {getMainWindow, showRequestWindow} from '../utils/windowManager'
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
    setOnlineStatus as setStatus, getUin, getCookies, getGroupMemberInfo,
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
import getImageUrlByMd5 from '../../utils/getImageUrlByMd5'
import getAvatarUrl from '../../utils/getAvatarUrl'
import fs from 'fs'
import atCache from '../utils/atCache'
import exportContacts from '../utils/exportContacts'
import querystring from 'querystring'
import exportGroupMembers from '../utils/exportGroupMembers'
import isAdmin from '../utils/isAdmin'
import SearchableGroup from '../../types/SearchableGroup'
import * as themes from '../utils/themes'
import version from '../utils/version'

const setOnlineStatus = (status: OnlineStatusType) => {
    setStatus(status)
        .then(() => {
            getConfig().account.onlineStatus = status
            updateAppMenu()
            saveConfigFile()
        })
        .catch(res => console.log(res))
}
const setKeyToSendMessage = (key: 'Enter' | 'CtrlEnter' | 'ShiftEnter') => {
    getConfig().keyToSendMessage = key
    saveConfigFile()
    ui.setKeyToSendMessage(key)
    updateAppMenu()
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
        menu.append(new MenuItem({
            label: '群荣誉',
            async click() {
                const size = screen.getPrimaryDisplay().size
                const win = new BrowserWindow({
                    height: size.height - 200,
                    width: 800,
                    autoHideMenuBar: true,
                })
                const cookies = await getCookies('qun.qq.com')
                for (const i in cookies) {
                    await win.webContents.session.cookies.set({
                        url: 'https://qun.qq.com',
                        name: i,
                        value: cookies[i],
                    })
                }
                await win.loadURL('https://qun.qq.com/interactive/qunhonor?gc=' + -room.roomId)
            },
        }))
        menu.append(new MenuItem({
            label: '我的群昵称',
            async click() {
                const memberInfo = await getGroupMemberInfo(-room.roomId, getUin())
                const win = new BrowserWindow({
                    height: 170,
                    width: 600,
                    autoHideMenuBar: true,
                    webPreferences: {
                        contextIsolation: false,
                        nodeIntegration: true,
                    },
                })
                await win.loadURL(getWinUrl() + '#/groupNickEdit/' +
                    -room.roomId + '/' + querystring.escape(room.roomName) + '/' +
                    querystring.escape(memberInfo.card || memberInfo.nickname))
            },
        }))
        menu.append(new MenuItem({
            label: '群成员',
            async click() {
                const win = new BrowserWindow({
                    autoHideMenuBar: true,
                    webPreferences: {
                        contextIsolation: false,
                    },
                })
                win.maximize()
                const cookies = await getCookies('qun.qq.com')
                for (const i in cookies) {
                    await win.webContents.session.cookies.set({
                        url: 'https://qun.qq.com',
                        name: i,
                        value: cookies[i],
                    })
                }
                win.webContents.on('dom-ready', () => win.webContents.insertCSS(
                    '.header,.footer>p:not(:last-child),#changeGroup{display:none} ' +
                    '.body{padding-top:0 !important;margin:0 !important}'))
                await win.loadURL('https://qun.qq.com/member.html#gid=' + -room.roomId)
            },
        }))
        menu.append(new MenuItem({
            label: '导出群成员',
            click() {
                exportGroupMembers(-room.roomId)
            },
        }))
    }
    else {
        menu.append(new MenuItem({
            label: '互动标识',
            async click() {
                const size = screen.getPrimaryDisplay().size
                const win = new BrowserWindow({
                    height: size.height - 200,
                    width: 500,
                    autoHideMenuBar: true,
                })
                const cookies = await getCookies('ti.qq.com')
                for (const i in cookies) {
                    await win.webContents.session.cookies.set({
                        url: 'https://ti.qq.com',
                        name: i,
                        value: cookies[i],
                    })
                }
                await win.loadURL('https://ti.qq.com/hybrid-h5/interactive_logo/inter?target_uin=' + room.roomId)
            },
        }))
        menu.append(new MenuItem({
            label: '照片墙',
            async click() {
                const size = screen.getPrimaryDisplay().size
                const win = new BrowserWindow({
                    height: size.height - 200,
                    width: 500,
                    autoHideMenuBar: true,
                    webPreferences: {
                        preload: path.join(getStaticPath(), 'photoWallPreload.js'),
                        contextIsolation: false,
                    },
                })
                const cookies = await getCookies('ti.qq.com')
                for (const i in cookies) {
                    await win.webContents.session.cookies.set({
                        url: 'https://ti.qq.com',
                        name: i,
                        value: cookies[i],
                    })
                }
                await win.loadURL('https://ti.qq.com/photowall/index.html?uin=' + room.roomId)
                win.webContents.executeJavaScript(fs.readFileSync(path.join(getStaticPath(), 'photoWallInj.js'), 'utf-8'))
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
                label: version.version,
                enabled: false,
            }),
            new MenuItem({
                label: 'GitHub',
                click: () => shell.openExternal('https://github.com/Clansty/electron-qq'),
            }),
            new MenuItem({
                label: '好友申请列表',
                click: () => showRequestWindow(),
            }),
            new MenuItem({
                label: '数据导出',
                submenu: [
                    {
                        label: '好友列表',
                        click: () => exportContacts('friend'),
                    },
                    {
                        label: '群列表',
                        click: () => exportContacts('group'),
                    },
                ],
            }),
            new MenuItem({
                label: '查看合并转发消息',
                async click() {
                    const win = new BrowserWindow({
                        height: 170,
                        width: 600,
                        autoHideMenuBar: true,
                        webPreferences: {
                            contextIsolation: false,
                            nodeIntegration: true,
                        },
                    })
                    await win.loadURL(getWinUrl() + '#/openForward')
                },
            }),
            new MenuItem({
                label: '重新加载',
                click: () => {
                    getMainWindow().reload()
                },
            }),
            new MenuItem({
                label: '清除缓存并重新加载',
                click: () => {
                    getMainWindow().webContents.session.clearCache()
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
                click: () => {
                    const size = screen.getPrimaryDisplay().size
                    const win = new BrowserWindow({
                        height: size.height - 200,
                        width: 500,
                        autoHideMenuBar: true,
                        webPreferences: {
                            nodeIntegration: true,
                            contextIsolation: false,
                        },
                    })
                    win.loadURL(getWinUrl() + '#/ignoreManage')
                },
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
                label: '用于发送消息的按键',
                submenu: [
                    {
                        type: 'radio',
                        label: 'Enter',
                        checked: getConfig().keyToSendMessage === 'Enter',
                        click: () => setKeyToSendMessage('Enter'),
                    },
                    {
                        type: 'radio',
                        label: 'Ctrl + Enter',
                        checked: getConfig().keyToSendMessage === 'CtrlEnter',
                        click: () => setKeyToSendMessage('CtrlEnter'),
                    },
                    {
                        type: 'radio',
                        label: 'Shift + Enter',
                        checked: getConfig().keyToSendMessage === 'ShiftEnter',
                        click: () => setKeyToSendMessage('ShiftEnter'),
                    },
                ],
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
            new MenuItem({
                label: '切换会话窗口时自动获取历史消息',
                type: 'checkbox',
                checked: getConfig().fetchHistoryOnChatOpen,
                click: (menuItem) => {
                    getConfig().fetchHistoryOnChatOpen = menuItem.checked
                    saveConfigFile()
                },
            }),
            new MenuItem({
                label: '启动时检查更新',
                type: 'checkbox',
                checked: getConfig().updateCheck === true,
                click: (menuItem) => {
                    getConfig().updateCheck = menuItem.checked
                    saveConfigFile()
                },
            }),
            new MenuItem({
                label: '主题',
                submenu: (() => {
                    let rsp: Electron.MenuItemConstructorOptions[] = [{
                        label: '跟随系统',
                        type: 'radio',
                        checked: getConfig().theme == 'auto',
                        click() {
                            getConfig().theme = 'auto'
                            themes.autoSetTheme()
                            saveConfigFile()
                            updateAppMenu()
                        },
                    }]
                    for (let theme of themes.getThemeList()) {
                        rsp.push({
                            label: theme,
                            type: 'radio',
                            checked: getConfig().theme == theme,
                            click: (t => () => {
                                getConfig().theme = t
                                themes.useTheme(t)
                                saveConfigFile()
                                updateAppMenu()
                            })(theme),
                        })
                    }
                    return rsp
                })(),
            }),
        ],
    }
    const menu = Menu.buildFromTemplate([
        {
            label: 'Icalingua',
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
ipcMain.on('popupMessageMenu', async (_, room: Room, message: Message, sect?: string, history?: boolean) => {
    const menu = new Menu()
    if (message.deleted && !message.reveal)
        menu.append(new MenuItem({
            label: '显示',
            type: 'normal',
            click: () => {
                revealMessage(room.roomId, message._id)
            },
        }))
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
            menu.append(new MenuItem({
                label: '复制文本',
                type: 'normal',
                click: () => {
                    clipboard.writeText(message.content)
                },
            }))
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
                        if (message.file.url.startsWith('data:')) {
                            // base64 图片
                            clipboard.writeImage(nativeImage.createFromDataURL(message.file.url))
                            return
                        }
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
        menu.append(new MenuItem({
            label: '复制消息 ID',
            type: 'normal',
            click: () => {
                clipboard.writeText(String(message._id))
            },
        }))
        if (message.senderId === getUin() || await isAdmin())
            menu.append(new MenuItem({
                label: '撤回',
                click: () => {
                    deleteMessage(room.roomId, message._id as string)
                },
            }))
        if (message.senderId === getUin())
            menu.append(new MenuItem({
                label: '一分钟后撤回',
                click: () => {
                    setTimeout(() => deleteMessage(room.roomId, message._id as string), 1000 * 60)
                },
            }))

        if (!history && !message.flash) {
            menu.append(new MenuItem({
                label: '回复',
                click: () => {
                    ui.replyMessage(message)
                },
            }))
            if (!message.file || message.file.type.startsWith('image/'))
                menu.append(new MenuItem({
                    label: '+1',
                    click: () => {
                        const msgToSend = {
                            content: message.content,
                            replyMessage: message.replyMessage,
                            imgpath: undefined,
                            at: [],
                        }
                        if (message.file) {
                            msgToSend.imgpath = message.file.url
                        }
                        sendMessage(msgToSend)
                    },
                }))
            menu.append(new MenuItem({
                label: '获取历史消息',
                click: () => fetchHistory(message._id as string),
            }))
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
                shell.openItem(path.join(app.getPath('userData'), 'stickers'))
            },
        },
        {
            label: 'Close panel',
            type: 'normal',
            click: ui.closePanel,
        },
    ]).popup({window: getMainWindow()})
})
ipcMain.on('popupStickerItemMenu', (_, itemName: string) => {
    Menu.buildFromTemplate([
        {
            label: '删除',
            type: 'normal',
            click() {
                fs.unlink(path.join(app.getPath('userData'), 'stickers', itemName), () => ui.message('删除成功'))
            },
        },
    ]).popup({window: getMainWindow()})
})
ipcMain.on('popupAvatarMenu', async (e, message: Message, room: Room) => {
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
    if (e.sender === getMainWindow().webContents)
        menu.append(new MenuItem({
            label: 'at',
            click() {
                atCache.push({
                    text: '@' + message.username,
                    id: message.senderId,
                })
                ui.addMessageText('@' + message.username + ' ')
            },
        }))
    menu.append(new MenuItem({
        label: `查看头像`,
        click: () => {
            if (message.mirai && message.mirai.eqq.avatarMd5) {
                openImage(getImageUrlByMd5(message.mirai.eqq.avatarMd5))
            }
            else {
                openImage(getAvatarUrl(message.senderId))
            }
        },
    }))
    menu.append(new MenuItem({
        label: `下载头像`,
        click: () => downloadImage(`https://q1.qlogo.cn/g?b=qq&nk=${message.senderId}&s=640`),
    }))
    menu.append(new MenuItem({
        label: `发起私聊`,
        click: () => ui.startChat(message.senderId, message.username),
    }))
    if (message.senderId !== getUin() && (
        await isAdmin() === 'owner' ||
        await isAdmin() === 'admin' && message.role !== 'owner' && message.role !== 'admin'
    ))
        menu.append(new MenuItem({
            label: `移出本群`,
            click: async () => {
                const win = new BrowserWindow({
                    height: 130,
                    width: 500,
                    autoHideMenuBar: true,
                    maximizable: false,
                    modal: true,
                    parent: getMainWindow(),
                    webPreferences: {
                        contextIsolation: false,
                        nodeIntegration: true,
                    },
                })
                await win.loadURL(getWinUrl() + '#/kickAndExit/kick/' +
                    -room.roomId + '/' + message.senderId + '/' +
                    querystring.escape(room.roomName) + '/' +
                    querystring.escape(message.username))
            },
        }))
    menu.popup({window: getMainWindow()})
})
ipcMain.on('popupContactMenu', (_, remark?: string, name?: string, displayId?: number, group?: SearchableGroup) => {
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
    if (group) {
        menu.append(
            new MenuItem({
                label: group.owner_id === getUin() ? '解散本群' : '退出本群',
                click: async () => {
                    const win = new BrowserWindow({
                        height: 130,
                        width: 500,
                        autoHideMenuBar: true,
                        maximizable: false,
                        modal: true,
                        parent: getMainWindow(),
                        webPreferences: {
                            contextIsolation: false,
                            nodeIntegration: true,
                        },
                    })
                    await win.loadURL(getWinUrl() + '#/kickAndExit/' +
                        (group.owner_id === getUin() ? 'dismiss' : 'exit') + '/' +
                        displayId + '/0/' +
                        querystring.escape(remark) + '/0')
                },
            }),
        )
    }
    menu.popup({window: getMainWindow()})
})
