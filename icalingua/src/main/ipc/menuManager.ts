import Message from '@icalingua/types/Message'
import OnlineStatusType from '@icalingua/types/OnlineStatusType'
import Room from '@icalingua/types/Room'
import GroupMenuContext from '@icalingua/types/GroupMenuContext'
import axios from 'axios'
import { app, clipboard, dialog, ipcMain, Menu, MenuItem, nativeImage, screen, shell, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import querystring from 'querystring'
import getAvatarUrl from '../../utils/getAvatarUrl'
import getImageUrlByMd5 from '../../utils/getImageUrlByMd5'
import getStaticPath from '../../utils/getStaticPath'
import getWinUrl from '../../utils/getWinUrl'
import createPlusOneMessage from '../../utils/createPlusOneMessage'
import { newIcalinguaWindow } from '../../utils/IcalinguaWindow'
import atCache from '../utils/atCache'
import { getConfig, saveConfigFile } from '../utils/configManager'
import exit from '../utils/exit'
import exportContacts from '../utils/exportContacts'
import exportGroupMembers from '../utils/exportGroupMembers'
import isAdmin from '../utils/isAdmin'
import openMedia from '../utils/openMedia'
import setPriority from '../utils/setPriority'
import * as themes from '../utils/themes'
import ui from '../utils/ui'
import version from '../utils/version'
import {
    getMainWindow,
    getRoomIdByWindow,
    lockMainWindow,
    showAria2SettingsWindow,
    showDeviceManagerWindow,
    showIgnoreManageWindow,
    showRequestWindow,
    showSetLockPasswordWindow,
    showSettingsWindow,
    sendToWindow,
    tryToShowMainWindow,
} from '../utils/windowManager'
import {
    deleteMessage,
    fetchHistory,
    fetchLatestHistory,
    fetch7DaysHistory,
    getFriend,
    getGroup,
    getCookies,
    getGroupMemberInfo,
    getMsgNewURL,
    getRoom,
    getSelectedRoom,
    getUin,
    hideMessage,
    ignoreChat,
    makeForward,
    markRoomUnread,
    markMessageUnread,
    pinRoom,
    removeChat,
    renewMessage,
    renewMessageURL,
    revealMessage,
    sendMessage,
    setOnlineStatus as setStatus,
    setRoomAutoDownload,
    setRoomAutoDownloadPath,
    setRoomPriority,
    sendPacket,
    sendGroupSign,
    getDisabledFeatures,
    sendGroupPoke,
} from './botAndStorage'
import { download, downloadFileByMessageData, downloadImage, getImageExt } from './downloadManager'
import openImage from './openImage'
import { updateTrayIcon, updateTrayMenu } from '../utils/trayManager'
import removeGroupNameEmotes from '../../utils/removeGroupNameEmotes'
import sleep from '../../utils/sleep'
import { spacingSendMessage } from '../../utils/panguSpacing'
import { pb } from 'oicq-icalingua-plus-plus'
import { openGroupAlbum, openGroupAnnouncements, openGroupEssence, openGroupFiles } from '../utils/groupWebApps'

const getStickersDir = () => path.join(app.getPath('userData'), 'stickers')
let cachedStickerSubdirs: string[] | null = null
let stickerDirWatcher: fs.FSWatcher | null = null

const ensureStickerSubdirsCached = () => {
    if (cachedStickerSubdirs !== null) return
    const stickersDir = getStickersDir()
    try {
        cachedStickerSubdirs = fs
            .readdirSync(stickersDir)
            .filter((i) => {
                try {
                    return fs.statSync(path.join(stickersDir, i)).isDirectory()
                } catch {
                    return false
                }
            })
            .sort()
    } catch {
        cachedStickerSubdirs = []
    }
    if (!stickerDirWatcher) {
        try {
            stickerDirWatcher = fs.watch(stickersDir, () => {
                cachedStickerSubdirs = null
            })
            stickerDirWatcher.on('error', () => {
                cachedStickerSubdirs = null
                stickerDirWatcher = null
            })
        } catch {}
    }
}

const getStickerGroupSubMenu = (downloadFn: (dir: string) => void): Electron.MenuItemConstructorOptions[] => {
    const stickersDir = getStickersDir()
    ensureStickerSubdirsCached()
    const subdirs = cachedStickerSubdirs || []
    const items: Electron.MenuItemConstructorOptions[] = [
        {
            label: '默认',
            click: () => downloadFn(stickersDir),
        },
    ]
    for (const dir of subdirs) {
        items.push({
            label: dir,
            click: () => downloadFn(path.join(stickersDir, dir)),
        })
    }
    return items
}

export const setOnlineStatus = (status: OnlineStatusType) => {
    setStatus(status)
    getConfig().account.onlineStatus = status
    updateAppMenu()
    updateTrayMenu()
    saveConfigFile()
}

export const showMakeForwardDebugWindow = async () => {
    if (version.isProduction || !getConfig().debugmode) return
    const win = newIcalinguaWindow(
        {
            height: 520,
            width: 600,
            autoHideMenuBar: true,
            webPreferences: {
                contextIsolation: false,
                nodeIntegration: true,
            },
        },
        { stableTitle: 'Icalingua++ MakeForward Debug' },
    )
    await win.loadURL(getWinUrl() + '#/makeForward')
}

const openMemberHistoryWindow = (senderId: number, roomId: number, senderName: string) => {
    const size = screen.getPrimaryDisplay().size
    let width = size.width - 300
    if (width > 1440) width = 900
    const win = newIcalinguaWindow({
        height: size.height - 200,
        width,
        backgroundColor: themes.getThemeBackgroundColor(),
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            webSecurity: false,
            contextIsolation: false,
        },
    })
    win.loadURL(getWinUrl() + '#/memberHistory')
    win.webContents.on('did-finish-load', function () {
        win.webContents.send('theme:sync-theme-data', themes.getThemeData())
        win.webContents.setZoomFactor(getConfig().zoomFactor / 100)
        win.webContents.setWindowOpenHandler((details) => {
            shell.openExternal(details.url)
            return { action: 'deny' }
        })
        win.webContents.send('initMemberHistory', { senderId, roomId, senderName })
    })
}

const openMessageSearchWindow = (roomId: number, roomName: string, senderId?: number, senderName?: string) => {
    const size = screen.getPrimaryDisplay().size
    let width = size.width - 300
    if (width > 1440) width = 900
    const win = newIcalinguaWindow({
        height: size.height - 200,
        width,
        backgroundColor: themes.getThemeBackgroundColor(),
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            webSecurity: false,
            contextIsolation: false,
        },
    })
    win.loadURL(getWinUrl() + '#/messageSearch')
    win.webContents.on('did-finish-load', function () {
        win.webContents.send('theme:sync-theme-data', themes.getThemeData())
        win.webContents.setZoomFactor(getConfig().zoomFactor / 100)
        win.webContents.setWindowOpenHandler((details) => {
            shell.openExternal(details.url)
            return { action: 'deny' }
        })
        win.webContents.send('initMessageSearch', { roomId, roomName, senderId, senderName })
    })
}

const openSenderMessageSearchWindow = async (senderId: number, senderName: string, roomId: number) => {
    let roomName = '全部会话'
    if (roomId !== 0) {
        try {
            const room = await getRoom(roomId)
            roomName = room
                ? roomId < 0 && getConfig().removeGroupNameEmotes
                    ? removeGroupNameEmotes(room.roomName)
                    : room.roomName
                : `${roomId < 0 ? '群聊' : '私聊'} ${Math.abs(roomId)}`
        } catch (e) {
            roomName = `${roomId < 0 ? '群聊' : '私聊'} ${Math.abs(roomId)}`
        }
    }
    openMessageSearchWindow(roomId, roomName, senderId, senderName)
}

const createSenderMessageSearchMenu = (senderId: number, senderName: string, roomId?: number) =>
    new MenuItem({
        label: '搜索 TA 的消息',
        submenu: Menu.buildFromTemplate([
            ...(roomId
                ? [
                      {
                          label: '当前会话',
                          click: () => openSenderMessageSearchWindow(senderId, senderName, roomId),
                      },
                  ]
                : []),
            {
                label: '全部会话',
                click: () => openSenderMessageSearchWindow(senderId, senderName, 0),
            },
        ]),
    })

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

