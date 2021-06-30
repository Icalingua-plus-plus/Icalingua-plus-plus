import settings from 'electron-settings'
import {ipcMain} from 'electron'
import LoginForm from '../../types/LoginForm'
import Aria2Config from '../../types/Aria2Config'

const emptyLoginForm: LoginForm = {
    mdbConnStr: 'mongodb://localhost',
    rdsHost: '127.0.0.1',
    storageType: 'mdb',
    username: '',
    password: '',
    protocol: 5,
    autologin: false,
    onlineStatus: 11,
}

const defaultAria2Config: Aria2Config = {
    enabled: false,
    host: '127.0.0.1',
    port: 6800,
    secure: false,
    secret: '',
    path: '/jsonrpc',
}

export default async () => {
    if (!await settings.has('account'))
        await settings.set('account', emptyLoginForm)
    if (!await settings.has('priority'))
        await settings.set('priority', 3)
    if (!await settings.has('aria2'))
        await settings.set('aria2', defaultAria2Config)
    if (!await settings.has('ignoredChats'))
        await settings.set('ignoredChats', [])

    ipcMain.handle('getSetting', (_, kp: string | Array<string | number>) => {
        return settings.get(kp)
    })
    ipcMain.handle('setSetting', (_, kp: string | Array<string | number>, value) => {
        return settings.set(kp, value)
    })
}
