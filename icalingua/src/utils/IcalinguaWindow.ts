import { BrowserWindow, globalShortcut } from 'electron'

export function newIcalinguaWindow(options?: Electron.BrowserWindowConstructorOptions): BrowserWindow {
    const win = new BrowserWindow(options)
    win.on('focus', () => {
        // macOS Shortcut
        if (process.platform === 'darwin') {
            let contents = win.webContents
            globalShortcut.register('CommandOrControl+C', () => {
                contents.copy()
            })
            globalShortcut.register('CommandOrControl+V', () => {
                contents.paste()
            })
            globalShortcut.register('CommandOrControl+X', () => {
                contents.cut()
            })
            globalShortcut.register('CommandOrControl+A', () => {
                contents.selectAll()
            })
        }
    })
    win.on('blur', () => {
        if (process.platform === 'darwin') {
            globalShortcut.unregisterAll()
        }
    })
    win.on('close', () => {
        if (process.platform === 'darwin') {
            globalShortcut.unregisterAll()
        }
    })
    return win
}