const buildRoomMenu = async (room: Room, parentWindow: BrowserWindow = getMainWindow()): Promise<Menu> => {
    const pinTitle = room.index ? '解除置顶' : '置顶'
    const updateRoomPriority = (lev: 1 | 2 | 3 | 4 | 5) => setRoomPriority(room.roomId, lev)
    const avatarType = room.roomId < 0 ? '群头像' : '头像'
    const menu = Menu.buildFromTemplate([
        {
            label: `${room.roomName} (${Math.abs(room.roomId)})`,
            enabled: false,
            visible: (await getSelectedRoom())?.roomId !== room.roomId,
        },
        {
            label: '在新窗口中打开',
            click: async () => {
                const { openChatWindow } = await import('../utils/windowManager')
                const roomName =
                    room.roomId < 0 && getConfig().removeGroupNameEmotes
                        ? removeGroupNameEmotes(room.roomName)
                        : room.roomName
                await openChatWindow(room.roomId, roomName)
                // 如果主窗口当前选中的是这个会话，取消选中
                if (ui.getSelectedRoomId() === room.roomId) {
                    ui.chroom(0)
                }
            },
        },
        { type: 'separator' },
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
            label: '标记为未读',
            click: () => markRoomUnread(room.roomId),
        },
        {
            label: '删除会话',
            click: () => removeChat(room.roomId),
        },
        {
            label: '屏蔽消息',
            click: () =>
                sendToWindow(parentWindow, 'confirmIgnoreChat', {
                    id: room.roomId,
                    name:
                        room.roomId < 0 && getConfig().removeGroupNameEmotes
                            ? removeGroupNameEmotes(room.roomName)
                            : room.roomName,
                }),
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
            label: `查看${avatarType}`,
            click: () => {
                openImage(getAvatarUrl(room.roomId, false, true), false)
            },
        },
        {
            label: '浏览聊天图片',
            click: async () => {
                const size = screen.getPrimaryDisplay().size
                const win = newIcalinguaWindow({
                    height: size.height - 200,
                    width: 800,
                    backgroundColor: themes.getThemeBackgroundColor(),
                    autoHideMenuBar: true,
                    webPreferences: {
                        nodeIntegration: true,
                        webSecurity: false,
                        contextIsolation: false,
                    },
                })
                const roomName =
                    room.roomId < 0 && getConfig().removeGroupNameEmotes
                        ? removeGroupNameEmotes(room.roomName)
                        : room.roomName
                await win.loadURL(getWinUrl() + '#/imageGallery/' + room.roomId + '/' + encodeURIComponent(roomName))
                win.webContents.on('did-finish-load', function () {
                    win.webContents.send('theme:sync-theme-data', themes.getThemeData())
                    win.webContents.setZoomFactor(getConfig().zoomFactor / 100)
                })
            },
        },
        {
            label: '搜索聊天记录',
            click: () => {
                const roomName =
                    room.roomId < 0 && getConfig().removeGroupNameEmotes
                        ? removeGroupNameEmotes(room.roomName)
                        : room.roomName
                openMessageSearchWindow(room.roomId, roomName)
            },
        },
        ...(room.roomId > 0 ? [createSenderMessageSearchMenu(room.roomId, room.roomName, room.roomId)] : []),
        {
            label: `复制${avatarType} URL`,
            click: () => {
                clipboard.writeText(getAvatarUrl(room.roomId, false, true))
            },
        },
        {
            label: `下载${avatarType}`,
            click: () => {
                const roomName =
                    room.roomId < 0 && getConfig().removeGroupNameEmotes
                        ? removeGroupNameEmotes(room.roomName)
                        : room.roomName
                const cleanRoomName = roomName
                    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9._()\- ]/g, '_') // 只允许：中文、英文、数字、._-()空格
                    .replace(/\.+/g, '.') // 连续多个点压缩，防止 ...
                    .replace(/^[.\s]+/, '') // 去掉开头的点和空格（隐藏文件）
                    .slice(0, 50)
                const basename = `${cleanRoomName}(${Math.abs(room.roomId)})的${avatarType}_${new Date().getTime()}`
                downloadImage(getAvatarUrl(room.roomId, false, true), false, basename)
            },
        },
        {
            label: '自动下载',
            enabled: getConfig().adapter === 'oicq',
            sublabel: getConfig().adapter === 'oicq' ? undefined : 'bridge 暂不支持',
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
                        const selection = dialog.showOpenDialogSync(parentWindow, {
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
        {
            label: '设置备注名',
            async click() {
                const windowOptions = {
                    height: 180,
                    width: 600,
                    autoHideMenuBar: true,
                    webPreferences: {
                        contextIsolation: false,
                        nodeIntegration: true,
                    },
                }
                if (room.roomId < 0) {
                    const groupInfo = await getGroup(-room.roomId)
                    if (!groupInfo) {
                        sendToWindow(parentWindow, 'messageError', '您不是本群成员，无法为本群添加备注')
                        return
                    }
                    const groupName = getConfig().removeGroupNameEmotes
                        ? removeGroupNameEmotes(groupInfo.group_name)
                        : groupInfo.group_name
                    await newIcalinguaWindow({
                        ...windowOptions,
                        modal: true,
                        parent: parentWindow,
                    }).loadURL(
                        getWinUrl() +
                            '#/remarkNameEdit/' +
                            0 +
                            '/' +
                            groupInfo.group_id +
                            '/' +
                            querystring.escape(groupName) +
                            '/' +
                            querystring.escape(groupInfo.group_remark || groupName),
                    )
                } else {
                    const friendInfo = await getFriend(room.roomId)
                    if (!friendInfo) {
                        sendToWindow(parentWindow, 'messageError', '该联系人还不是您的好友，无法为该联系人添加备注')
                        return
                    }
                    await newIcalinguaWindow({
                        ...windowOptions,
                        modal: true,
                        parent: parentWindow,
                    }).loadURL(
                        getWinUrl() +
                            '#/remarkNameEdit/' +
                            friendInfo.user_id +
                            '/' +
                            0 +
                            '/' +
                            querystring.escape(friendInfo.nickname) +
                            '/' +
                            querystring.escape(friendInfo.remark || friendInfo.nickname),
                    )
                }
            },
        },
    ])
    const webApps = new Menu()
    if (room.roomId < 0) {
        webApps.append(
            new MenuItem({
                label: '查看精华消息',
                click: () => openGroupEssence(room),
            }),
        )
        webApps.append(
            new MenuItem({
                label: '群公告',
                click: () => openGroupAnnouncements(room),
            }),
        )
        webApps.append(
            new MenuItem({
                label: '群文件',
                click: () => openGroupFiles(room),
            }),
        )
        webApps.append(
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
                            domain: '.qun.qq.com',
                            name: i,
                            value: cookies[i],
                        })
                    }
                    await win.loadURL('https://qun.qq.com/interactive/qunhonor?gc=' + -room.roomId)
                },
            }),
        )
        webApps.append(
            new MenuItem({
                label: '群相册',
                click: () => openGroupAlbum(room),
            }),
        )
        webApps.append(
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
                            domain: '.qun.qq.com',
                            name: i,
                            value: cookies[i],
                        })
                    }

                    await win.loadURL('https://qun.qq.com/homework/p/features/#?gid=' + -room.roomId, {
                        userAgent: 'QQ/8.9.63.11390',
                    })
                },
            }),
        )
        webApps.append(
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
                            domain: '.qun.qq.com',
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
                        modal: true,
                        parent: parentWindow,
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
                            querystring.escape(
                                getConfig().removeGroupNameEmotes
                                    ? removeGroupNameEmotes(room.roomName)
                                    : room.roomName,
                            ) +
                            '/' +
                            querystring.escape(memberInfo.card || memberInfo.nickname),
                    )
                },
            }),
        )
        webApps.append(
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
                            domain: '.qun.qq.com',
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
                label: '群打卡',
                async click() {
                    sendGroupSign(-room.roomId)
                },
            }),
        )
        menu.append(
            new MenuItem({
                label: '群成员',
                async click() {
                    sendToWindow(parentWindow, 'openGroupMemberPanel', { shown: true, gin: -room.roomId })
                },
            }),
        )
        menu.append(
            new MenuItem({
                label: '全员禁言',
                async click() {
                    if ((await isAdmin(room.roomId)) === false) {
                        sendToWindow(parentWindow, 'messageError', '您不是本群管理员，无法操作')
                        return
                    }
                    const win = newIcalinguaWindow({
                        height: 210,
                        width: 600,
                        autoHideMenuBar: true,
                        maximizable: false,
                        modal: true,
                        parent: parentWindow,
                        webPreferences: {
                            contextIsolation: false,
                            nodeIntegration: true,
                        },
                    })
                    const groupName = getConfig().removeGroupNameEmotes
                        ? removeGroupNameEmotes(room.roomName)
                        : room.roomName
                    await win.loadURL(
                        getWinUrl() +
                            '#/muteUser/' +
                            -room.roomId +
                            '/0/' +
                            querystring.escape(groupName) +
                            '/' +
                            querystring.escape('全体成员') +
                            '/null',
                    )
                },
            }),
        )
        menu.append(
            new MenuItem({
                label: '群成员管理',
                submenu: [
                    {
                        label: '新版',
                        async click() {
                            const win = newIcalinguaWindow({
                                autoHideMenuBar: true,
                                webPreferences: {
                                    contextIsolation: false,
                                    preload: path.join(getStaticPath(), 'groupMemberPreload.js'),
                                },
                            })
                            win.maximize()
                            const cookies = await getCookies('qun.qq.com')
                            for (const i in cookies) {
                                await win.webContents.session.cookies.set({
                                    url: 'https://qun.qq.com',
                                    domain: '.qun.qq.com',
                                    name: i,
                                    value: cookies[i],
                                })
                            }
                            win.webContents.on('dom-ready', () =>
                                win.webContents.insertCSS(
                                    '.t-select__wrap{pointer-events: none;} ' +
                                        '.t-default-menu{display: none !important;}',
                                ),
                            )
                            await win.loadURL(
                                'https://qun.qq.com/manage.html#/member-manage/base-manage' + '?gc=' + -room.roomId,
                            )
                        },
                    },
                    {
                        label: '旧版',
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
                                    domain: '.qun.qq.com',
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
                    },
                ],
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
        // 添加"查看共同群聊"选项（仅对好友显示）
        menu.append(
            new MenuItem({
                label: '查看共同群聊',
                click: () => {
                    showCommonGroupsInMainWindow(room.roomId, room.roomName)
                },
            }),
        )
        webApps.append(
            new MenuItem({
                label: 'TA 的空间',
                async click() {
                    const win = newIcalinguaWindow({
                        autoHideMenuBar: true,
                        webPreferences: {
                            contextIsolation: false,
                        },
                    })
                    win.maximize()
                    const cookies = await getCookies('qzone.qq.com')
                    for (const i in cookies) {
                        await win.webContents.session.cookies.set({
                            url: 'https://user.qzone.qq.com',
                            domain: '.qzone.qq.com',
                            name: i,
                            value: cookies[i],
                        })
                    }
                    await win.loadURL('https://user.qzone.qq.com/' + room.roomId)
                },
            }),
        )
        /*
        webApps.append(
            new MenuItem({
                label: 'TA 的信息',
                async click() {
                    const size = screen.getPrimaryDisplay().size
                    const win = newIcalinguaWindow({
                        height: size.height - 200,
                        width: 500,
                        autoHideMenuBar: true,
                    })
                    const cookies = await getCookies('vip.qq.com')
                    for (const i in cookies) {
                        await win.webContents.session.cookies.set({
                            url: 'https://club.vip.qq.com',
                            name: i,
                            value: cookies[i],
                            domain: '.vip.qq.com',
                        })
                    }
                    await win.loadURL('https://club.vip.qq.com/card/friend?qq=' + room.roomId, {
                        userAgent: 'QQ/8.9.63.11390',
                    })
                },
            }),
        )
        webApps.append(
            new MenuItem({
                label: '匿名提问',
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
                    await win.loadURL('https://ti.qq.com/v2/anonymous/answer?uin=' + room.roomId, {
                        userAgent: 'QQ/8.9.63.11390',
                    })
                },
            }),
        )
        */
        webApps.append(
            new MenuItem({
                label: '建立关系',
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
                    await win.loadURL('https://ti.qq.com/hybrid-h5/intimate/launch_v3?uin=' + room.roomId, {
                        userAgent: 'QQ/8.9.63.11390',
                    })
                },
            }),
        )
        webApps.append(
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
                    await win.loadURL('https://ti.qq.com/interactive_new/index/?target_uin=' + room.roomId, {
                        userAgent: 'QQ/8.9.63.11390',
                    })
                },
            }),
        )
        webApps.append(
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
        webApps.append(
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
    ;(await getDisabledFeatures()).includes('WebApps') ||
        menu.append(
            new MenuItem({
                label: '网页应用',
                submenu: webApps,
            }),
        )
    menu.append(
        new MenuItem({
            label: '获取历史消息',
            click: () => fetchLatestHistory(room.roomId),
        }),
    )
    return menu
}

const buildSettingsMenu = async () => [
    new MenuItem({
        label: '在线状态',
        visible: !(await getDisabledFeatures()).includes('OnlineStatus'),
        submenu: [
            {
                type: 'radio' as const,
                label: '在线',
                checked: getConfig().account.onlineStatus === OnlineStatusType.Online,
                click: () => setOnlineStatus(OnlineStatusType.Online),
            },
            {
                type: 'radio' as const,
                label: '离开',
                checked: getConfig().account.onlineStatus === OnlineStatusType.Afk,
                click: () => setOnlineStatus(OnlineStatusType.Afk),
            },
            {
                type: 'radio' as const,
                label: '隐身',
                checked: getConfig().account.onlineStatus === OnlineStatusType.Hide,
                click: () => setOnlineStatus(OnlineStatusType.Hide),
            },
            {
                type: 'radio' as const,
                label: '忙碌',
                checked: getConfig().account.onlineStatus === OnlineStatusType.Busy,
                click: () => setOnlineStatus(OnlineStatusType.Busy),
            },
            {
                type: 'radio' as const,
                label: 'Q我吧',
                checked: getConfig().account.onlineStatus === OnlineStatusType.Qme,
                click: () => setOnlineStatus(OnlineStatusType.Qme),
            },
            {
                type: 'radio' as const,
                label: '请勿打扰',
                checked: getConfig().account.onlineStatus === OnlineStatusType.DontDisturb,
                click: () => setOnlineStatus(OnlineStatusType.DontDisturb),
            },
        ],
    }),
    new MenuItem({ type: 'separator' }),
    new MenuItem({
        label: '设置中心',
        accelerator: 'CommandOrControl+,',
        click: showSettingsWindow,
    }),
]

export const updateAppMenu = async () => {
    let globalMenu = {
        // 应用菜单
        app: [
            new MenuItem({
                label: version.version,
                enabled: false,
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
                label: '登录设备管理',
                click: () => showDeviceManagerWindow(),
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
                label: '搜索全部聊天记录',
                accelerator: 'CommandOrControl+Shift+F',
                click: () => openMessageSearchWindow(0, '全部会话'),
            }),
            new MenuItem({
                label: '获取最近会话的历史消息',
                sublabel: '一周内有消息的会话',
                click: () => fetch7DaysHistory(),
            }),
            new MenuItem({
                label: '重新加载',
                submenu: [
                    {
                        label: '重新加载',
                        click: () => {
                            ui.chroom(0)
                            getMainWindow().reload()
                        },
                    },
                    {
                        label: '清除网页缓存并重载',
                        click: () => {
                            ui.chroom(0)
                            getMainWindow().webContents.session.clearCache()
                            getMainWindow().reload()
                        },
                    },
                    {
                        label: '清除表情缓存并重载',
                        click: () => {
                            fs.rmdirSync(path.join(app.getPath('userData'), 'stickers_preview'), { recursive: true })
                            ui.chroom(0)
                            getMainWindow().reload()
                        },
                    },
                ],
            }),
            new MenuItem({
                label: 'QQ 群管理',
                submenu: [
                    {
                        label: '新版',
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
                                    domain: '.qun.qq.com',
                                    name: i,
                                    value: cookies[i],
                                })
                            }
                            await win.loadURL('https://qun.qq.com/manage.html#/member-manage/base-manage')
                        },
                    },
                    {
                        label: '旧版',
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
                                    domain: '.qun.qq.com',
                                    name: i,
                                    value: cookies[i],
                                })
                            }
                            await win.loadURL('https://qun.qq.com/member.html')
                        },
                    },
                ],
            }),
            new MenuItem({
                label: 'QQ 空间',
                async click() {
                    const win = newIcalinguaWindow({
                        autoHideMenuBar: true,
                        webPreferences: {
                            contextIsolation: false,
                        },
                    })
                    win.maximize()
                    const cookies = await getCookies('qzone.qq.com')
                    for (const i in cookies) {
                        await win.webContents.session.cookies.set({
                            url: 'https://user.qzone.qq.com',
                            domain: '.qzone.qq.com',
                            name: i,
                            value: cookies[i],
                        })
                    }
                    await win.loadURL('https://user.qzone.qq.com/' + getUin())
                },
            }),
            new MenuItem({
                label: '开发者工具',
                role: 'toggleDevTools',
            }),
            new MenuItem({
                label: '全屏',
                role: 'togglefullscreen',
            }),
            new MenuItem({
                label: '锁定',
                click: lockMainWindow,
                accelerator: 'CommandOrControl+L',
            }),
            new MenuItem({
                label: '最小化',
                role: 'minimize',
            }),
            new MenuItem({
                label: '关闭窗口',
                role: 'close',
            }),
            // https://stackoverflow.com/questions/57081237/electron-js-multiple-accelerators
            new MenuItem({
                label: '关闭窗口 (hidden)',
                role: 'close',
                visible: false,
                accelerator: 'CommandOrControl+H',
            }),
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
            new MenuItem({
                label: '退出',
                click: exit,
                accelerator: getConfig().disableQuitShortcut ? undefined : 'CommandOrControl+Q',
            }),
        ],
        priority: new MenuItem({
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
        // 设置
        options: await buildSettingsMenu(),
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
        const roomName =
            selectedRoom.roomId < 0 && getConfig().removeGroupNameEmotes
                ? removeGroupNameEmotes(selectedRoom.roomName)
                : selectedRoom.roomName
        menu.append(
            new MenuItem({
                label: `${roomName}(${Math.abs(selectedRoom.roomId)})`,
                submenu: await buildRoomMenu(selectedRoom),
            }),
        )
    }
    Menu.setApplicationMenu(menu)
}

