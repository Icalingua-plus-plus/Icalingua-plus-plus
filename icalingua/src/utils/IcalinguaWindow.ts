import { BrowserWindow, globalShortcut } from 'electron'

export function newIcalinguaWindow (options?: Electron.BrowserWindowConstructorOptions) : BrowserWindow {
    const win = new BrowserWindow(options)
    win.on('focus', () => {
        // macOS Shortcut
        console.log('Window focus')
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
        console.log('Window blur')
        if (process.platform === 'darwin') {
            globalShortcut.unregisterAll()
        }
    })
    win.on('close', () => {
        console.log('Window close')
        if (process.platform === 'darwin') {
            globalShortcut.unregisterAll()
        }
    })
    return win
}
