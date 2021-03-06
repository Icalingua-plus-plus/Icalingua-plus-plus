import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, MenuItem, nativeImage, screen, shell } from 'electron'
import { getConfig, saveConfigFile } from '../utils/configManager'
import exit from '../utils/exit'
import { getMainWindow, showRequestWindow } from '../utils/windowManager'
import openImage from './openImage'
import path from 'path'
import OnlineStatusType from '../../types/OnlineStatusType'
import {
    deleteMessage,
    hideMessage,
    fetchHistory,
    fetchLatestHistory,
    getRoom,
    getSelectedRoom,
    ignoreChat,
    pinRoom,
    removeChat,
    revealMessage,
    renewMessageURL,
    sendMessage,
    setRoomAutoDownload,
    setRoomAutoDownloadPath,
    setRoomPriority,
    setOnlineStatus as setStatus,
    getUin,
    getCookies,
    getGroupMemberInfo,
    requestGfsToken,
    getMsgNewURL,
    makeForward,
} from './botAndStorage'
import Room from '../../types/Room'
import { download, downloadFileByMessageData, downloadImage } from './downloadManager'
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
import gfsTokenManager from '../utils/gfsTokenManager'
import socketIoProvider from '../providers/socketIoProvider'
import { newIcalinguaWindow } from '../../utils/IcalinguaWindow'

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

Menu.setApplicationMenu(
    Menu.buildFromTemplate([
        {
            role: 'toggleDevTools',
        },
    ]),
)