/** 获取 IPC 事件发送者所在的窗口，用于正确定位右键菜单（而非总是使用主窗口） */
const getSenderWindow = (event: Electron.IpcMainEvent): BrowserWindow => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender)
    if (senderWindow && !senderWindow.isDestroyed()) return senderWindow
    return getMainWindow()
}

const showCommonGroupsInMainWindow = (userId?: number, userName?: string) => {
    tryToShowMainWindow(() => {
        sendToWindow(getMainWindow(), 'showCommonGroups', userId, userName)
    })
}

ipcMain.on('popupRoomMenu', async (event, roomId: number, e) => {
    const win = getSenderWindow(event)
    const bounds = win.getContentBounds()
    const pos = { x: e.x - bounds.x, y: e.y - bounds.y }
    const room = await getRoom(roomId)
    if (!room) return
    ;(await buildRoomMenu(room, win)).popup({
        window: win,
        ...pos,
    })
})
ipcMain.on('openGlobalMessageSearch', () => openMessageSearchWindow(0, '全部会话'))
ipcMain.on('openGroupAnnouncements', async (_, roomId: number) => openGroupAnnouncements(await getRoom(roomId)))
ipcMain.on('openGroupFiles', async (_, roomId: number) => openGroupFiles(await getRoom(roomId)))
ipcMain.on('openGroupAlbum', async (_, roomId: number) => openGroupAlbum(await getRoom(roomId)))
ipcMain.on('openGroupEssence', async (_, roomId: number) => openGroupEssence(await getRoom(roomId)))
ipcMain.on('popupMessageMenu', async (event, e, room: Room, message: Message, sect?: string, history?: boolean) => {
    const win = getSenderWindow(event)
    const bounds = win.getContentBounds()
    const pos = { x: e.x - bounds.x, y: e.y - bounds.y }
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
                    label: 'DEBUG MENU',
                    submenu: [
                        {
                            label: '复制 seqid',
                            type: 'normal',
                            visible: !history,
                            click: () => {
                                let seqid: string
                                const parsed = Buffer.from(String(message._id), 'base64')
                                if (room.roomId > 0) seqid = String(parsed.readUInt32BE(4))
                                else seqid = String(parsed.readUInt32BE(8))
                                clipboard.writeText(seqid)
                            },
                        },
                        {
                            label: '复制 random',
                            type: 'normal',
                            visible: !history,
                            click: () => {
                                let random: string
                                const parsed = Buffer.from(String(message._id), 'base64')
                                if (room.roomId > 0) random = String(parsed.readUInt32BE(8))
                                else random = String(parsed.readUInt32BE(12))
                                clipboard.writeText(random)
                            },
                        },
                        {
                            label: '复制 bubble id',
                            type: 'normal',
                            click: () => {
                                if (message.bubble_id) clipboard.writeText(String(message.bubble_id))
                                else ui.messageError('未获取到 bubble id')
                            },
                        },
                        {
                            label: '复制时间戳',
                            type: 'normal',
                            click: () => {
                                clipboard.writeText(message.time.toString())
                            },
                        },
                        {
                            label: '复制消息 JSON',
                            type: 'normal',
                            click: () => {
                                clipboard.writeText(JSON.stringify(message))
                            },
                        },
                        {
                            label: '合并转发本条消息',
                            type: 'normal',
                            click: () => {
                                const msgToForward = {
                                    user_id: message.senderId,
                                    message: message.content,
                                    nickname: message.username,
                                    time: message.time / 1000,
                                }
                                makeForward(msgToForward)
                            },
                        },
                        {
                            label: '尝试撤回本条消息',
                            type: 'normal',
                            click: () => {
                                deleteMessage(room.roomId, message._id as string)
                            },
                        },
                        {
                            label: '发送 Oidb 请求',
                            type: 'normal',
                            click: () => {
                                const oidb = message.content.match(/OidbSvc\.0x(\w+)_(\d+)/)[0]
                                sendPacket('Oidb', oidb, JSON.parse(message.content.replace(oidb, ''))).then(
                                    (retPacket) => {
                                        clipboard.writeText(Buffer.from(retPacket).toString('base64'))
                                        ui.message('Oidb 请求已发送，返回值已复制到剪贴板')
                                    },
                                )
                            },
                        },
                    ],
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
            menu.append(
                new MenuItem({
                    label: `查看代码`,
                    click: () => {
                        const codeWindow = newIcalinguaWindow({
                            autoHideMenuBar: true,
                            parent: win,
                            webPreferences: {
                                contextIsolation: false,
                                nodeIntegration: true,
                            },
                        })
                        codeWindow.webContents.once('did-finish-load', () => {
                            codeWindow.webContents.send(
                                'setCardSource',
                                message.code,
                                `卡片消息_${new Date().getTime()}`,
                            )
                        })
                        codeWindow.loadURL(getWinUrl() + '#/cardSource')
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
            menu.append(
                new MenuItem({
                    label: '另存为回复文件',
                    click: () =>
                        downloadFileByMessageData(
                            {
                                message: message.replyMessage,
                                room,
                                action: 'download',
                            },
                            true,
                        ),
                }),
            )
        }
        const messageFiles = message.files || [message.file]
        if (messageFiles && messageFiles.length) {
            if (menu.items.length && menu.items[menu.items.length - 1].type !== 'separator')
                //只有在上面有内容而且不是分隔符的时候加
                menu.append(
                    new MenuItem({
                        type: 'separator',
                    }),
                )
            for (let i = 0; i < messageFiles.length; i++) {
                const file = messageFiles[i]
                const fileMenu = new Menu()
                if (file.type.startsWith('image/')) {
                    fileMenu.append(
                        new MenuItem({
                            label: '复制图片',
                            type: 'normal',
                            click: async () => copyImage(file.url),
                        }),
                    )
                    fileMenu.append(
                        new MenuItem({
                            label: '添加为表情',
                            type: 'submenu',
                            submenu: Menu.buildFromTemplate(
                                getStickerGroupSubMenu(async (dir) => {
                                    const imgExt = await getImageExt(file.url)
                                    download(file.url, String(new Date().getTime()) + '.' + imgExt, dir)
                                }),
                            ),
                        }),
                    )
                }
                fileMenu.append(
                    new MenuItem({
                        label: '复制 URL',
                        type: 'normal',
                        click: () => {
                            clipboard.writeText(
                                file.type.toLowerCase().includes('audio/') ? file.fid || file.url : file.url,
                            )
                        },
                    }),
                )
                if (file.type.startsWith('image/') && !getConfig().localImageViewerByDefault)
                    fileMenu.append(
                        new MenuItem({
                            label: '使用本地查看器打开',
                            click: () => openImage(file.url, true),
                        }),
                    )
                if (file.type.startsWith('video/') || file.type.startsWith('audio/'))
                    fileMenu.append(
                        new MenuItem({
                            label: '使用本地播放器打开',
                            click: () => openMedia(file.url),
                        }),
                    )
                if (file.type.startsWith('video/'))
                    fileMenu.append(
                        new MenuItem({
                            label: '刷新视频地址',
                            visible: !history,
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
                if (file.type.startsWith('image/')) {
                    fileMenu.append(
                        new MenuItem({
                            label: '下载',
                            click: () => downloadImage(file.url),
                        }),
                    )
                    fileMenu.append(
                        new MenuItem({
                            label: '另存为',
                            click: () => downloadImage(file.url, true),
                        }),
                    )
                } else {
                    fileMenu.append(
                        new MenuItem({
                            label: '下载',
                            click: () => downloadFileByMessageData({ action: 'download', message, room }),
                        }),
                    )
                    fileMenu.append(
                        new MenuItem({
                            label: '另存为',
                            click: () => downloadFileByMessageData({ action: 'download', message, room }, true),
                        }),
                    )
                }
                if (messageFiles.length > 1) {
                    menu.append(
                        new MenuItem({
                            label: `文件#${i}`,
                            submenu: fileMenu,
                        }),
                    )
                } else {
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
                    for (const item of fileMenu.items) {
                        menu.append(item)
                    }
                }
            }
            if (messageFiles.length > 1) {
                menu.append(
                    new MenuItem({
                        label: '批量存图',
                        click: async () => {
                            for (const file of messageFiles) {
                                if (file.type.startsWith('image/')) {
                                    downloadImage(file.url)
                                    await sleep(1000)
                                }
                            }
                        },
                    }),
                )
            }
            menu.append(
                new MenuItem({
                    type: 'separator',
                }),
            )
        }
        menu.append(
            new MenuItem({
                label: history
                    ? String(message._id).split('|')[0] !== '-1'
                        ? String(message._id).split('|')[0] !== '284840486'
                            ? `复制转发来源 ID ${String(message._id).split('|')[0]}`
                            : '转发来源已被服务器屏蔽'
                        : '转发来源未知（可能来自私聊消息）'
                    : '复制消息 ID',
                type: 'normal',
                enabled: !(
                    history &&
                    (String(message._id).split('|')[0] === '-1' || String(message._id).split('|')[0] === '284840486')
                ),
                click: () => {
                    clipboard.writeText(String(message._id).split('|')[0])
                },
            }),
        )
        if (!history && !message.system) {
            menu.append(
                new MenuItem({
                    label: '标记为未读',
                    click: () => markMessageUnread(room.roomId, String(message._id)),
                }),
            )
        }
        if (
            (message.senderId === getUin() || ((await isAdmin(room.roomId)) && message.role !== 'owner')) &&
            !history &&
            !message.deleted
        )
            menu.append(
                new MenuItem({
                    label: '撤回',
                    visible:
                        message.time > Date.now() - 1000 * 60 * 2 ||
                        ((await isAdmin(room.roomId)) && (message.senderId === getUin() || message.role !== 'owner')),
                    click: () => {
                        if (message.senderId === getUin()) {
                            deleteMessage(room.roomId, message._id as string)
                        } else {
                            sendToWindow(win, 'confirmDeleteMessage', {
                                roomId: room.roomId,
                                messageId: message._id as string,
                            })
                        }
                    },
                }),
            )
        if (message.senderId === getUin() && !history && !message.deleted)
            menu.append(
                new MenuItem({
                    label: '一分钟后撤回',
                    visible:
                        message.time > Date.now() - 1000 * 60 * 1 ||
                        ((await isAdmin(room.roomId)) && (message.senderId === getUin() || message.role !== 'owner')),
                    click: () => {
                        setTimeout(() => deleteMessage(room.roomId, message._id as string), 1000 * 60)
                    },
                }),
            )
        if ((await isAdmin(room.roomId)) && !history && !message.deleted) {
            if (room.roomId < 0) {
                menu.append(
                    new MenuItem({
                        label: '设为精华',
                        click: () => {
                            const parsed = Buffer.from(message._id as string, 'base64')
                            const seqid = parsed.readUInt32BE(8)
                            const random = parsed.readUInt32BE(12)
                            sendPacket('Oidb', 'OidbSvc.0xeac_1', {
                                1: -room.roomId,
                                2: seqid,
                                3: random,
                            }).then((retPacket) => {
                                const ret = pb.decode(retPacket)[4]
                                if (ret[1]) {
                                    sendToWindow(win, 'messageError', ret[1].toString())
                                } else {
                                    sendToWindow(win, 'messageSuccess', '设置精华成功')
                                }
                            })
                        },
                    }),
                )
                menu.append(
                    new MenuItem({
                        label: '移出精华',
                        click: () => {
                            const parsed = Buffer.from(message._id as string, 'base64')
                            const seqid = parsed.readUInt32BE(8)
                            const random = parsed.readUInt32BE(12)
                            sendPacket('Oidb', 'OidbSvc.0xeac_2', {
                                1: -room.roomId,
                                2: seqid,
                                3: random,
                            }).then((retPacket) => {
                                const ret = pb.decode(retPacket)[4]
                                if (ret[1]) {
                                    sendToWindow(win, 'messageError', ret[1].toString())
                                } else {
                                    sendToWindow(win, 'messageSuccess', '移出精华成功')
                                }
                            })
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
                        if (win !== getMainWindow()) {
                            win.webContents.send('startForward', message._id as string)
                        } else {
                            ui.startForward(message._id as string)
                        }
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
                        if (win !== getMainWindow()) {
                            win.webContents.send('replyMessage', message)
                        } else {
                            ui.replyMessage(message)
                        }
                    },
                }),
            )
            const messageFileType = message.file?.type
            if (
                !message.markdown &&
                (!messageFileType || messageFileType.startsWith('image/') || messageFileType.startsWith('audio/'))
            ) {
                menu.append(
                    new MenuItem({
                        label: '转发',
                        visible: win === getMainWindow(),
                        click: () => {
                            ui.forwardSingleMessage(message._id as string)
                        },
                    }),
                )
                menu.append(
                    new MenuItem({
                        label: `+1${message.code ? ' (普通消息)' : ''}`,
                        click: () => {
                            let messageType
                            if (getConfig().anonymous) messageType = 'anonymous'
                            else if (message.code) messageType = 'text'
                            const msgToSend = createPlusOneMessage(message, {
                                roomId: room.roomId,
                                messageType,
                            })
                            sendMessage(msgToSend)
                        },
                    }),
                )
                if (message.code)
                    menu.append(
                        new MenuItem({
                            label: '+1 (卡片消息)',
                            click: () => {
                                const isJSON = (str) => {
                                    try {
                                        if (typeof JSON.parse(str) == 'object') return true
                                    } catch (e) {}
                                    return false
                                }
                                const messageType = isJSON(message.code) ? 'json' : 'xml'
                                const msgToSend = {
                                    content: message.code,
                                    replyMessage: message.replyMessage,
                                    at: [],
                                    roomId: room.roomId,
                                    messageType,
                                }
                                sendMessage(msgToSend)
                            },
                        }),
                    )
                menu.append(
                    new MenuItem({
                        label: '复制到编辑区',
                        click: () => {
                            const imageUrls = message.files
                                ? message.files.filter((f) => f.type && f.type.startsWith('image')).map((f) => f.url)
                                : message.file
                                  ? [message.file.url]
                                  : []
                            if (win !== getMainWindow()) {
                                win.webContents.send('setMessageText', message.content)
                                for (const url of imageUrls) win.webContents.send('pasteGif', url)
                                win.webContents.send('replyMessage', message.replyMessage)
                            } else {
                                ui.setMessageText(message.content)
                                for (const url of imageUrls) ui.pasteGif(url)
                                ui.replyMessage(message.replyMessage)
                            }
                        },
                    }),
                )
            }
            menu.append(
                new MenuItem({
                    label: '获取历史消息',
                    click: () => fetchHistory(message._id as string, room.roomId),
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
    menu.popup({ window: win, ...pos })
})
ipcMain.on('popupTextAreaMenu', (event, e) => {
    const win = getSenderWindow(event)
    const bounds = win.getContentBounds()
    const pos = { x: e.x - bounds.x, y: e.y - bounds.y }
    // 判断是否为独立聊天窗口
    const isStandaloneWindow = win !== getMainWindow()
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
        {
            label: 'Pangu spacing',
            click: () => {
                const text = spacingSendMessage(e.text, atCache.get())
                if (isStandaloneWindow) {
                    win.webContents.send('setMessageText', text)
                } else {
                    ui.setMessageText(text)
                }
            },
        },
    ]).popup({ window: win, ...pos })
})
ipcMain.on('popupStickerMenu', (event, closePanel, e) => {
    const win = getSenderWindow(event)
    const bounds = win.getContentBounds()
    const pos = { x: e.x - bounds.x, y: e.y - bounds.y }
    const menu: Electron.MenuItemConstructorOptions[] = [
        {
            label: '打开 Stickers 目录',
            type: 'normal',
            click() {
                shell.openPath(path.join(app.getPath('userData'), 'stickers'))
            },
        },
        {
            label: '发送猜拳',
            type: 'normal',
            click() {
                if (win !== getMainWindow()) {
                    win.webContents.send('sendRps')
                } else {
                    ui.sendRps()
                }
            },
        },
        {
            label: '发送骰子',
            type: 'normal',
            click() {
                if (win !== getMainWindow()) {
                    win.webContents.send('sendDice')
                } else {
                    ui.sendDice()
                }
            },
        },
        {
            label: '发送窗口抖动',
            type: 'normal',
            click() {
                let roomId: number | undefined
                if (win !== getMainWindow()) {
                    roomId = getRoomIdByWindow(win)
                }
                sendMessage({
                    content: '[窗口抖动]',
                    at: [],
                    roomId,
                    messageType: 'shake',
                })
            },
        },
        {
            label: '戳自己',
            click: () => {
                let roomId = ui.getSelectedRoomId()
                if (win !== getMainWindow()) {
                    roomId = getRoomIdByWindow(win) || roomId
                }
                sendGroupPoke(Math.abs(roomId), getUin())
            },
        },
    ]
    if (closePanel) {
        menu.push({
            label: '关闭面板',
            type: 'normal',
            click: () => {
                if (win !== getMainWindow()) {
                    win.webContents.send('closePanel')
                } else {
                    ui.closePanel()
                }
            },
        })
    }
    Menu.buildFromTemplate(menu).popup({ window: win, ...pos })
})
ipcMain.on('popupStickerItemMenu', (event, itemName: string, itemList: Array<string>, e) => {
    const win = getSenderWindow(event)
    const bounds = win.getContentBounds()
    const pos = { x: e.x - bounds.x, y: e.y - bounds.y }
    const menu: (Electron.MenuItemConstructorOptions | Electron.MenuItem)[] = []
    menu.push({
        label: '以图片方式发送',
        type: 'normal',
        click() {
            if (win !== getMainWindow()) {
                win.webContents.send('pasteGif', itemName)
            } else {
                ui.pasteGif(itemName)
            }
        },
    })
    menu.push({
        label: '查看大图',
        type: 'normal',
        click() {
            openImage(itemName, false, itemList)
        },
    })
    if (/^https?:\/\//i.test(itemName)) {
        menu.push({
            label: '添加到本地表情',
            type: 'normal',
            click() {
                download(itemName, String(new Date().getTime()), path.join(app.getPath('userData'), 'stickers'))
            },
        })
        menu.push({
            label: '全部添加到本地',
            type: 'normal',
            click() {
                itemList?.forEach(async (item, index) => {
                    await sleep(1000 * index)
                    download(item, String(new Date().getTime()), path.join(app.getPath('userData'), 'stickers'))
                })
            },
        })
    } else {
        menu.push({
            label: '移动到分类',
            type: 'normal',
            click() {
                sendToWindow(win, 'moveSticker', itemName)
            },
        })
        menu.push({
            label: '删除',
            type: 'normal',
            click() {
                sendToWindow(win, 'confirmDeleteSticker', itemName)
            },
        })
    }
    Menu.buildFromTemplate(menu).popup({ window: win, ...pos })
})
ipcMain.on('popupStickerDirMenu', (event, dirName: string, e) => {
    const win = getSenderWindow(event)
    const bounds = win.getContentBounds()
    const pos = { x: e.x - bounds.x, y: e.y - bounds.y }
    const menu: (Electron.MenuItemConstructorOptions | Electron.MenuItem)[] = []
    menu.push({
        label: `删除分类 ${dirName}`,
        type: 'normal',
        enabled: dirName !== 'Default',
        click() {
            sendToWindow(win, 'confirmDeleteStickerDir', dirName)
        },
    })

    Menu.buildFromTemplate(menu).popup({ window: win, ...pos })
})
ipcMain.on('popupAvatarMenu', async (event, message: Message, room: Room, ev) => {
    const win = getSenderWindow(event)
    const bounds = win.getContentBounds()
    const pos = { x: ev.x - bounds.x, y: ev.y - bounds.y }
    const menu = Menu.buildFromTemplate([
        {
            label: `复制 "${message.username}"`,
            click: () => {
                clipboard.writeText(message.username)
            },
        },
        {
            label: message.senderId === 1094950020 ? '发送者 QQ 已被服务器屏蔽' : `复制 "${message.senderId}"`,
            enabled: message.senderId !== 1094950020,
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
    if (event.sender === getMainWindow().webContents || win !== getMainWindow())
        menu.append(
            new MenuItem({
                label: '@ TA',
                click() {
                    atCache.push({
                        text: '@' + (message.username || String(message.senderId)),
                        id: message.senderId,
                    })
                    if (win !== getMainWindow()) {
                        win.webContents.send(
                            'addMessageText',
                            '@' + (message.username || String(message.senderId)) + ' ',
                        )
                    } else {
                        ui.addMessageText('@' + (message.username || String(message.senderId)) + ' ')
                    }
                },
            }),
        )
    if (room.roomId < 0) {
        menu.append(
            new MenuItem({
                label: '戳一戳',
                click: () => {
                    sendGroupPoke(Math.abs(room.roomId), message.senderId)
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
                } else if (message.mirai && message.mirai.eqq.avatarUrl) {
                    const QCLOUD_AVATAR_REGEX =
                        /^https:\/\/[a-z0-9\-]+\.cos\.[a-z\-]+\.myqcloud\.com\/[0-9]+-[0-9]+\.jpg$/
                    if (QCLOUD_AVATAR_REGEX.test(message.mirai.eqq.avatarUrl)) openImage(message.mirai.eqq.avatarUrl)
                } else if (message.head_img) {
                    openImage(message.head_img)
                } else {
                    openImage(`https://q1.qlogo.cn/g?b=qq&nk=${message.senderId}&s=0`)
                }
            },
        }),
    )
    menu.append(
        new MenuItem({
            label: `复制头像 URL`,
            click: () => {
                clipboard.writeText(`https://q1.qlogo.cn/g?b=qq&nk=${message.senderId}&s=0`)
            },
        }),
    )
    menu.append(
        new MenuItem({
            label: '下载头像',
            click: () => {
                const basename = `${message.username}(${message.senderId})的头像_${new Date().getTime()}`
                if (message.mirai && message.mirai.eqq.avatarMd5) {
                    downloadImage(getImageUrlByMd5(message.mirai.eqq.avatarMd5))
                } else if (message.mirai && message.mirai.eqq.avatarUrl) {
                    const QCLOUD_AVATAR_REGEX =
                        /^https:\/\/[a-z0-9\-]+\.cos\.[a-z\-]+\.myqcloud\.com\/[0-9]+-[0-9]+\.jpg$/
                    if (QCLOUD_AVATAR_REGEX.test(message.mirai.eqq.avatarUrl))
                        downloadImage(message.mirai.eqq.avatarUrl)
                } else if (message.head_img) {
                    downloadImage(message.head_img, false, basename)
                } else {
                    downloadImage(`https://q1.qlogo.cn/g?b=qq&nk=${message.senderId}&s=0`, false, basename)
                }
            },
        }),
    )
    menu.append(
        new MenuItem({
            label: `发起私聊`,
            click: async () => {
                if (win === getMainWindow()) {
                    ui.startChat(message.senderId, message.username)
                    return
                }

                const room = await getRoom(message.senderId)
                if (!room) return
                const { openChatWindow } = await import('../utils/windowManager')
                const roomName =
                    room.roomId < 0 && getConfig().removeGroupNameEmotes
                        ? removeGroupNameEmotes(room.roomName)
                        : room.roomName
                await openChatWindow(message.senderId, roomName)
                if (ui.getSelectedRoomId() === message.senderId) ui.chroom(0)
            },
        }),
    )
    menu.append(
        new MenuItem({
            label: `查看共同群聊`,
            click: () => showCommonGroupsInMainWindow(message.senderId, message.username),
        }),
    )
    menu.append(
        new MenuItem({
            label: '查看发言记录',
            submenu: Menu.buildFromTemplate([
                ...(room.roomId < 0
                    ? [
                          {
                              label: '当前群',
                              click: () => {
                                  openMemberHistoryWindow(message.senderId, room.roomId, message.username)
                              },
                          },
                      ]
                    : []),
                {
                    label: '所有群',
                    click: () => {
                        openMemberHistoryWindow(message.senderId, 0, message.username)
                    },
                },
            ]),
        }),
    )
    menu.append(createSenderMessageSearchMenu(message.senderId, message.username, room.roomId))
    menu.append(
        new MenuItem({
            label: `屏蔽此人`,
            click: () => sendToWindow(win, 'confirmIgnoreChat', { id: message.senderId, name: message.username }),
        }),
    )
    if (
        message.senderId !== getUin() &&
        ((await isAdmin(room.roomId)) === 'owner' ||
            ((await isAdmin(room.roomId)) === 'admin' && message.role !== 'owner' && message.role !== 'admin'))
    ) {
        menu.append(
            new MenuItem({
                label: `禁言`,
                visible: room.roomId !== 0,
                click: async () => {
                    const actionWindow = newIcalinguaWindow({
                        height: 210,
                        width: 600,
                        autoHideMenuBar: true,
                        maximizable: false,
                        modal: true,
                        parent: win,
                        webPreferences: {
                            contextIsolation: false,
                            nodeIntegration: true,
                        },
                    })
                    await actionWindow.loadURL(
                        getWinUrl() +
                            '#/muteUser/' +
                            -room.roomId +
                            '/' +
                            message.senderId +
                            '/' +
                            querystring.escape(
                                getConfig().removeGroupNameEmotes
                                    ? removeGroupNameEmotes(room.roomName)
                                    : room.roomName,
                            ) +
                            '/' +
                            querystring.escape(message.username || String(message.senderId)) +
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
                    const actionWindow = newIcalinguaWindow({
                        height: 150,
                        width: 500,
                        autoHideMenuBar: true,
                        maximizable: false,
                        modal: true,
                        parent: win,
                        webPreferences: {
                            contextIsolation: false,
                            nodeIntegration: true,
                        },
                    })
                    await actionWindow.loadURL(
                        getWinUrl() +
                            '#/kickAndExit/kick/' +
                            -room.roomId +
                            '/' +
                            message.senderId +
                            '/' +
                            querystring.escape(
                                getConfig().removeGroupNameEmotes
                                    ? removeGroupNameEmotes(room.roomName)
                                    : room.roomName,
                            ) +
                            '/' +
                            querystring.escape(message.username || String(message.senderId)),
                    )
                },
            }),
        )
    }
    menu.popup({ window: win, ...pos })
})
ipcMain.on(
    'popupContactMenu',
    (event, e, remark?: string, name?: string, displayId?: number, groupContext?: GroupMenuContext) => {
        const win = getSenderWindow(event)
        const bounds = win.getContentBounds()
        const pos = { x: e.x - bounds.x, y: e.y - bounds.y }
        const menu = new Menu()
        const groupId = groupContext?.groupId
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
        const roomId = groupId ? -groupId : displayId
        if (displayId) {
            menu.append(
                new MenuItem({
                    label: `复制 "${displayId}"`,
                    click: () => {
                        clipboard.writeText(displayId.toString())
                    },
                }),
            )
            const avatarType = groupId ? '群头像' : '头像'
            menu.append(
                new MenuItem({
                    label: `查看${avatarType}`,
                    click: () => {
                        openImage(getAvatarUrl(roomId, false, true), false)
                    },
                }),
            )
            menu.append(
                new MenuItem({
                    label: `下载${avatarType}`,
                    click: () => {
                        const cleanRemark =
                            groupId && getConfig().removeGroupNameEmotes ? removeGroupNameEmotes(remark) : remark
                        const basename = `${cleanRemark}(${Math.abs(displayId)})的${avatarType}_${new Date().getTime()}`
                        downloadImage(getAvatarUrl(roomId, false, true), false, basename)
                    },
                }),
            )
            // 添加"查看共同群聊"选项（仅对好友显示）
            if (!groupId) {
                menu.append(
                    new MenuItem({
                        label: '查看共同群聊',
                        click: () => showCommonGroupsInMainWindow(displayId, remark || name || String(displayId)),
                    }),
                )
                menu.append(createSenderMessageSearchMenu(displayId, remark || name || String(displayId), displayId))
            }
        }
        menu.append(
            new MenuItem({
                label: groupContext ? '屏蔽消息' : '屏蔽此人',
                click: () => {
                    ui.confirmIgnoreChat({
                        id: roomId,
                        name:
                            groupContext && getConfig().removeGroupNameEmotes ? removeGroupNameEmotes(remark) : remark,
                    })
                },
            }),
        )
        if (groupContext) {
            menu.append(
                new MenuItem({
                    label: groupContext.ownerId === getUin() ? '解散本群' : '退出本群',
                    click: async () => {
                        const actionWindow = newIcalinguaWindow({
                            height: 130,
                            width: 500,
                            autoHideMenuBar: true,
                            maximizable: false,
                            modal: true,
                            parent: win,
                            webPreferences: {
                                contextIsolation: false,
                                nodeIntegration: true,
                            },
                        })
                        await actionWindow.loadURL(
                            getWinUrl() +
                                '#/kickAndExit/' +
                                (groupContext.ownerId === getUin() ? 'dismiss' : 'exit') +
                                '/' +
                                groupContext.groupId +
                                '/0/' +
                                querystring.escape(
                                    getConfig().removeGroupNameEmotes ? removeGroupNameEmotes(remark) : remark,
                                ) +
                                '/0',
                        )
                    },
                }),
            )
        }
        menu.popup({ window: win, ...pos })
    },
)

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

ipcMain.on('copyImage', (_, url: string) => copyImage(url))

ipcMain.on(
    'popupGroupMemberMenu',
    async (event, e, remark?: string, name?: string, displayId?: number, groupContext?: GroupMenuContext) => {
        const win = getSenderWindow(event)
        const bounds = win.getContentBounds()
        const pos = { x: e.x - bounds.x, y: e.y - bounds.y }
        const menu = new Menu()
        const groupId = Number(groupContext?.groupId) || 0
        const hasGroupContext = groupId > 0
        const groupRoomId = groupId > 0 ? -groupId : 0
        const groupRoom = groupRoomId < 0 ? await getRoom(groupRoomId) : null
        const groupRoomName = groupRoom
            ? getConfig().removeGroupNameEmotes
                ? removeGroupNameEmotes(groupRoom.roomName)
                : groupRoom.roomName
            : String(groupId)
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
            menu.append(
                new MenuItem({
                    label: '查看头像',
                    click: () => {
                        openImage(getAvatarUrl(displayId, false, true), false)
                    },
                }),
            )
            menu.append(
                new MenuItem({
                    label: '复制头像 URL',
                    click: () => {
                        clipboard.writeText(getAvatarUrl(displayId, false, true))
                    },
                }),
            )
            menu.append(
                new MenuItem({
                    label: '下载头像',
                    click: () => {
                        const basename = `${remark}(${displayId})的头像_${new Date().getTime()}`
                        downloadImage(getAvatarUrl(displayId, false, true), false, basename)
                    },
                }),
            )
            // 添加"查看共同群聊"选项
            menu.append(
                new MenuItem({
                    label: '查看共同群聊',
                    click: () => showCommonGroupsInMainWindow(displayId, remark || name || String(displayId)),
                }),
            )
            menu.append(
                new MenuItem({
                    label: '查看发言记录',
                    submenu: Menu.buildFromTemplate([
                        ...(hasGroupContext
                            ? [
                                  {
                                      label: '当前群',
                                      click: () => {
                                          openMemberHistoryWindow(
                                              displayId,
                                              groupRoomId,
                                              remark || name || String(displayId),
                                          )
                                      },
                                  },
                              ]
                            : []),
                        {
                            label: '所有群',
                            click: () => {
                                openMemberHistoryWindow(displayId, 0, remark || name || String(displayId))
                            },
                        },
                    ]),
                }),
            )
            menu.append(
                createSenderMessageSearchMenu(displayId, remark || name || String(displayId), groupRoomId || undefined),
            )
        }
        menu.append(
            new MenuItem({
                label: '屏蔽此人',
                click: () => {
                    sendToWindow(win, 'confirmIgnoreChat', { id: displayId, name: remark })
                },
            }),
        )
        if (hasGroupContext) {
            menu.append(
                new MenuItem({
                    label: '@ TA',
                    click: async () => {
                        atCache.push({
                            text: '@' + (remark || String(displayId)),
                            id: displayId,
                        })
                        sendToWindow(win, 'addMessageText', '@' + (remark || String(displayId)) + ' ')
                        sendToWindow(win, 'openGroupMemberPanel', { shown: false, gin: groupId })
                    },
                }),
            )
            menu.append(
                new MenuItem({
                    label: '戳一戳',
                    click: () => {
                        sendGroupPoke(groupId, displayId)
                        sendToWindow(win, 'openGroupMemberPanel', { shown: false, gin: groupId })
                    },
                }),
            )
            menu.append(
                new MenuItem({
                    label: '禁言',
                    visible: groupRoomId < 0 && (await isAdmin(groupRoomId)) !== false,
                    click: async () => {
                        const actionWindow = newIcalinguaWindow({
                            height: 300,
                            width: 600,
                            autoHideMenuBar: true,
                            maximizable: false,
                            modal: true,
                            parent: win,
                            webPreferences: {
                                contextIsolation: false,
                                nodeIntegration: true,
                            },
                        })
                        await actionWindow.loadURL(
                            getWinUrl() +
                                '#/muteUser/' +
                                groupId +
                                '/' +
                                displayId +
                                '/' +
                                querystring.escape(groupRoomName) +
                                '/' +
                                querystring.escape(remark || String(displayId)) +
                                '/' +
                                'null',
                        )
                    },
                }),
            )
            menu.append(
                new MenuItem({
                    label: '移出本群',
                    visible: groupRoomId < 0 && (await isAdmin(groupRoomId)) !== false,
                    click: async () => {
                        const actionWindow = newIcalinguaWindow({
                            height: 150,
                            width: 500,
                            autoHideMenuBar: true,
                            maximizable: false,
                            modal: true,
                            parent: win,
                            webPreferences: {
                                contextIsolation: false,
                                nodeIntegration: true,
                            },
                        })
                        await actionWindow.loadURL(
                            getWinUrl() +
                                '#/kickAndExit/kick/' +
                                groupId +
                                '/' +
                                displayId +
                                '/' +
                                querystring.escape(groupRoomName) +
                                '/' +
                                querystring.escape(remark || String(displayId)),
                        )
                    },
                }),
            )
        }
        menu.popup({ window: win, ...pos })
    },
)

// 定位到指定消息
ipcMain.on('gotoMessage', async (_, roomId: number, messageId: string) => {
    const selectedRoom = await getSelectedRoom()

    if (selectedRoom && selectedRoom.roomId === roomId) {
        // 当前房间已打开，唤回主窗口后定位
        tryToShowMainWindow(() => ui.gotoMessage(roomId, messageId))
    } else {
        // 打开新窗口并定位到消息
        const { openChatWindow } = await import('../utils/windowManager')
        const room = await getRoom(roomId)
        const roomName = room
            ? roomId < 0 && getConfig().removeGroupNameEmotes
                ? removeGroupNameEmotes(room.roomName)
                : room.roomName
            : String(Math.abs(roomId))
        await openChatWindow(roomId, roomName, messageId)
    }
})

// 图片浏览界面的右键菜单
ipcMain.on(
    'popupImageGalleryMenu',
    async (
        event,
        {
            x,
            y,
            roomId,
            messageId,
            imageUrl,
        }: { x: number; y: number; roomId: number; messageId: string; imageUrl: string },
    ) => {
        const menu = new Menu()

        menu.append(
            new MenuItem({
                label: '保存图片',
                click: () => {
                    downloadImage(imageUrl, true)
                },
            }),
        )

        menu.append(
            new MenuItem({
                label: '在聊天中定位',
                click: async () => {
                    // 定位到消息
                    const selectedRoom = await getSelectedRoom()
                    if (selectedRoom && selectedRoom.roomId === roomId) {
                        // 当前房间已打开，定位并聚焦主窗口
                        ui.gotoMessage(roomId, messageId)
                        getMainWindow().focus()
                    } else {
                        // 检查是否已在独立窗口打开
                        const { openChatWindow, isRoomInChatWindow, focusChatWindow } =
                            await import('../utils/windowManager')
                        if (isRoomInChatWindow(roomId)) {
                            // 已在独立窗口打开，聚焦并定位
                            focusChatWindow(roomId)
                            // 发送定位消息的事件
                            const { sendToChatWindow } = await import('../utils/windowManager')
                            sendToChatWindow(roomId, 'gotoMessage', messageId)
                        } else {
                            // 打开新窗口并定位到消息
                            const room = await getRoom(roomId)
                            const roomName = room
                                ? roomId < 0 && getConfig().removeGroupNameEmotes
                                    ? removeGroupNameEmotes(room.roomName)
                                    : room.roomName
                                : String(Math.abs(roomId))
                            await openChatWindow(roomId, roomName, messageId)
                        }
                    }
                },
            }),
        )

        menu.popup({ window: BrowserWindow.fromWebContents(event.sender) })
    },
)
