import { BrowserWindow } from 'electron'

export function newIcalinguaWindow(options?: Electron.BrowserWindowConstructorOptions): BrowserWindow {
    const win = new BrowserWindow(options)
    return win
}
