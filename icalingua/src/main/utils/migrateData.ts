import {app} from 'electron'
import path from 'path'
import fs from 'fs'
import childProcess from 'child_process'

const storageNew = app.getPath('userData')
const storageOld = path.join(storageNew, '../electron-qq')

export default () => {
    fs.copyFileSync(path.join(storageOld, 'config.yaml'), path.join(storageNew, 'config.yaml'))
    childProcess.spawn('mv', [path.join(storageOld, 'stickers'), path.join(storageNew, 'stickers')])
    childProcess.spawn('sh', ['-c', `mv ${path.join(storageOld, 'eqq*.db')} ${storageNew}`])
}
