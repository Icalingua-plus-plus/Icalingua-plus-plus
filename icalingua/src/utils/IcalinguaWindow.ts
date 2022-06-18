import { BrowserWindow, globalShortcut } from 'electron'

export let allWindows: BrowserWindow[] = []

export function newIcalinguaWindow(options?: Electron.BrowserWindowConstructorOptions): BrowserWindow {
    const win = new BrowserWindow(options)
    win.on('focus', () => {
        // macOS Shortcut
        if (process.platform === 'darwin') {
            let contents = win.webContents
            globalShortcut.register('CommandOrControl+C', () => {
                if (contents) contents.copy()
            })
            globalShortcut.register('CommandOrControl+V', () => {
                if (contents) contents.paste()
            })
            globalShortcut.register('CommandOrControl+X', () => {
                if (contents) contents.cut()
            })
            globalShortcut.register('CommandOrControl+A', () => {
                if (contents) contents.selectAll()
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
    allWindows.push(win)
    allWindows = allWindows.filter(w => !w.isDestroyed())
    return win
}
