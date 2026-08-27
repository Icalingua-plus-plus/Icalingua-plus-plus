import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'path'
import { getConfig, saveConfigFile } from '../utils/configManager'
import version from '../utils/version'
import md5 from 'md5'
import crypto from 'crypto'
import * as themes from '../utils/themes'
import ui from '../utils/ui'
import getStaticPath from '../../utils/getStaticPath'
import {
    getDatabaseUpgradeProgress,
    getMainWindow,
    setMainWindowTitleBarHidden,
    setZoomFactorForAllWindows,
    showAria2SettingsWindow,
    showIgnoreManageWindow,
    showSetLockPasswordWindow,
    showSettingsWindow,
} from '../utils/windowManager'
import { updateTrayIcon, updateTrayMenu } from '../utils/trayManager'
import { showMakeForwardDebugWindow, updateAppMenu } from './menuManager'
import { getDefaultDownloadPath } from './downloadManager'
import openImage from './openImage'

ipcMain.handle('getVersion', () => version.version)
ipcMain.handle('getBuildInfo', () => ({ version: version.version, isProduction: version.isProduction }))
ipcMain.handle('getDbUpgradeProgress', () => getDatabaseUpgradeProgress())
ipcMain.handle('getSettings', () => getConfig())

const chooseDefaultDownloadPath = (parentWindow?: BrowserWindow | null) => {
    const dialogParent = parentWindow && !parentWindow.isDestroyed() ? parentWindow : getMainWindow()
    const selection = dialog.showOpenDialogSync(dialogParent, {
        title: '设置默认下载目录',
        properties: ['openDirectory'],
        defaultPath: getDefaultDownloadPath(),
    })
    if (!selection || !selection.length) return null

    getConfig().downloadPath = selection[0]
    saveConfigFile()
    updateAppMenu()
    return getDefaultDownloadPath()
}

const resetDefaultDownloadPath = () => {
    if (!getConfig().downloadPath) return

    getConfig().downloadPath = ''
    saveConfigFile()
    updateAppMenu()
    return getDefaultDownloadPath()
}

const SETTINGS_BOOLEAN_KEYS = new Set([
    'disableNotification',
    'disableAtAll',
    'updateCheck',
    'disableQuitShortcut',
    'anonymous',
    'debugmode',
    'sendRawMessage',
    'sendSilkAudio',
    'compressImages',
    'custom',
    'linkify',
    'hideChatImageByDefault',
    'hideChatVideoByDefault',
    'disableQLottie',
    'singleImageMode',
    'disableChatGroups',
    'disableChatGroupsRedPoint',
    'countAtAllInChatGroups',
    'localImageViewerByDefault',
    'useSinglePanel',
    'removeGroupNameEmotes',
    'sortRoomsByPriority',
    'descSortStickersByTime',
    'stickerPanelBottom',
    'disableImgViewTouchPad',
    'usePanguJsRecv',
    'usePanguJsSend',
    'disableChooseFileType',
    'fetchHistoryOnChatOpen',
    'fetchHistoryOnStart',
    'bridgeLocalDatabaseSync',
    'silentFetchHistory',
    'showAppMenu',
])
const SETTINGS_KEYS = new Set([
    ...SETTINGS_BOOLEAN_KEYS,
    'theme',
    'zoomFactor',
    'keyToSendMessage',
    'clearRoomsBehavior',
    'optimizeMethod',
    'priority',
])
const hasSetting = (patch: Record<string, any>, key: string) => Object.prototype.hasOwnProperty.call(patch, key)

