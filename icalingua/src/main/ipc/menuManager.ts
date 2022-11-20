import Message from '@icalingua/types/Message'
import OnlineStatusType from '@icalingua/types/OnlineStatusType'
import Room from '@icalingua/types/Room'
import SearchableGroup from '@icalingua/types/SearchableGroup'
import axios from 'axios'
import { app, clipboard, dialog, ipcMain, Menu, MenuItem, nativeImage, screen, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import querystring from 'querystring'
import getAvatarUrl from '../../utils/getAvatarUrl'
import getImageUrlByMd5 from '../../utils/getImageUrlByMd5'
import getStaticPath from '../../utils/getStaticPath'
import getWinUrl from '../../utils/getWinUrl'
import { newIcalinguaWindow } from '../../utils/IcalinguaWindow'
import socketIoProvider from '../providers/socketIoProvider'
import atCache from '../utils/atCache'
import { getConfig, saveConfigFile } from '../utils/configManager'
import exit from '../utils/exit'
import exportContacts from '../utils/exportContacts'
import exportGroupMembers from '../utils/exportGroupMembers'
import gfsTokenManager from '../utils/gfsTokenManager'
import isAdmin from '../utils/isAdmin'
import openMedia from '../utils/openMedia'
import setPriority from '../utils/setPriority'
import * as themes from '../utils/themes'
import ui from '../utils/ui'
import version from '../utils/version'
import { getMainWindow, showRequestWindow } from '../utils/windowManager'
import {
    deleteMessage,
    fetchHistory,
    fetchLatestHistory,
    getCookies,
    getGroupMemberInfo,
    getMsgNewURL,
    getRoom,
    getSelectedRoom,
    getUin,
    hideMessage,
    ignoreChat,
    makeForward,
    pinRoom,
    removeChat,
    renewMessage,
    renewMessageURL,
    requestGfsToken,
    revealMessage,
    sendMessage,
    setOnlineStatus as setStatus,
    setRoomAutoDownload,
    setRoomAutoDownloadPath,
    setRoomPriority,
    sendPacket,
} from './botAndStorage'
import { download, downloadFileByMessageData, downloadImage } from './downloadManager'
import openImage from './openImage'

const requireFunc = eval('require')
const pb = requireFunc(path.join(getStaticPath(), 'pb.js'))

const setOnlineStatus = (status: OnlineStatusType) => {
    setStatus(status)
    getConfig().account.onlineStatus = status
    updateAppMenu()
    saveConfigFile()
}
const setKeyToSendMessage = (key: 'Enter' | 'CtrlEnter' | 'ShiftEnter') => {
    getConfig().keyToSendMessage = key
    saveConfigFile()
    ui.setKeyToSendMessage(key)
    updateAppMenu()
}

{
    const initMenu = Menu.buildFromTemplate([
        {
            label: 'Icalingua++',
            submenu: [{ role: 'toggleDevTools' }],
        },
    ])
    process.platform === 'darwin' &&
        initMenu.append(
            new MenuItem({
                role: 'editMenu',
            }),
        )
    Menu.setApplicationMenu(initMenu)
}

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
            click: () => ui.confirmIgnoreChat({ id: room.roomId, name: room.roomName }),
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
                openImage(getAvatarUrl(room.roomId).replace('&s=140', '&s=0'), false)
            },
        },
        {
            label: '下载头像',
            click: () => {
                downloadImage(getAvatarUrl(room.roomId).replace('&s=140', '&s=0'))
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
        menu.append(
            new MenuItem({
                label: '查看精华消息',
                async click() {
                    const size = screen.getPrimaryDisplay().size
                    const win = newIcalinguaWindow({
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
            }),
        )
        menu.append(
            new MenuItem({
                label: '群公告',
                async click() {
                    const size = screen.getPrimaryDisplay().size
                    const win = newIcalinguaWindow({
                        height: size.height - 200,
                        width: 500,
                        autoHideMenuBar: true,
                        title: '群公告',
                    })
                    const cookies = await getCookies('qun.qq.com')
                    for (const i in cookies) {
                        await win.webContents.session.cookies.set({
                            url: 'https://web.qun.qq.com',
                            domain: '.qun.qq.com',
                            name: i,
                            value: cookies[i],
                        })
                    }
                    await win.loadURL('https://web.qun.qq.com/mannounce/index.html#gc=' + -room.roomId)
                },
            }),
        )
        menu.append(
            new MenuItem({
                label: '群文件',
                async click() {
                    let url
                    if (getConfig().adapter === 'socketIo') {
                        const token = await requestGfsToken(-room.roomId)
                        url = `${getConfig().server}/file-manager/?${token}`
                    } else {
                        const token = gfsTokenManager.create(-room.roomId)
                        url = `http://localhost:${socketIoProvider.getPort()}/file-manager/?${token}`
                    }
                    const size = screen.getPrimaryDisplay().size
                    const win = newIcalinguaWindow({
                        autoHideMenuBar: true,
                        height: size.height - 200,
                        width: 1500,
                        webPreferences: {
                            // 修复循环触发下载的问题
                            partition: 'file-manager',
                            preload: path.join(getStaticPath(), 'fileManagerPreload.js'),
                            contextIsolation: false,
                        },
                    })
                    win.webContents.session.on('will-download', (e, item) => {
                        item.cancel()
                        download(item.getURL(), item.getFilename())
                    })
                    win.loadURL(url)
                    win.webContents.executeJavaScript('window.isAdmin = "' + (await isAdmin()) + '"')
                },
            }),
        )
        menu.append(
            new MenuItem({
                label: '群荣誉',
                async click() {
                    const size = screen.getPrimaryDisplay().size
                    const win = newIcalinguaWindow({
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
            }),
        )
        menu.append(
            new MenuItem({
                label: '群相册',
                async click() {
                    const size = screen.getPrimaryDisplay().size
                    const win = newIcalinguaWindow({
                        height: size.height - 200,
                        width: 800,
                        autoHideMenuBar: true,
                    })
                    const cookies = await getCookies('qzone.qq.com')
                    for (const i in cookies) {
                        await win.webContents.session.cookies.set({
                            url: 'https://h5.qzone.qq.com',
                            name: i,
                            value: cookies[i],
                        })
                    }
                    win.webContents.setWindowOpenHandler((details) => {
                        console.log(details.url)
                        const parsedUrl = new URL(details.url)
                        if (parsedUrl.hostname === 'qungz.photo.store.qq.com') openImage(details.url)
                        else if (parsedUrl.hostname === 'download.photo.qq.com')
                            download(
                                details.url,
                                `${room.roomName}(${-room.roomId})的群相册${new Date().getTime()}.zip`,
                            )
                        return { action: 'deny' }
                    })
                    await win.loadURL('https://h5.qzone.qq.com/groupphoto/album?inqq=1&groupId=' + -room.roomId)
                },
            }),
        )
        menu.append(
            new MenuItem({
                label: '群作业',
                async click() {
                    const size = screen.getPrimaryDisplay().size
                    const win = newIcalinguaWindow({
                        height: size.height - 200,
                        width: 500,
                        autoHideMenuBar: true,
                        title: '群作业',
                        webPreferences: {
                            contextIsolation: false,
                            preload: path.join(getStaticPath(), 'homeworkPreload.js'),
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

                    await win.loadURL('https://qun.qq.com/homework/p/features#?gid=' + -room.roomId, {
                        userAgent: 'QQ/8.9.13.9280',
                    })
                },
            }),
        )
        menu.append(
            new MenuItem({
                label: '群幸运字符',
                async click() {
                    const size = screen.getPrimaryDisplay().size
                    const win = newIcalinguaWindow({
                        height: size.height - 200,
                        width: 500,
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
                    await win.loadURL('https://qun.qq.com/v2/luckyword/index?qunid=' + -room.roomId)
                },
            }),
        )
        menu.append(
            new MenuItem({
                label: '我的群昵称',
                async click() {
                    const memberInfo = await getGroupMemberInfo(-room.roomId, getUin())
                    const win = newIcalinguaWindow({
                        height: 190,
                        width: 600,
                        autoHideMenuBar: true,
                        webPreferences: {
                            contextIsolation: false,
                            nodeIntegration: true,
                        },
                    })
                    await win.loadURL(
                        getWinUrl() +
                            '#/groupNickEdit/' +
                            -room.roomId +
                            '/' +
                            querystring.escape(room.roomName) +
                            '/' +
                            querystring.escape(memberInfo.card || memberInfo.nickname),
                    )
                },
            }),
        )
        menu.append(
            new MenuItem({
                label: '成员活跃数据',
                async click() {
                    const size = screen.getPrimaryDisplay().size
                    const win = newIcalinguaWindow({
                        height: size.height - 200,
                        width: 500,
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
                    await win.loadURL('https://qun.qq.com/m/qun/activedata/active.html?gc=' + -room.roomId)
                },
            }),
        )
        menu.append(
            new MenuItem({
                label: '群成员',
                async click() {
                    ui.openGroupMemberPanel(true)
                },
            }),
        )
        menu.append(
            new MenuItem({
                label: '群成员管理',
                async click() {
                    const win = newIcalinguaWindow({
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
                    win.webContents.on('dom-ready', () =>
                        win.webContents.insertCSS(
                            '.header,.footer>p:not(:last-child),#changeGroup{display:none} ' +
                                '.body{padding-top:0 !important;margin:0 !important}',
                        ),
                    )
                    await win.loadURL('https://qun.qq.com/member.html#gid=' + -room.roomId)
                },
            }),
        )
        menu.append(
            new MenuItem({
                label: '导出群成员',
                click() {
                    exportGroupMembers(-room.roomId)
                },
            }),
        )
    } else {
        // menu.append(new MenuItem({
        //     label: 'ta 的线索',
        //     async click() {
        //         const size = screen.getPrimaryDisplay().size
        //         const win = newIcalinguaWindow({
        //             height: size.height - 200,
        //             width: 500,
        //             autoHideMenuBar: true,
        //         })
        //         const cookies = await getCookies('ti.qq.com')
        //         for (const i in cookies) {
        //             await win.webContents.session.cookies.set({
        //                 url: 'https://ti.qq.com',
        //                 name: i,
        //                 value: cookies[i],
        //             })
        //         }
        //         await win.loadURL('https://ti.qq.com/friends/recall?uin=' + room.roomId)
        //     },
        // }))
        menu.append(
            new MenuItem({
                label: '互动标识',
                async click() {
                    const size = screen.getPrimaryDisplay().size
                    const win = newIcalinguaWindow({
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
            }),
        )
        menu.append(
            new MenuItem({
                label: '幸运字符',
                async click() {
                    const size = screen.getPrimaryDisplay().size
                    const win = newIcalinguaWindow({
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
                    await win.loadURL('https://ti.qq.com/interactive_logo/word?target_uin=' + room.roomId)
                },
            }),
        )
        menu.append(
            new MenuItem({
                label: '照片墙',
                async click() {
                    const size = screen.getPrimaryDisplay().size
                    const win = newIcalinguaWindow({
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
                    win.webContents.executeJavaScript(
                        fs.readFileSync(path.join(getStaticPath(), 'photoWallInj.js'), 'utf-8'),
                    )
                },
            }),
        )
    }
    menu.append(
        new MenuItem({
            label: '获取历史消息',
            click: () => fetchLatestHistory(room.roomId),
        }),
    )
    return menu
}

let versionClickTimes = 0

export const updateAppMenu = async () => {
    let globalMenu = {
        //应用菜单
        app: [
            new MenuItem({
                label: version.version,
                enabled: !version.isProduction && getConfig().debugmode === false && versionClickTimes < 3,
                click: () => {
                    versionClickTimes++
                    setTimeout(() => {
                        versionClickTimes--
                        updateAppMenu()
                    }, 10000)
                    updateAppMenu()
                },
            }),
            new MenuItem({
                label: 'GitHub',
                click: () => shell.openExternal('https://github.com/Icalingua-plus-plus/Icalingua-plus-plus'),
            }),
            new MenuItem({
                label: '验证消息',
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
                    const win = newIcalinguaWindow({
                        height: 230,
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
                label: '合并转发 DEBUG',
                visible: getConfig().debugmode === true,
                async click() {
                    const win = newIcalinguaWindow({
                        height: 520,
                        width: 600,
                        autoHideMenuBar: true,
                        webPreferences: {
                            contextIsolation: false,
                            nodeIntegration: true,
                        },
                    })
                    await win.loadURL(getWinUrl() + '#/makeForward')
                },
            }),
            new MenuItem({
                label: '重新加载',
                click: () => {
                    ui.chroom(0)
                    getMainWindow().reload()
                },
            }),
            new MenuItem({
                label: '清除缓存并重新加载',
                click: () => {
                    ui.chroom(0)
                    getMainWindow().webContents.session.clearCache()
                    getMainWindow().reload()
                },
            }),
            new MenuItem({
                label: '开发者工具',
                role: 'toggleDevTools',
            }),
            new MenuItem({
                label: '关闭窗口',
                role: 'close',
            }),
            new MenuItem({
                label: '退出',
                click: exit,
            }),
        ] as (Electron.MenuItem | Electron.MenuItemConstructorOptions)[],
        priority: new MenuItem({
            label: '通知优先级',
            submenu: [
                // @ts-ignore TS 出 bug 了
                ...[1, 2, 3, 4, 5].map((e) => ({
                    type: 'radio',
                    label: `${e}`,
                    checked: getConfig().priority === e,
                    // @ts-ignore
                    click: () => setPriority(e),
                })),
                {
                    // @ts-ignore
                    type: 'separator',
                },
                // @ts-ignore
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
            new MenuItem({
                label: '管理屏蔽的会话',
                click: () => {
                    const size = screen.getPrimaryDisplay().size
                    const win = newIcalinguaWindow({
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
                    const win = newIcalinguaWindow({
                        height: 485,
                        width: 500,
                        maximizable: false,
                        webPreferences: {
                            nodeIntegration: true,
                            contextIsolation: false,
                        },
                        autoHideMenuBar: true,
                    })
                    win.loadURL(getWinUrl() + '#/aria2')
                },
            }),
            new MenuItem({
                label: '发送消息快捷键',
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
                label: '启用高亮 URL 功能',
                type: 'checkbox',
                checked: getConfig().linkify,
                click: (menuItem) => {
                    getConfig().linkify = menuItem.checked
                    saveConfigFile()
                    ui.message('高亮 URL 功能已' + (menuItem.checked ? '开启' : '关闭') + '，重新加载后生效')
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
                label: '启动时自动获取历史消息',
                type: 'checkbox',
                checked: getConfig().fetchHistoryOnStart,
                visible: getConfig().adapter === 'oicq', // Bridge is enabled by default
                click: (menuItem) => {
                    getConfig().fetchHistoryOnStart = menuItem.checked
                    saveConfigFile()
                },
            }),
            new MenuItem({
                label: '静默获取历史消息',
                type: 'checkbox',
                checked: getConfig().silentFetchHistory,
                click: (menuItem) => {
                    getConfig().silentFetchHistory = menuItem.checked
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
                label: '启用插件',
                type: 'checkbox',
                checked: getConfig().custom === true,
                visible: getConfig().adapter === 'oicq', // TODO: 修改 Bridge 的配置
                click: (menuItem) => {
                    getConfig().custom = menuItem.checked
                    saveConfigFile()
                },
            }),
            new MenuItem({
                label: 'DEBUG MODE',
                type: 'checkbox',
                checked: getConfig().debugmode === true,
                visible: !version.isProduction && (versionClickTimes >= 3 || getConfig().debugmode === true),
                click: (menuItem) => {
                    getConfig().debugmode = menuItem.checked
                    if (!menuItem.checked) {
                        getConfig().anonymous = false
                    }
                    saveConfigFile()
                    updateAppMenu()
                },
            }),
            new MenuItem({
                label: '以匿名方式发送群消息（未完善，慎用）',
                type: 'checkbox',
                checked: getConfig().anonymous === true,
                visible: getConfig().debugmode === true && getConfig().sendRawMessage === false,
                click: (menuItem) => {
                    getConfig().anonymous = menuItem.checked
                    saveConfigFile()
                },
            }),
            new MenuItem({
                label: 'Send raw message',
                type: 'checkbox',
                checked: getConfig().sendRawMessage === true,
                visible: getConfig().debugmode === true,
                click: (menuItem) => {
                    getConfig().sendRawMessage = menuItem.checked
                    saveConfigFile()
                    updateAppMenu()
                },
            }),
            new MenuItem({
                label: '隐藏聊天图片',
                type: 'checkbox',
                checked: getConfig().hideChatImageByDefault,
                click: (menuItem) => {
                    getConfig().hideChatImageByDefault = menuItem.checked
                    saveConfigFile()
                    ui.message('隐藏聊天图片已' + (menuItem.checked ? '开启' : '关闭'))
                    ui.setHideChatImageByDefault(menuItem.checked)
                },
            }),
            new MenuItem({
                label: '主题',
                submenu: (() => {
                    let rsp: Electron.MenuItemConstructorOptions[] = [
                        {
                            label: '跟随系统',
                            type: 'radio',
                            checked: getConfig().theme == 'auto',
                            click() {
                                getConfig().theme = 'auto'
                                themes.autoSetTheme()
                                saveConfigFile()
                                updateAppMenu()
                            },
                        },
                    ]
                    for (let theme of themes.getThemeList()) {
                        rsp.push({
                            label: theme,
                            type: 'radio',
                            checked: getConfig().theme == theme,
                            click: ((t) => () => {
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
            new MenuItem({
                label: '性能优化方式',
                submenu: (() => {
                    let rsp: Electron.MenuItemConstructorOptions[] = [
                        {
                            label: 'infinite-loading (默认)',
                            sublabel: '较慢，但更稳定',
                            type: 'radio',
                            checked: getConfig().optimizeMethod == 'infinite-loading',
                            click() {
                                getConfig().optimizeMethod = 'infinite-loading'
                                ui.setOptimizeMethodSetting('infinite-loading')
                                saveConfigFile()
                                updateAppMenu()
                            },
                        },
                        {
                            label: '滚动 (实验性)',
                            sublabel: '预加载，有 BUG',
                            type: 'radio',
                            checked: getConfig().optimizeMethod == 'scroll',
                            click() {
                                getConfig().optimizeMethod = 'scroll'
                                ui.setOptimizeMethodSetting('scroll')
                                saveConfigFile()
                                updateAppMenu()
                            },
                        },
                        {
                            label: '关闭 (不推荐)',
                            sublabel: '不优化，快进到卡死 (',
                            type: 'radio',
                            checked: getConfig().optimizeMethod == 'none',
                            click() {
                                ui.chroom(0)
                                ui.message(
                                    '不建议关闭性能优化，关闭后长时间挂机或浏览历史记录极易导致前端卡死。' +
                                        '关闭后若前端卡死，可尝试杀死渲染进程并重新加载，亦可直接重启。',
                                )
                                getConfig().optimizeMethod = 'none'
                                ui.setOptimizeMethodSetting('none')
                                saveConfigFile()
                                updateAppMenu()
                            },
                        },
                    ]
                    return rsp
                })(),
            }),
            new MenuItem({
                label: '缩放比例',
                submenu: [100, 110, 125, 150, 175, 200].map((factor) => ({
                    type: 'radio',
                    label: `${factor}%`,
                    checked: getConfig().zoomFactor === factor,
                    click: () => {
                        getMainWindow().webContents.setZoomFactor(factor / 100)
                        getConfig().zoomFactor = factor
                        saveConfigFile()
                        updateAppMenu()
                    },
                })),
            }),
        ],
        //捷径
        shortcuts: Object.entries(getConfig().shortcuts).map(
            ([key, value]) =>
                new MenuItem({
                    label: key,
                    click: () => {
                        ui.chroom(value)
                    },
                }),
        ),
    }
    let template = [
        {
            label: 'Icalingua++',
            submenu: Menu.buildFromTemplate(globalMenu.app),
        },
    ] as (Electron.MenuItem | Electron.MenuItemConstructorOptions)[]
    process.platform === 'darwin' &&
        template.push({
            role: 'editMenu',
        })
    template.push(globalMenu.priority)
    template.push({
        label: '选项',
        submenu: Menu.buildFromTemplate(globalMenu.options),
    })
    const menu = Menu.buildFromTemplate(template)
    if (globalMenu.shortcuts.length) {
        menu.append(
            new MenuItem({
                label: '捷径',
                submenu: Menu.buildFromTemplate(globalMenu.shortcuts),
            }),
        )
    }
    const selectedRoom = await getSelectedRoom()
    if (selectedRoom) {
        menu.append(
            new MenuItem({
                label: `${selectedRoom.roomName}(${Math.abs(selectedRoom.roomId)})`,
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
    if ((message.deleted || message.hide) && !message.reveal)
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
        if (getConfig().debugmode) {
            menu.append(
                new MenuItem({
                    label: '复制时间戳',
                    type: 'normal',
                    click: () => {
                        clipboard.writeText(message.time.toString())
                    },
                }),
            )
            menu.append(
                new MenuItem({
                    label: '复制原始消息 JSON',
                    type: 'normal',
                    click: () => {
                        clipboard.writeText(JSON.stringify(message))
                    },
                }),
            )
            menu.append(
                new MenuItem({
                    label: '合并转发本条消息（单条，仅支持文本）',
                    type: 'normal',
                    visible: false, //MultiForward panel instead
                    click: () => {
                        const msgtoforward = {
                            user_id: message.senderId,
                            message: message.content,
                            nickname: message.username,
                            time: message.time / 1000,
                        }
                        makeForward(msgtoforward)
                    },
                }),
            )
            menu.append(
                new MenuItem({
                    label: '尝试撤回本条消息',
                    type: 'normal',
                    click: () => {
                        deleteMessage(room.roomId, message._id as string)
                    },
                }),
            )
            menu.append(
                new MenuItem({
                    type: 'separator',
                }),
            )
        }
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
        if (message.replyMessage && !history) {
            menu.append(
                new MenuItem({
                    label: '复制回复消息 ID',
                    type: 'normal',
                    click: () => {
                        clipboard.writeText(String(message.replyMessage._id))
                    },
                }),
            )
        }
        if (message.replyMessage && message.replyMessage.file) {
            if (message.replyMessage.file.type.startsWith('image/'))
                menu.append(
                    new MenuItem({
                        label: '复制回复图片',
                        type: 'normal',
                        click: async () => copyImage(message.replyMessage.file.url),
                    }),
                )
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
                    click: () =>
                        downloadFileByMessageData({
                            message: message.replyMessage,
                            room,
                            action: 'download',
                        }),
                }),
            )
        }
        if (message.files) {
            for (let i = 0; i < message.files.length; i++) {
                const file = message.files[i]
                if (menu.items.length && menu.items[menu.items.length - 1].type !== 'separator')
                    //只有在上面有内容而且不是分隔符的时候加
                    menu.append(
                        new MenuItem({
                            type: 'separator',
                        }),
                    )
                menu.append(
                    new MenuItem({
                        enabled: false,
                        label: `文件#${i}`,
                    }),
                )
                if (file.type.startsWith('image/')) {
                    menu.append(
                        new MenuItem({
                            label: '复制图片',
                            type: 'normal',
                            click: async () => copyImage(file.url),
                        }),
                    )
                    menu.append(
                        new MenuItem({
                            label: '添加为默认表情',
                            type: 'normal',
                            click: () => {
                                download(
                                    file.url,
                                    String(new Date().getTime()),
                                    path.join(app.getPath('userData'), 'stickers'),
                                )
                            },
                        }),
                    )
                    menu.append(
                        new MenuItem({
                            label: '添加为分类表情',
                            type: 'normal',
                            visible: false, // TODO
                            click: () => {
                                download(
                                    file.url,
                                    String(new Date().getTime()),
                                    path.join(app.getPath('userData'), 'stickers'),
                                )
                            },
                        }),
                    )
                }
                menu.append(
                    new MenuItem({
                        label: '复制 URL',
                        type: 'normal',
                        click: () => {
                            clipboard.writeText(file.url)
                        },
                    }),
                )
                if (file.type.startsWith('image/'))
                    menu.append(
                        new MenuItem({
                            label: '使用本地查看器打开',
                            click: () => openImage(file.url, true),
                        }),
                    )
                if (file.type.startsWith('video/') || file.type.startsWith('audio/'))
                    menu.append(
                        new MenuItem({
                            label: '使用本地播放器打开',
                            click: () => openMedia(file.url),
                        }),
                    )
                if (file.type.startsWith('video/'))
                    menu.append(
                        new MenuItem({
                            label: '刷新视频地址',
                            click: async () => {
                                const newUrl = await getMsgNewURL(String(message._id))
                                if (newUrl !== 'error') {
                                    renewMessageURL(room.roomId, message._id, newUrl)
                                } else {
                                    ui.messageError('获取视频地址失败')
                                }
                            },
                        }),
                    )
                if (file.type.startsWith('image/'))
                    menu.append(
                        new MenuItem({
                            label: '下载',
                            click: () => downloadImage(file.url),
                        }),
                    )
                else
                    menu.append(
                        new MenuItem({
                            label: '下载',
                            click: () => downloadFileByMessageData({ action: 'download', message, room }),
                        }),
                    )
                menu.append(
                    new MenuItem({
                        type: 'separator',
                    }),
                )
            }
        } else if (message.file) {
            if (message.file.type.includes('image')) {
                menu.append(
                    new MenuItem({
                        label: '复制图片',
                        type: 'normal',
                        click: async () => copyImage(message.file.url),
                    }),
                )
                menu.append(
                    new MenuItem({
                        label: '添加为表情',
                        type: 'normal',
                        click: () => {
                            download(
                                message.file.url,
                                String(new Date().getTime()),
                                path.join(app.getPath('userData'), 'stickers'),
                            )
                        },
                    }),
                )
            }
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
                        click: () => openImage(message.file.url, true),
                    }),
                )
            if (message.file.type.startsWith('video/') || message.file.type.startsWith('audio/'))
                menu.append(
                    new MenuItem({
                        label: '使用本地播放器打开',
                        click: () => openMedia(message.file.url),
                    }),
                )
            menu.append(
                new MenuItem({
                    label: '下载',
                    click: () => downloadFileByMessageData({ action: 'download', message, room }),
                }),
            )
        }
        menu.append(
            new MenuItem({
                label: history
                    ? message._id !== -1
                        ? `复制转发来源 ID ${message._id}`
                        : '转发来源未知（可能来自私聊消息）'
                    : '复制消息 ID',
                type: 'normal',
                enabled: !(history && message._id === -1),
                click: () => {
                    clipboard.writeText(String(message._id))
                },
            }),
        )
        if (
            (message.senderId === getUin() || ((await isAdmin()) && message.role !== 'owner')) &&
            !history &&
            !message.deleted
        )
            menu.append(
                new MenuItem({
                    label: '撤回',
                    click: () => {
                        if (message.senderId === getUin()) {
                            deleteMessage(room.roomId, message._id as string)
                        } else {
                            ui.confirmDeleteMessage(room.roomId, message._id as string)
                        }
                    },
                }),
            )
        if (message.senderId === getUin() && !history && !message.deleted)
            menu.append(
                new MenuItem({
                    label: '一分钟后撤回',
                    click: () => {
                        setTimeout(() => deleteMessage(room.roomId, message._id as string), 1000 * 60)
                    },
                }),
            )
        if (await isAdmin() && !history && !message.deleted) {
            if (room.roomId < 0) {
                menu.append(
                    new MenuItem({
                        label: '设为精华',
                        click: () => {
                            const parsed = Buffer.from(message._id as string, "base64")
                            const seqid = parsed.readUInt32BE(8)
                            const random = parsed.readUInt32BE(12)
                            ;(async () => {
                                const retPacket = await sendPacket('Oidb','OidbSvc.0xeac_1', {
                                    1: -room.roomId,
                                    2: seqid,
                                    3: random,
                                })
                                const ret = pb.decode(retPacket)[4]
                                if (ret[1]) {
                                    ui.messageError(ret[1].toString())
                                } else {
                                    ui.messageSuccess('设置精华成功')
                                }
                            })()
                        },
                    }),
                )
                menu.append(
                    new MenuItem({
                        label: '移出精华',
                        click: () => {
                            const parsed = Buffer.from(message._id as string, "base64")
                            const seqid = parsed.readUInt32BE(8)
                            const random = parsed.readUInt32BE(12)
                            ;(async () => {
                                const retPacket = await sendPacket('Oidb','OidbSvc.0xeac_2', {
                                    1: -room.roomId,
                                    2: seqid,
                                    3: random,
                                })
                                const ret = pb.decode(retPacket)[4]
                                if (ret[1]) {
                                    ui.messageError(ret[1].toString())
                                } else {
                                    ui.messageSuccess('移出精华成功')
                                }
                            })()
                        },
                    }),
                )
            }
        }
        if (!history) {
            menu.append(
                new MenuItem({
                    label: '多选',
                    type: 'normal',
                    click: () => {
                        ui.startForward(message._id as string)
                    },
                }),
            )
        }
        if (!history) {
            menu.append(
                new MenuItem({
                    label: '隐藏',
                    click: () => {
                        hideMessage(room.roomId, message._id as string)
                    },
                }),
            )
        }
        if (!history && !message.flash) {
            menu.append(
                new MenuItem({
                    label: '回复',
                    click: () => {
                        ui.replyMessage(message)
                    },
                }),
            )
            if (!message.file || message.file.type.startsWith('image/'))
                menu.append(
                    new MenuItem({
                        label: '+1',
                        click: () => {
                            let messageType
                            if (getConfig().anonymous) messageType = 'anonymous'
                            if (getConfig().sendRawMessage || !getConfig().debugmode) messageType = undefined
                            const msgToSend = {
                                content: message.content,
                                replyMessage: message.replyMessage,
                                imgpath: undefined,
                                at: [],
                                messageType,
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
            menu.append(
                new MenuItem({
                    label: '重新获取该消息内容',
                    click: () => renewMessage(room.roomId, message._id as string, message),
                }),
            )
        }
    }
    menu.popup({ window: getMainWindow() })
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
    ]).popup({ window: getMainWindow() })
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
            label: 'Send rps',
            type: 'normal',
            click() {
                ui.sendRps()
                ui.closePanel()
            },
        },
        {
            label: 'Send dice',
            type: 'normal',
            click() {
                ui.sendDice()
                ui.closePanel()
            },
        },
        {
            label: 'Send shake',
            type: 'normal',
            click() {
                sendMessage({
                    content: '[窗口抖动]',
                    at: [],
                    messageType: 'shake',
                })
                ui.closePanel()
            },
        },
        {
            label: 'Close panel',
            type: 'normal',
            click: ui.closePanel,
        },
    ]).popup({ window: getMainWindow() })
})
ipcMain.on('popupStickerItemMenu', (_, itemName: string) => {
    const menu: (Electron.MenuItemConstructorOptions | Electron.MenuItem)[] = []
    if (/^https?:\/\//i.test(itemName)) {
        menu.push({
            label: '添加到本地表情',
            type: 'normal',
            click() {
                download(itemName, String(new Date().getTime()), path.join(app.getPath('userData'), 'stickers'))
            },
        })
    } else {
        menu.push({
            label: '以图片方式发送',
            type: 'normal',
            click() {
                ui.pasteGif(itemName)
            },
        })
        menu.push({
            label: '查看大图',
            type: 'normal',
            click() {
                openImage(itemName)
            },
        })
        menu.push({
            label: '移动到分类',
            type: 'normal',
            click() {
                ui.moveSticker(itemName)
            },
        })
        menu.push({
            label: '删除',
            type: 'normal',
            click() {
                ui.confirmDeleteSticker(itemName)
            },
        })
    }
    Menu.buildFromTemplate(menu).popup({ window: getMainWindow() })
})
ipcMain.on('popupStickerDirMenu', (_, dirName: string) => {
    const menu: (Electron.MenuItemConstructorOptions | Electron.MenuItem)[] = []
    menu.push({
        label: `删除分类 ${dirName}`,
        type: 'normal',
        enabled: dirName !== 'Default',
        click() {
            ui.confirmDeleteStickerDir(dirName)
        },
    })

    Menu.buildFromTemplate(menu).popup({ window: getMainWindow() })
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
        menu.append(
            new MenuItem({
                label: 'at',
                click() {
                    atCache.push({
                        text: '@' + message.username,
                        id: message.senderId,
                    })
                    ui.addMessageText('@' + message.username + ' ')
                },
            }),
        )
    menu.append(
        new MenuItem({
            label: `查看头像`,
            click: () => {
                if (message.mirai && message.mirai.eqq.avatarMd5) {
                    openImage(getImageUrlByMd5(message.mirai.eqq.avatarMd5))
                } else if (message.mirai && message.mirai.eqq.avatarUrl) {
                    const QCLOUD_AVATAR_REGEX =
                        /^https:\/\/[a-z0-9\-]+\.cos\.[a-z\-]+\.myqcloud\.com\/[0-9]+-[0-9]+\.jpg$/
                    if (QCLOUD_AVATAR_REGEX.test(message.mirai.eqq.avatarUrl)) openImage(message.mirai.eqq.avatarUrl)
                } else {
                    openImage(`https://q1.qlogo.cn/g?b=qq&nk=${message.senderId}&s=0`)
                }
            },
        }),
    )
    menu.append(
        new MenuItem({
            label: `下载头像`,
            click: () => downloadImage(`https://q1.qlogo.cn/g?b=qq&nk=${message.senderId}&s=0`),
        }),
    )
    menu.append(
        new MenuItem({
            label: `发起私聊`,
            click: () => ui.startChat(message.senderId, message.username),
        }),
    )
    menu.append(
        new MenuItem({
            label: `屏蔽此人`,
            click: () => ui.confirmIgnoreChat({ id: message.senderId, name: message.username }),
        }),
    )
    if (
        message.senderId !== getUin() &&
        ((await isAdmin()) === 'owner' ||
            ((await isAdmin()) === 'admin' && message.role !== 'owner' && message.role !== 'admin'))
    ) {
        menu.append(
            new MenuItem({
                label: `禁言`,
                visible: room.roomId !== 0,
                click: async () => {
                    const win = newIcalinguaWindow({
                        height: 210,
                        width: 600,
                        autoHideMenuBar: true,
                        maximizable: false,
                        modal: true,
                        parent: getMainWindow(),
                        webPreferences: {
                            contextIsolation: false,
                            nodeIntegration: true,
                        },
                    })
                    await win.loadURL(
                        getWinUrl() +
                            '#/MuteUser/' +
                            -room.roomId +
                            '/' +
                            message.senderId +
                            '/' +
                            querystring.escape(room.roomName) +
                            '/' +
                            querystring.escape(message.username) +
                            '/' +
                            querystring.escape(message.anonymousflag),
                    )
                },
            }),
        )
        menu.append(
            new MenuItem({
                label: `移出本群`,
                visible: room.roomId !== 0,
                click: async () => {
                    const win = newIcalinguaWindow({
                        height: 150,
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
                    await win.loadURL(
                        getWinUrl() +
                            '#/kickAndExit/kick/' +
                            -room.roomId +
                            '/' +
                            message.senderId +
                            '/' +
                            querystring.escape(room.roomName) +
                            '/' +
                            querystring.escape(message.username),
                    )
                },
            }),
        )
    }
    menu.popup({ window: getMainWindow() })
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
    if (name && name !== remark) {
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
                    const win = newIcalinguaWindow({
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
                    await win.loadURL(
                        getWinUrl() +
                            '#/kickAndExit/' +
                            (group.owner_id === getUin() ? 'dismiss' : 'exit') +
                            '/' +
                            displayId +
                            '/0/' +
                            querystring.escape(remark) +
                            '/0',
                    )
                },
            }),
        )
    }
    menu.popup({ window: getMainWindow() })
})

const copyImage = async (url: string) => {
    // console.log(clipboard.availableFormats(),clipboard.read('text/uri-list'))
    if (url.startsWith('data:')) {
        // base64 图片
        clipboard.writeImage(nativeImage.createFromDataURL(url))
        return
    }
    // 如果url是本地地址，则直接读取
    if (!url.startsWith('http')) {
        const image = nativeImage.createFromPath(url)
        if (!image.isEmpty()) {
            clipboard.writeImage(image)
        } else {
            clipboard.writeHTML(`<img src="${url}" >`)
            //clipboard.write({text: url, type: 'text/uri-list'})
        }
        return
    }
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        proxy: false,
    })
    const buf = Buffer.from(res.data, 'binary')
    const image = nativeImage.createFromBuffer(buf)
    if (!image.isEmpty()) {
        clipboard.writeImage(image)
    } else {
        clipboard.writeHTML(`<img src="${url}" >`)
    }
}

ipcMain.on(
    'popupGroupMemberMenu',
    async (_, remark?: string, name?: string, displayId?: number, group?: SearchableGroup) => {
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
        if (name && name !== remark) {
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
                    label: 'at',
                    click: async () => {
                        atCache.push({
                            text: '@' + remark,
                            id: displayId,
                        })
                        ui.addMessageText('@' + remark + ' ')
                        ui.openGroupMemberPanel(false)
                    },
                }),
            )
            menu.append(
                new MenuItem({
                    label: '禁言',
                    visible: (await isAdmin()) !== false,
                    click: async () => {
                        const selectedRoom = await getSelectedRoom()
                        const win = newIcalinguaWindow({
                            height: 300,
                            width: 600,
                            autoHideMenuBar: true,
                            maximizable: false,
                            modal: true,
                            parent: getMainWindow(),
                            webPreferences: {
                                contextIsolation: false,
                                nodeIntegration: true,
                            },
                        })
                        await win.loadURL(
                            getWinUrl() +
                                '#/MuteUser/' +
                                group +
                                '/' +
                                displayId +
                                '/' +
                                querystring.escape(selectedRoom.roomName) +
                                '/' +
                                querystring.escape(remark) +
                                '/' +
                                'null',
                        )
                    },
                }),
            )
            menu.append(
                new MenuItem({
                    label: '移出本群',
                    visible: (await isAdmin()) !== false,
                    click: async () => {
                        const selectedRoom = await getSelectedRoom()
                        const win = newIcalinguaWindow({
                            height: 150,
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
                        await win.loadURL(
                            getWinUrl() +
                                '#/kickAndExit/kick/' +
                                group +
                                '/' +
                                displayId +
                                '/' +
                                querystring.escape(selectedRoom.roomName) +
                                '/' +
                                querystring.escape(remark),
                        )
                    },
                }),
            )
        }
        menu.popup({ window: getMainWindow() })
    },
)
