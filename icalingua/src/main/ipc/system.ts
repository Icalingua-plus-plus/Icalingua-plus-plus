import { ipcMain, BrowserWindow } from 'electron'
import { app } from 'electron'
import { getConfig, saveConfigFile } from '../utils/configManager'
import version from '../utils/version'
import crypto from 'crypto'

ipcMain.handle('getVersion', () => version.version)
ipcMain.handle('getSettings', () => getConfig())
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
    const iterations = 100000
    const keyLength = 64
    const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, keyLength, 'sha512')
    getConfig().lockPassword = derivedKey.toString('hex') + '|' + salt + '|' + iterations
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