ipcMain.handle('updateSettings', async (event, patch: Record<string, any>) => {
    if (!patch || typeof patch !== 'object') return getConfig()

    const config = getConfig()
    const changed = new Set<string>()
    const hideTitleBar = hasSetting(patch, 'hideTitleBar') ? Boolean(patch.hideTitleBar) : undefined
    if (hideTitleBar !== undefined && hideTitleBar !== config.hideTitleBar) {
        await setMainWindowTitleBarHidden(hideTitleBar)
        changed.add('hideTitleBar')
    }

    for (const key of SETTINGS_KEYS) {
        if (!hasSetting(patch, key)) continue
        const value = patch[key]
        if (SETTINGS_BOOLEAN_KEYS.has(key)) {
            if (typeof value !== 'boolean') continue
            ;(config as any)[key] = value
            changed.add(key)
        } else if (key === 'theme') {
            if (typeof value !== 'string' || !value) continue
            config.theme = value
            changed.add(key)
        } else if (key === 'zoomFactor') {
            const factor = Number(value)
            if (!Number.isFinite(factor)) continue
            config.zoomFactor = Math.max(50, Math.min(300, Math.round(factor)))
            changed.add(key)
        } else if (key === 'priority') {
            const priority = Number(value)
            if (!Number.isInteger(priority) || priority < 1 || priority > 5) continue
            config.priority = priority as 1 | 2 | 3 | 4 | 5
            changed.add(key)
        } else if (key === 'keyToSendMessage') {
            if (!['Enter', 'CtrlEnter', 'ShiftEnter'].includes(value)) continue
            config.keyToSendMessage = value
            changed.add(key)
        } else if (key === 'clearRoomsBehavior') {
            if (!['AllUnpined', '1WeekAgo', '1DayAgo', '1HourAgo', 'disabled'].includes(value)) continue
            config.clearRoomsBehavior = value
            changed.add(key)
        } else if (key === 'optimizeMethod') {
            if (!['infinite-loading', 'scroll', 'none'].includes(value)) continue
            config.optimizeMethod = value
            changed.add(key)
        }
    }

    if (patch.account && typeof patch.account === 'object' && typeof patch.account.autologin === 'boolean') {
        config.account.autologin = patch.account.autologin
        changed.add('autologin')
    }

    if (!changed.size) return config

    saveConfigFile()
    if (changed.has('theme')) {
        if (config.theme === 'auto') themes.autoSetTheme()
        else themes.useTheme(config.theme)
    }
    if (changed.has('zoomFactor')) {
        const factor = config.zoomFactor / 100
        setZoomFactorForAllWindows(factor)
        const senderWindow = BrowserWindow.fromWebContents(event.sender)
        if (senderWindow && !senderWindow.isDestroyed()) senderWindow.webContents.setZoomFactor(factor)
    }
    if (changed.has('showAppMenu')) {
        const mainWindow = getMainWindow()
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.setMenuBarVisibility(config.showAppMenu)
            mainWindow.setAutoHideMenuBar(!config.showAppMenu)
        }
    }
    if (changed.has('priority')) ui.updatePriority(config.priority)
    if (changed.has('keyToSendMessage')) ui.setKeyToSendMessage(config.keyToSendMessage)
    if (changed.has('clearRoomsBehavior')) ui.setClearRoomsBehavior(config.clearRoomsBehavior)
    if (changed.has('optimizeMethod')) ui.setOptimizeMethodSetting(config.optimizeMethod)
    if (changed.has('hideChatImageByDefault')) ui.setHideChatImageByDefault(config.hideChatImageByDefault)
    if (changed.has('hideChatVideoByDefault')) ui.setHideChatVideoByDefault(config.hideChatVideoByDefault)
    if (changed.has('disableChatGroups')) ui.setDisableChatGroupsSeeting(config.disableChatGroups)
    if (changed.has('disableChatGroupsRedPoint'))
        ui.setDisableChatGroupsRedPointSeeting(config.disableChatGroupsRedPoint)
    if (changed.has('countAtAllInChatGroups')) ui.setCountAtAllInChatGroups(config.countAtAllInChatGroups)
    if (changed.has('localImageViewerByDefault')) ui.setLocalImageViewerByDefault(config.localImageViewerByDefault)
    if (changed.has('disableQLottie')) ui.setDisableQLottie(config.disableQLottie)
    if (changed.has('useSinglePanel')) ui.useSinglePanel(config.useSinglePanel)
    if (changed.has('removeGroupNameEmotes')) ui.setRemoveGroupNameEmotes(config.removeGroupNameEmotes)
    if (changed.has('usePanguJsRecv')) ui.setUsePanguJsRecv(config.usePanguJsRecv)
    if (changed.has('sortRoomsByPriority')) ui.setSortRoomsByPriority(config.sortRoomsByPriority)
    if (changed.has('stickerPanelBottom')) ui.setStickerPanelBottom(config.stickerPanelBottom)

    await updateAppMenu()
    if (
        changed.has('priority') ||
        changed.has('disableNotification') ||
        changed.has('disableAtAll') ||
        changed.has('sortRoomsByPriority') ||
        changed.has('theme')
    ) {
        await updateTrayMenu()
    }
    if (changed.has('removeGroupNameEmotes')) await updateTrayIcon()
    return config
})

