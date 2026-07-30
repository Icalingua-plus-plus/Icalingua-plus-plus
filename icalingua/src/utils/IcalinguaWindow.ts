import { BrowserWindow, screen, shell, dialog } from 'electron'
import getStaticPath from './getStaticPath'
import path from 'path'
import fs from 'fs'
import { getBkn, getCookies } from '../main/ipc/botAndStorage'
import { download } from '../main/ipc/downloadManager'

/**
 * Wayland 合成器（niri / Hyprland 等）的 open-* 窗口规则只在 surface 首次 commit
 * 时匹配一次。Electron 单进程内所有窗口共享同一个 app_id，唯一可区分窗口类型的
 * 属性是 title；而默认行为下窗口构造时 title 为空，等 HTML loadURL 完才被
 * document.title 覆盖，存在加载慢就匹配不上规则的竞争。
 *
 * - stableTitle: 把 title 注入构造选项使首次 map 即生效，并拦截 page-title-updated
 *   防止 HTML 改 title 破坏规则匹配。
 */
export interface StableTitleOptions {
    stableTitle?: string
}

export function newIcalinguaWindow(
    options?: Electron.BrowserWindowConstructorOptions,
    stable?: StableTitleOptions,
): BrowserWindow {
    const finalOptions: Electron.BrowserWindowConstructorOptions = { ...(options || {}) }
    const shouldShowImmediately = finalOptions.show !== false
    if (shouldShowImmediately) {
        // Let Electron finish creating and styling the native window before mapping it on screen.
        // This avoids the default-colored client-area frame that Windows may paint for show:true.
        finalOptions.show = false
    }
    if (stable?.stableTitle) {
        finalOptions.title = stable.stableTitle
    }
    const win = new BrowserWindow(finalOptions)
    if (finalOptions.backgroundColor) {
        win.setBackgroundColor(finalOptions.backgroundColor)
    }
    if (stable?.stableTitle) {
        win.on('page-title-updated', (e) => e.preventDefault())
    }
    if (shouldShowImmediately) {
        win.show()
    }
    win.webContents.on('will-prevent-unload', (event) => {
        const choice = dialog.showMessageBoxSync(win, {
            type: 'question',
            buttons: ['Leave', 'Stay'],
            title: 'Do you want to leave this site?',
            message: 'Changes you made may not be saved.',
            defaultId: 0,
            cancelId: 1,
        })
        const leave = choice === 0
        if (leave) {
            event.preventDefault()
        }
    })
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
                    await win1.loadURL(details.url, { userAgent: 'QQ/8.9.63.11390' })
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
