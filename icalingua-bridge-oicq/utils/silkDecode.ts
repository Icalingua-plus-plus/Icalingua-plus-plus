import axios from 'axios'
import { fork } from 'child_process'
import fs from 'fs'
import path from 'path'

// 获取 silkchild.js 的路径，兼容开发环境和 esbuild 打包后的环境
const getSilkChildPath = (): string => {
    // esbuild 打包后: build/static/silkchild.js
    const bundledPath = path.join(__dirname, 'static/silkchild.js')
    if (fs.existsSync(bundledPath)) {
        return bundledPath
    }
    // 开发环境 (ts-node): utils/../static/silkchild.js
    return path.join(__dirname, '../static/silkchild.js')
}

export default async (url: string) => {
    const res = await axios.get<Buffer>(url, {
        responseType: 'arraybuffer',
    })
    const md5 = require('crypto').createHash('md5').update(res.data).digest('hex')
    const Path = require('path').join(require.main ? require.main.path : process.cwd(), 'data', 'records')
    const filePath = require('path').join(Path, md5 + '.ogg')
    const rawFilePath = require('path').join(Path, md5)
    if (!fs.existsSync(Path)) {
        fs.mkdirSync(Path)
    }
    if (fs.existsSync(filePath)) {
        return md5 + '.ogg'
    }
    if (!fs.existsSync(rawFilePath)) {
        fs.writeFileSync(rawFilePath, res.data)
    }
    try {
        await conventSilk(rawFilePath, filePath)
    } catch (e) {
        if (fs.existsSync(filePath)) {
            return md5 + '.ogg'
        }
        throw e
    }
    return md5 + '.ogg'
}

const conventSilk = (rawFilePath: string, filePath: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        const child = fork(getSilkChildPath())
        child.on('message', (msg: string) => {
            console.log('[silkDecode] Child success:', msg)
            resolve()
        })
        child.on('error', (err) => {
            console.error(err)
            reject(err)
        })
        child.on('exit', (code, signal) => {
            console.log(`[silkDecode] Child process exited with code ${code} and signal ${signal}`)
            if (code !== 0)
                reject(new Error(`[silkDecode] Child process exited with code ${code} and signal ${signal}`))
        })
        child.send({
            rawFilePath,
            filePath,
        })
    })
}
