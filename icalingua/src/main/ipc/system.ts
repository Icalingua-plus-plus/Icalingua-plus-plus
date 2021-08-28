import {ipcMain} from 'electron'
import {app} from 'electron'
import {getConfig, saveConfigFile} from '../utils/configManager'

ipcMain.handle('getVersion', app.getVersion)
ipcMain.handle('getAccount', () => getConfig().account)
ipcMain.handle('getAria2Settings', () => getConfig().aria2)
ipcMain.handle('getKeyToSendMessage', () => getConfig().keyToSendMessage)
ipcMain.handle('getStorePath', () => app.getPath('userData'))

//Solution for 4764a6, 4cf06e, 509310
ipcMain.handle('getLastUsedStickerType', () => getConfig().lastUsedStickerType)
ipcMain.on('setLastUsedStickerType', (_, type: 'face' | 'remote' | 'stickers' | 'emojis') => {
    getConfig().lastUsedStickerType = type
    saveConfigFile()
})
