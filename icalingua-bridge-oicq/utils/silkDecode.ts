import axios from 'axios'
import { fork } from 'child_process'

export default async (url: string) => {
    const res = await axios.get<Buffer>(url, {
        responseType: 'arraybuffer',
    })
    const bufOgg = await conventSilk(res.data)
    return 'data:audio/ogg;base64,' + bufOgg.toString('base64')
}

const conventSilk = (silkBuf: Buffer): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
        const child = fork(require('path').join(__dirname, '../static/silkchild.js'))
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
