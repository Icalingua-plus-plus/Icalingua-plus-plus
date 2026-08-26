import * as windowMgr from './windowManager'
import * as menuMgr from '../ipc/menuManager'
import { ipcMain, nativeTheme } from 'electron'
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

export function refreshTheme() {
    windowMgr.sendToMainWindow('theme:refresh')
    windowMgr.sendToAllChatWindows('theme:refresh')
    windowMgr.sendToSettingsWindow('theme:refresh')
}

export function useTheme(theme: string) {
    syncNativeThemeSource()
    windowMgr.sendToMainWindow('theme:use', theme)
    windowMgr.sendToAllChatWindows('theme:use', theme)
    windowMgr.sendToSettingsWindow('theme:use', theme)
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
