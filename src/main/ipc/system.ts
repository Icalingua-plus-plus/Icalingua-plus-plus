import {ipcMain} from 'electron'
import {app} from 'electron'

ipcMain.handle('getVersion', app.getVersion)
