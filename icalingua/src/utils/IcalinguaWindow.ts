import { BrowserWindow, screen } from 'electron'
import getStaticPath from './getStaticPath'
import path from 'path'
import { getCookies } from '../main/ipc/botAndStorage'

export function newIcalinguaWindow(options?: Electron.BrowserWindowConstructorOptions): BrowserWindow {
    const win = new BrowserWindow(options)
    if (
        options &&
        options.webPreferences &&
        options.webPreferences.preload === path.join(getStaticPath(), 'homeworkPreload.js')
    ) {
        win.webContents.setWindowOpenHandler((details) => {
            if (new URL(details.url).hostname == 'qun.qq.com') {
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
            }
            return {
                action: 'deny',
            }
        })
    }
    return win
}
