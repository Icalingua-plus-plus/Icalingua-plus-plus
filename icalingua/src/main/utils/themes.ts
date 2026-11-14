import * as windowMgr from './windowManager'
import * as menuMgr from '../ipc/menuManager'
import { BrowserWindow, ipcMain, nativeTheme } from 'electron'
import getWinUrl from '../../utils/getWinUrl'
import * as configMgr from './configManager'

var themeList = ['light', 'dark']
var themeData: any = {}

function syncNativeThemeSource() {
    const theme = configMgr.getConfig().theme
    nativeTheme.themeSource = theme === 'auto' ? 'system' : theme === 'dark' ? 'dark' : 'light'
}

// BrowserWindow may paint once using Electron's native color scheme before its backgroundColor takes effect.
// Set it during main-process startup so the native first frame matches the configured application theme.
syncNativeThemeSource()

export function getThemeData() {
    return themeData
}

export function getThemeList() {
    return themeList
}

export function getThemeBackgroundColor() {
    const theme = configMgr.getConfig().theme
    const isDark = theme === 'auto' ? nativeTheme.shouldUseDarkColors : theme === 'dark'
    return isDark ? '#131415' : '#FFFFFF'
}

/** 向应用自己的页面广播主题，覆盖辅助窗口并排除 QQ 网页等外部内容。 */
function sendThemeToWindows(channel: string, theme?: string) {
    const appUrl = new URL(getWinUrl()).href.split('#')[0]
    for (const win of BrowserWindow.getAllWindows()) {
        if (win.isDestroyed()) continue
        const url = win.webContents.getURL().split('#')[0]
        if (url === appUrl) win.webContents.send(channel, theme)
    }
}

export function refreshTheme() {
    sendThemeToWindows('theme:refresh')
}

export function useTheme(theme: string) {
    syncNativeThemeSource()
    sendThemeToWindows('theme:use', theme)
}

ipcMain.on('theme:list-complete', (_, list) => {
    themeList = list
    menuMgr.updateAppMenu()
    let theme = configMgr.getConfig().theme
    if (theme != undefined) theme === 'auto' ? autoSetTheme() : useTheme(theme)
})

ipcMain.on('theme:theme-data', (_, data) => {
    themeData = data
})

ipcMain.on('theme:set-complete', (_) => {
    windowMgr.refreshMainWindowColor()
})

export const autoSetTheme = () => {
    useTheme(nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
}

nativeTheme.on('updated', () => {
    if (configMgr.getConfig().theme === 'auto') autoSetTheme()
})