ipcMain.handle('chooseDownloadPath', (event) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender)
    return chooseDefaultDownloadPath(senderWindow) || null
})
ipcMain.handle('resetDownloadPath', () => resetDefaultDownloadPath() || getDefaultDownloadPath())
ipcMain.on('openSettings', showSettingsWindow)
ipcMain.on('openIgnoreManage', showIgnoreManageWindow)
ipcMain.on('openAria2Settings', showAria2SettingsWindow)
ipcMain.on('openSetLockPassword', () => showSetLockPasswordWindow())
ipcMain.on('openMakeForwardDebug', () => {
    void showMakeForwardDebugWindow().catch((error) => console.error('打开合并转发调试窗口失败', error))
})
ipcMain.on('openNotificationHelp', () => openImage(path.join(getStaticPath(), 'notification.webp')))

ipcMain.handle('getKeyToSendMessage', () => getConfig().keyToSendMessage)
ipcMain.handle('getClearRoomsBehavior', () => getConfig().clearRoomsBehavior)
ipcMain.handle('getStorePath', () => app.getPath('userData'))
ipcMain.handle('getRoomPanelSetting', () => {
    const config = getConfig()
    return {
        roomPanelAvatarOnly: config.roomPanelAvatarOnly,
        roomPanelWidth: config.roomPanelWidth,
    }
})
ipcMain.on('setRoomPanelSetting', (_, roomPanelAvatarOnly: boolean, roomPanelWidth: number) => {
    getConfig().roomPanelAvatarOnly = roomPanelAvatarOnly
    getConfig().roomPanelWidth = roomPanelWidth
    saveConfigFile()
})
ipcMain.handle('getMessgeTypeSetting', () => {
    let messageType = 'text'
    if (getConfig().anonymous) messageType = 'anonymous'
    if (getConfig().sendRawMessage) messageType = getConfig().debugmode ? 'raw' : messageType
    return messageType
})

ipcMain.on('setCheckUpdate', (_, enabled: boolean) => {
    getConfig().updateCheck = enabled
    saveConfigFile()
})

//Solution for 4764a6, 4cf06e, 509310
ipcMain.handle('getLastUsedStickerType', () => getConfig().lastUsedStickerType)
ipcMain.on('setLastUsedStickerType', (_, type: 'face' | 'remote' | 'stickers' | 'emojis') => {
    getConfig().lastUsedStickerType = type
    saveConfigFile()
})

ipcMain.on('setLockPassword', (_, password: string) => {
    const salt = crypto.randomBytes(16).toString('hex')
    getConfig().lockPassword = md5(password + salt) + '|' + salt
    saveConfigFile()
})

ipcMain.on('setStickerPanelHeight', (_, height: number) => {
    getConfig().stickerPanelHeight = height
    saveConfigFile()
})

ipcMain.on('resizeChatWindow', (event, deltaWidth: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return
    const [w, h] = win.getSize()
    win.setSize(w + deltaWidth, h)
})
