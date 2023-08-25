import { ipcMain } from 'electron'
import { app } from 'electron'
import { getConfig, saveConfigFile } from '../utils/configManager'
import version from '../utils/version'

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
    getConfig().lockPassword = password
    saveConfigFile()
})
