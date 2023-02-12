import axios from 'axios'
import { fork } from 'child_process'
import { app } from 'electron'
import fs from 'fs'

export default async (url: string) => {
    const res = await axios.get<Buffer>(url, {
        responseType: 'arraybuffer',
        proxy: false,
    })
    const md5 = require('crypto').createHash('md5').update(res.data).digest('hex')
    const Path = require('path').join(app.getPath('userData'), 'records')
    const filePath = require('path').join(Path, md5 + '.ogg')
    if (fs.existsSync(filePath)) {
        return md5 + '.ogg'
    }
    const bufOgg = await conventSilk(res.data)

    if (!fs.existsSync(Path)) {
        fs.mkdirSync(Path)
    }
    fs.writeFileSync(filePath, bufOgg)
    return md5 + '.ogg'
}

const conventSilk = (silkBuf: Buffer): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
        const childPath = process.env.NODE_ENV === 'development' ? 'static/silkchild.js' : 'dist/electron/static/silkchild.js'
        const child = fork(require('path').join(app.getAppPath(), childPath))
        child.on('message', (bufOggStr: String) => {
            const bufOgg = Buffer.from(bufOggStr, 'binary')
            console.log('bufOgg received from child length:', bufOgg.length)
            resolve(bufOgg)
        })
        child.on('error', (err) => {
            console.error(err)
            reject(err)
        })
        child.on('exit', (code, signal) => {
            console.log(`Child process exited with code ${code} and signal ${signal}`)
            if (code !== 0) reject(new Error(`Child process exited with code ${code} and signal ${signal}`))
        })
        child.send(silkBuf.toString('binary'))
    })
}