const buildRoomMenu = (room: Room): Menu => {
    const pinTitle = room.index ? '????????????' : '??????'
    const updateRoomPriority = (lev: 1 | 2 | 3 | 4 | 5) => setRoomPriority(room.roomId, lev)
    const menu = Menu.buildFromTemplate([
        {
            label: '?????????',
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
            label: '????????????',
            click: () => removeChat(room.roomId),
        },
        {
            label: '????????????',
            click: () => ignoreChat({ id: room.roomId, name: room.roomName }),
        },
        {
            label: '????????????',
            click: () => {
                clipboard.writeText(room.roomName)
            },
        },
        {
            label: '?????? ID',
            click: () => {
                clipboard.writeText(String(Math.abs(room.roomId)))
            },
        },
        {
            label: '????????????',
            click: () => {
                openImage(getAvatarUrl(room.roomId), false)
            },
        },
        {
            label: '????????????',
            click: () => {
                downloadImage(getAvatarUrl(room.roomId))
            },
        },
        {
            label: '????????????',
            submenu: [
                {
                    type: 'checkbox',
                    label: '????????????',
                    checked: !!room.autoDownload,
                    click: (menuItem) => setRoomAutoDownload(room.roomId, menuItem.checked),
                },
                {
                    label: '??????????????????',
                    click: () => {
                        const selection = dialog.showOpenDialogSync(getMainWindow(), {
                            title: '??????????????????',
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
                label: '??????????????????',
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
                label: '?????????',
                async click() {
                    const size = screen.getPrimaryDisplay().size
                    const win = newIcalinguaWindow({
                        height: size.height - 200,
                        width: 500,
                        autoHideMenuBar: true,
                        title: '?????????',
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
            }),
        )
        menu.append(
            new MenuItem({
                label: '?????????',
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
                            // ?????????????????????????????????
                            partition: 'file-manager',
                        },
                    })
                    win.webContents.session.on('will-download', (e, item) => {
                        item.cancel()
                        download(item.getURL(), item.getFilename())
                    })
                    win.loadURL(url)
                },
            }),
        )
        menu.append(
            new MenuItem({
                label: '?????????',
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
                label: '???????????????',
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
                label: '???????????????',
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
                label: '??????????????????',
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
                label: '?????????',
                async click() {
                    ui.openGroupMemberPanel(true)
                },
            }),
        )
        menu.append(
            new MenuItem({
                label: '???????????????',
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
                label: '???????????????',
                click() {
                    exportGroupMembers(-room.roomId)
                },
            }),
        )
    } else {
        // menu.append(new MenuItem({
        //     label: 'ta ?????????',
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
                label: '????????????',
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
                label: '????????????',
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
                label: '?????????',
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
            label: '??????????????????',
            click: () => fetchLatestHistory(room.roomId),
        }),
    )
    return menu
}

let versionClickTimes = 0

export const updateAppMenu = async () => {
    let globalMenu = {
        //????????????
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
                label: '????????????',
                click: () => showRequestWindow(),
            }),
            new MenuItem({
                label: '????????????',
                submenu: [
                    {
                        label: '????????????',
                        click: () => exportContacts('friend'),
                    },
                    {
                        label: '?????????',
                        click: () => exportContacts('group'),
                    },
                ],
            }),
            new MenuItem({
                label: '????????????????????????',
                async click() {
                    const win = newIcalinguaWindow({
                        height: 190,
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
                label: '???????????? DEBUG',
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
                label: '????????????',
                click: () => {
                    ui.chroom(0)
                    getMainWindow().reload()
                },
            }),
            new MenuItem({
                label: '???????????????????????????',
                click: () => {
                    ui.chroom(0)
                    getMainWindow().webContents.session.clearCache()
                    getMainWindow().reload()
                },
            }),
            new MenuItem({
                label: '???????????????',
                role: 'toggleDevTools',
            }),
            new MenuItem({
                label: '??????',
                click: exit,
            }),
        ],
        priority: new MenuItem({
            label: '???????????????',
            submenu: [
                // @ts-ignore TS ??? bug ???
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
                    label: '??????',
                    click: () => openImage(path.join(getStaticPath(), 'notification.webp')),
                },
            ],
        }),
        //??????
        options: [
            new MenuItem({
                label: '????????????',
                submenu: [
                    {
                        type: 'radio',
                        label: '??????',
                        checked: getConfig().account.onlineStatus === OnlineStatusType.Online,
                        click: () => setOnlineStatus(OnlineStatusType.Online),
                    },
                    {
                        type: 'radio',
                        label: '??????',
                        checked: getConfig().account.onlineStatus === OnlineStatusType.Afk,
                        click: () => setOnlineStatus(OnlineStatusType.Afk),
                    },
                    {
                        type: 'radio',
                        label: '??????',
                        checked: getConfig().account.onlineStatus === OnlineStatusType.Hide,
                        click: () => setOnlineStatus(OnlineStatusType.Hide),
                    },
                    {
                        type: 'radio',
                        label: '??????',
                        checked: getConfig().account.onlineStatus === OnlineStatusType.Busy,
                        click: () => setOnlineStatus(OnlineStatusType.Busy),
                    },
                    {
                        type: 'radio',
                        label: 'Q??????',
                        checked: getConfig().account.onlineStatus === OnlineStatusType.Qme,
                        click: () => setOnlineStatus(OnlineStatusType.Qme),
                    },
                    {
                        type: 'radio',
                        label: '????????????',
                        checked: getConfig().account.onlineStatus === OnlineStatusType.DontDisturb,
                        click: () => setOnlineStatus(OnlineStatusType.DontDisturb),
                    },
                ],
            }),
            new MenuItem({
                label: '?????????????????????',
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
                label: 'Aria2 ?????????????????????',
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
                label: '?????????????????????',
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
                label: '????????????',
                type: 'checkbox',
                checked: getConfig().account.autologin,
                click: (menuItem) => {
                    getConfig().account.autologin = menuItem.checked
                    saveConfigFile()
                },
            }),
            new MenuItem({
                label: '???????????? URL ??????',
                type: 'checkbox',
                checked: getConfig().linkify,
                click: (menuItem) => {
                    getConfig().linkify = menuItem.checked
                    saveConfigFile()
                    ui.message('?????? URL ?????????' + (menuItem.checked ? '??????' : '??????') + '????????????????????????')
                },
            }),
            new MenuItem({
                label: '?????????????????????????????????????????????',
                type: 'checkbox',
                checked: getConfig().fetchHistoryOnChatOpen,
                click: (menuItem) => {
                    getConfig().fetchHistoryOnChatOpen = menuItem.checked
                    saveConfigFile()
                },
            }),
            new MenuItem({
                label: '?????????????????????????????????',
                type: 'checkbox',
                checked: getConfig().fetchHistoryOnStart,
                visible: getConfig().adapter === 'oicq', // Bridge is enabled by default
                click: (menuItem) => {
                    getConfig().fetchHistoryOnStart = menuItem.checked
                    saveConfigFile()
                },
            }),
            new MenuItem({
                label: '?????????????????????',
                type: 'checkbox',
                checked: getConfig().updateCheck === true,
                click: (menuItem) => {
                    getConfig().updateCheck = menuItem.checked
                    saveConfigFile()
                },
            }),
            new MenuItem({
                label: '????????????',
                type: 'checkbox',
                checked: getConfig().custom === true,
                visible: getConfig().adapter === 'oicq', // TODO: ?????? Bridge ?????????
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
                label: '??????????????????????????????????????????????????????',
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
                label: '??????',
                submenu: (() => {
                    let rsp: Electron.MenuItemConstructorOptions[] = [
                        {
                            label: '????????????',
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
                label: '????????????',
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
        //??????
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
        globalMenu.priority,
        {
            label: '??????',
            submenu: Menu.buildFromTemplate(globalMenu.options),
        },
        {
            label: 'Edit',
            submenu: [
                { label: 'Undo', accelerator: 'CmdOrCtrl+Z', selector: 'undo:' },
                { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', selector: 'redo:' },
                { label: 'Cut', accelerator: 'CmdOrCtrl+X', selector: 'cut:' },
                { label: 'Copy', accelerator: 'CmdOrCtrl+C', selector: 'copy:' },
                { label: 'Paste', accelerator: 'CmdOrCtrl+V', selector: 'paste:' },
                { label: 'Select All', accelerator: 'CmdOrCtrl+A', selector: 'selectAll:' },
            ]
        },
    ]
    if (process.platform !== 'darwin') template.pop()
    const menu = Menu.buildFromTemplate(template)
    if (globalMenu.shortcuts.length) {
        menu.append(
            new MenuItem({
                label: '??????',
                submenu: Menu.buildFromTemplate(globalMenu.shortcuts),
            }),
        )
    }
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
    if ((message.deleted || message.hide) && !message.reveal)
        menu.append(
            new MenuItem({
                label: '??????',
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
                    label: '???????????????',
                    type: 'normal',
                    click: () => {
                        clipboard.writeText(message.time.toString())
                    },
                }),
            )
            menu.append(
                new MenuItem({
                    label: '?????????????????? JSON',
                    type: 'normal',
                    click: () => {
                        clipboard.writeText(JSON.stringify(message))
                    },
                }),
            )
            menu.append(
                new MenuItem({
                    label: '??????????????????????????????????????????????????????',
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
                    label: '????????????????????????',
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
                    label: '????????????',
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
                    label: '????????????',
                    type: 'normal',
                    click: () => {
                        clipboard.writeText(message.content)
                    },
                }),
            )
        if (message.replyMessage && message.replyMessage.content) {
            menu.append(
                new MenuItem({
                    label: '??????????????????',
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
                    label: '????????????',
                    type: 'normal',
                    click() {
                        clipboard.writeText(message.code)
                    },
                }),
            )
        }
        if (message.replyMessage && message.replyMessage.file) {
            if (message.replyMessage.file.type.startsWith('image/'))
                menu.append(
                    new MenuItem({
                        label: '??????????????????',
                        type: 'normal',
                        click: async () => copyImage(message.replyMessage.file.url),
                    }),
                )
            menu.append(
                new MenuItem({
                    label: '?????????????????? URL',
                    type: 'normal',
                    click: () => {
                        clipboard.writeText(message.replyMessage.file.url)
                    },
                }),
            )
            menu.append(
                new MenuItem({
                    label: '??????????????????',
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
                    //?????????????????????????????????????????????????????????
                    menu.append(
                        new MenuItem({
                            type: 'separator',
                        }),
                    )
                menu.append(
                    new MenuItem({
                        enabled: false,
                        label: `??????#${i}`,
                    }),
                )
                if (file.type.startsWith('image/')) {
                    menu.append(
                        new MenuItem({
                            label: '????????????',
                            type: 'normal',
                            click: async () => copyImage(file.url),
                        }),
                    )
                    menu.append(
                        new MenuItem({
                            label: '?????????????????????',
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
                            label: '?????????????????????',
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
                        label: '?????? URL',
                        type: 'normal',
                        click: () => {
                            clipboard.writeText(file.url)
                        },
                    }),
                )
                if (file.type.startsWith('image/'))
                    menu.append(
                        new MenuItem({
                            label: '???????????????????????????',
                            click: () => openImage(file.url, true),
                        }),
                    )
                if (file.type.startsWith('video/') || file.type.startsWith('audio/'))
                    menu.append(
                        new MenuItem({
                            label: '???????????????????????????',
                            click: () => openMedia(file.url),
                        }),
                    )
                if (file.type.startsWith('video/'))
                    menu.append(
                        new MenuItem({
                            label: '??????????????????',
                            click: async () => {
                                const newUrl = await getMsgNewURL(String(message._id))
                                if (newUrl !== 'error') {
                                    renewMessageURL(room.roomId, message._id, newUrl)
                                } else {
                                    ui.messageError('????????????????????????')
                                }
                            },
                        }),
                    )
                if (file.type.startsWith('image/'))
                    menu.append(
                        new MenuItem({
                            label: '??????',
                            click: () => downloadImage(file.url),
                        }),
                    )
                else
                    menu.append(
                        new MenuItem({
                            label: '??????',
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
                        label: '????????????',
                        type: 'normal',
                        click: async () => copyImage(message.file.url),
                    }),
                )
                menu.append(
                    new MenuItem({
                        label: '???????????????',
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
                    label: '?????? URL',
                    type: 'normal',
                    click: () => {
                        clipboard.writeText(message.file.url)
                    },
                }),
            )
            if (message.file.type.startsWith('image/'))
                menu.append(
                    new MenuItem({
                        label: '???????????????????????????',
                        click: () => openImage(message.file.url, true),
                    }),
                )
            if (message.file.type.startsWith('video/') || message.file.type.startsWith('audio/'))
                menu.append(
                    new MenuItem({
                        label: '???????????????????????????',
                        click: () => openMedia(message.file.url),
                    }),
                )
            menu.append(
                new MenuItem({
                    label: '??????',
                    click: () => downloadFileByMessageData({ action: 'download', message, room }),
                }),
            )
        }
        menu.append(
            new MenuItem({
                label: history
                    ? message._id !== -1
                        ? `?????????????????? ID ${message._id}`
                        : '????????????????????????????????????????????????'
                    : '???????????? ID',
                type: 'normal',
                enabled: !(history && message._id === -1),
                click: () => {
                    clipboard.writeText(String(message._id))
                },
            }),
        )
        if ((message.senderId === getUin() || (await isAdmin())) && !history)
            menu.append(
                new MenuItem({
                    label: '??????',
                    click: () => {
                        if (message.senderId === getUin()) {
                            deleteMessage(room.roomId, message._id as string)
                        } else {
                            ui.confirmDeleteMessage(room.roomId, message._id as string)
                        }
                    },
                }),
            )
        if (message.senderId === getUin() && !history)
            menu.append(
                new MenuItem({
                    label: '??????????????????',
                    click: () => {
                        setTimeout(() => deleteMessage(room.roomId, message._id as string), 1000 * 60)
                    },
                }),
            )
        if (!history) {
            menu.append(
                new MenuItem({
                    label: '??????',
                    type: 'normal',
                    click: () => {
                        ui.startForward(message._id as string)
                    },
                }),
            )
        }
        if (!history){
            menu.append(
                new MenuItem({
                    label: '??????',
                    click: () => {
                        hideMessage(room.roomId, message._id as string)
                    },
                }),
            )
        }
        if (!history && !message.flash) {
            menu.append(
                new MenuItem({
                    label: '??????',
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
                    label: '??????????????????',
                    click: () => fetchHistory(message._id as string),
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
                    content: '[????????????]',
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
            label: '?????????????????????',
            type: 'normal',
            click() {
                download(itemName, String(new Date().getTime()), path.join(app.getPath('userData'), 'stickers'))
            },
        })
    } else {
        menu.push({
            label: '?????????????????????',
            type: 'normal',
            click() {
                ui.pasteGif(itemName)
            },
        })
        menu.push({
            label: '???????????????',
            type: 'normal',
            click() {
                ui.moveSticker(itemName)
            },
        })
        menu.push({
            label: '??????',
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
        label: `???????????? ${dirName}`,
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
            label: `?????? "${message.username}"`,
            click: () => {
                clipboard.writeText(message.username)
            },
        },
        {
            label: `?????? "${message.senderId}"`,
            click: () => {
                clipboard.writeText(message.senderId.toString())
            },
        },
    ])
    if (message.replyMessage) {
        menu.append(
            new MenuItem({
                label: `?????? "${message.replyMessage.username}"`,
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
            label: `????????????`,
            click: () => {
                if (message.mirai && message.mirai.eqq.avatarMd5) {
                    openImage(getImageUrlByMd5(message.mirai.eqq.avatarMd5))
                } else if (message.mirai && message.mirai.eqq.avatarUrl) {
                    const QCLOUD_AVATAR_REGEX =
                        /^https:\/\/[a-z0-9\-]+\.cos\.[a-z\-]+\.myqcloud\.com\/[0-9]+-[0-9]+\.jpg$/
                    if (QCLOUD_AVATAR_REGEX.test(message.mirai.eqq.avatarUrl)) openImage(message.mirai.eqq.avatarUrl)
                } else {
                    openImage(getAvatarUrl(message.senderId))
                }
            },
        }),
    )
    menu.append(
        new MenuItem({
            label: `????????????`,
            click: () => downloadImage(`https://q1.qlogo.cn/g?b=qq&nk=${message.senderId}&s=640`),
        }),
    )
    menu.append(
        new MenuItem({
            label: `????????????`,
            click: () => ui.startChat(message.senderId, message.username),
        }),
    )
    if (
        message.senderId !== getUin() &&
        ((await isAdmin()) === 'owner' ||
            ((await isAdmin()) === 'admin' && message.role !== 'owner' && message.role !== 'admin'))
    ) {
        menu.append(
            new MenuItem({
                label: `??????`,
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
                label: `????????????`,
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
                label: `?????? "${remark}"`,
                click: () => {
                    clipboard.writeText(remark)
                },
            }),
        )
    }
    if (name && name !== remark) {
        menu.append(
            new MenuItem({
                label: `?????? "${name}"`,
                click: () => {
                    clipboard.writeText(name)
                },
            }),
        )
    }
    if (displayId) {
        menu.append(
            new MenuItem({
                label: `?????? "${displayId}"`,
                click: () => {
                    clipboard.writeText(displayId.toString())
                },
            }),
        )
    }
    if (group) {
        menu.append(
            new MenuItem({
                label: group.owner_id === getUin() ? '????????????' : '????????????',
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
        // base64 ??????
        clipboard.writeImage(nativeImage.createFromDataURL(url))
        return
    }
    // ??????url?????????????????????????????????
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
                    label: `?????? "${remark}"`,
                    click: () => {
                        clipboard.writeText(remark)
                    },
                }),
            )
        }
        if (name && name !== remark) {
            menu.append(
                new MenuItem({
                    label: `?????? "${name}"`,
                    click: () => {
                        clipboard.writeText(name)
                    },
                }),
            )
        }
        if (displayId) {
            menu.append(
                new MenuItem({
                    label: `?????? "${displayId}"`,
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
                    label: '??????',
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
                    label: '????????????',
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
