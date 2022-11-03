import { BrowserWindow, screen, shell } from 'electron'
import getStaticPath from './getStaticPath'
import path from 'path'
import { getCookies } from '../main/ipc/botAndStorage'
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

                    await win1.loadURL(details.url, { userAgent: 'QQ/8.9.13.9280' })
                })()
            } else if (url.hostname == 'docs.qq.com') {
                // 导出作业完成情况
                const search = new URLSearchParams(url.search)
                const fileName = search.get('fileName')
                const downloadUrl = search.get('url')
                if (fileName !== null && downloadUrl !== null) download(downloadUrl, fileName)
            } else if (url.host.endsWith('file.myqcloud.com')) {
                // lgtm[js/incomplete-url-substring-sanitization]
                // 下载提交的作业文件
                // 域名为 grouphw-xxxxxx.file.myqcloud.com 形式
                const fileName = new URLSearchParams(url.search).get('fileName') || ''
                download(details.url, fileName)
            }
            return {
                action: 'deny',
            }
        })
    }
    return win
}
