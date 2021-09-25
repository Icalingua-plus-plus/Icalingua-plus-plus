import {ipcMain} from 'electron'
import {app} from 'electron'
import {getConfig, saveConfigFile} from '../utils/configManager'
import version from '../utils/version'

ipcMain.handle('getVersion', () => version.version)
ipcMain.handle('getAria2Settings', () => getConfig().aria2)
ipcMain.handle('getKeyToSendMessage', () => getConfig().keyToSendMessage)
ipcMain.handle('getStorePath', () => app.getPath('userData'))

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
