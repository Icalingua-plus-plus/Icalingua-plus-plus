import { fork } from 'child_process'
import fs from 'fs'
import getStaticPath from '../../utils/getStaticPath'

export default async (path: string) => {
    if (fs.existsSync(path + '.slk')) {
        return path + '.slk'
    }
    await encodeSilk(path)
    return path + '.slk'
}

const encodeSilk = (path: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        const child = fork(require('path').join(getStaticPath(), 'silkEncodeChild.js'))
        child.on('message', (msg: string) => {
            console.log('[silkEncode] Child success:', msg)
            resolve()
        })
        child.on('error', (err) => {
            console.error(err)
            reject(err)
        })
        child.on('exit', (code, signal) => {
            console.log(`[silkEncode] Child process exited with code ${code} and signal ${signal}`)
            if (code !== 0)
                reject(new Error(`[silkEncode] Child process exited with code ${code} and signal ${signal}`))
        })
        child.send(path)
    })
}
