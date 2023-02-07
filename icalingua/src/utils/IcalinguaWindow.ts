import { BrowserWindow, screen, shell } from 'electron'
import getStaticPath from './getStaticPath'
import path from 'path'
import fs from 'fs'
import { getBkn, getCookies } from '../main/ipc/botAndStorage'
import { download } from '../main/ipc/downloadManager'

export function newIcalinguaWindow(options?: Electron.BrowserWindowConstructorOptions): BrowserWindow {
    const win = new BrowserWindow(options)
    if (
        options &&
        options.webPreferences &&
        options.webPreferences.preload === path.join(getStaticPath(), 'homeworkPreload.js')
    ) {
        win.webContents.setWindowOpenHandler((details) => {
            const url = new URL(details.url)
            if (url.hostname == 'qun.qq.com') {
                ;(async () => {
                    const size = screen.getPrimaryDisplay().size
                    const win1 = newIcalinguaWindow({
                        height: size.height - 300,
                        width: 500,
                        autoHideMenuBar: true,
                        parent: win,
                        webPreferences: {
                            contextIsolation: false,
                            preload: path.join(getStaticPath(), 'homeworkPreload.js'),
                        },
                    })
                    const cookies = await getCookies('qun.qq.com')
                    for (const i in cookies) {
                        await win1.webContents.session.cookies.set({
                            url: 'https://qun.qq.com',
                            name: i,
                            value: cookies[i],
                        })
                    }
                    win1.on('closed', () => {
                        setTimeout(() => {
                            if (!win.isDestroyed()) win.reload()
                        }, 0)
                    })
                    win1.webContents.on('did-finish-load', () => {
                        if (details.url.includes('qun.qq.com/homework/p/features/index.html#/answer'))
                            win1.webContents.insertCSS('#answer .answer-content {overflow: auto;}')
                    })
                    await win1.loadURL(details.url, { userAgent: 'QQ/8.9.13.9280' })
                })()
            } else if (url.hostname == 'docs.qq.com') {
                // 导出作业完成情况
                const search = new URLSearchParams(url.search)
                const fileName = search.get('fileName')
                const downloadUrl = search.get('url')
                if (fileName !== null && downloadUrl !== null) download(downloadUrl, fileName, undefined, true)
            } else if (url.host.endsWith('file.myqcloud.com')) {
                // lgtm[js/incomplete-url-substring-sanitization]
                // 下载提交的作业文件
                // 域名为 grouphw-xxxxxx.file.myqcloud.com 形式
                const fileName = new URLSearchParams(url.search).get('fileName') || ''
                download(details.url, fileName, undefined, true)
            }
            return {
                action: 'deny',
            }
        })
    }
    return win
}

/** 不带 Cookie 打开群公告相关窗口，打开前需确保有 Cookie，用于子窗口 */
export function openMannounceWindow(title: string, decreaseSize: number, url: string): BrowserWindow {
    const size = screen.getPrimaryDisplay().size
    const win = newIcalinguaWindow({
        height: size.height - decreaseSize,
        width: 500,
        autoHideMenuBar: true,
        title: title,
        webPreferences: {
            preload: path.join(getStaticPath(), 'mannouncePreload.js'),
            contextIsolation: false,
        },
    })
    win.webContents.setWindowOpenHandler((details) => {
        let win1: BrowserWindow
        if (details.url.startsWith('https://web.qun.qq.com/mannounce/detail.html')) {
            win1 = openMannounceWindow('查看群公告', decreaseSize + 50, details.url)
        } else if (details.url.startsWith('https://web.qun.qq.com/mannounce/edit.html')) {
            win1 = openMannounceWindow('编辑群公告', decreaseSize + 50, details.url)
        }
        if (
            url.startsWith('https://web.qun.qq.com/mannounce/detail.html') &&
            !details.url.startsWith('https://web.qun.qq.com/mannounce/')
        )
            shell.openExternal(details.url)
        if (win1) {
            win1.on('closed', () => {
                if (win.isDestroyed()) return
                win.webContents.reload()
            })
        }
        return {
            action: 'deny',
        }
    })
    win.webContents.on('did-finish-load', () => {
        win.webContents.executeJavaScript(fs.readFileSync(path.join(getStaticPath(), 'mannounceInj.js'), 'utf-8'))
        win.webContents.executeJavaScript(`window.qq_bkn = ${getBkn()}`)
    })
    win.loadURL(url)
    return win
}
