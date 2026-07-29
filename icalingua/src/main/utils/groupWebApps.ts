import type Room from '@icalingua/types/Room'
import { screen } from 'electron'
import fs from 'fs'
import path from 'path'
import getStaticPath from '../../utils/getStaticPath'
import { newIcalinguaWindow, openMannounceWindow } from '../../utils/IcalinguaWindow'
import socketIoProvider from '../providers/socketIoProvider'
import { getConfig } from './configManager'
import gfsTokenManager from './gfsTokenManager'
import isAdmin from './isAdmin'
import { getCookies, requestGfsToken } from '../ipc/botAndStorage'
import { download } from '../ipc/downloadManager'

export const openGroupAnnouncements = async (room: Room) => {
    if (room.roomId >= 0) return

    const size = screen.getPrimaryDisplay().size
    const win = newIcalinguaWindow({
        height: size.height - 200,
        width: 500,
        autoHideMenuBar: true,
        title: '群公告',
        webPreferences: {
            preload: path.join(getStaticPath(), 'mannouncePreload.js'),
            contextIsolation: false,
        },
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
    win.webContents.setWindowOpenHandler((details) => {
        if (details.url.startsWith('https://web.qun.qq.com/mannounce/')) {
            const detailWindow = openMannounceWindow(
                details.url.includes('detail') ? '查看群公告' : '发布新公告',
                250,
                details.url,
            )
            detailWindow.on('closed', () => {
                if (win.isDestroyed()) return
                win.webContents.reload()
            })
        }
        return { action: 'deny' }
    })
    win.webContents.on('did-finish-load', () => {
        win.webContents.executeJavaScript(fs.readFileSync(path.join(getStaticPath(), 'mannounceInj.js'), 'utf-8'))
    })
    await win.loadURL('https://web.qun.qq.com/mannounce/index.html#gc=' + -room.roomId)
}

export const openGroupFiles = async (room: Room) => {
    if (room.roomId >= 0) return

    const external = getConfig().externalGfsBrowser
    let url: string
    if (external) {
        url = external.replace('{groupId}', String(-room.roomId))
    } else if (getConfig().adapter === 'socketIo') {
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
            // 隔离群文件页与主窗口下载会话，避免转交后的下载再次触发当前监听器
            partition: 'file-manager',
            preload: path.join(getStaticPath(), 'fileManagerPreload.js'),
            contextIsolation: false,
        },
    })
    win.webContents.session.on('will-download', (_event, item) => {
        item.cancel()
        download(item.getURL(), item.getFilename())
    })
    await win.loadURL(url)
    await win.webContents.executeJavaScript('window.isAdmin = "' + (await isAdmin(room.roomId)) + '"')
}
