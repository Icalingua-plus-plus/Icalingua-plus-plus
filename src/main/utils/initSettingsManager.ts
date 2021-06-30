import settings from 'electron-settings'
import {ipcMain} from 'electron'
import LoginForm from '../../types/LoginForm'

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

export default async () => {
    if (!await settings.has('account'))
        await settings.set('account', emptyLoginForm)
    if (!await settings.has('priority'))
        await settings.set('priority', 3)

    ipcMain.handle('getSetting', (_, kp: string | Array<string | number>) => {
        return settings.get(kp)
    })
    ipcMain.handle('setSetting', (_, kp: string | Array<string | number>, value) => {
        return settings.set(kp, value)
    })
}
