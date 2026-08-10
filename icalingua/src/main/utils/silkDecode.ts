import axios from 'axios'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import getStaticPath from '../../utils/getStaticPath'
import errorHandler from './errorHandler'
import runSilkChild from './silkChildProcess'

export default async (url: string) => {
    const res = await axios.get<Buffer>(url, {
        responseType: 'arraybuffer',
        proxy: false,
    })
    const md5 = require('crypto').createHash('md5').update(res.data).digest('hex')
    const Path = require('path').join(app.getPath('userData'), 'records')
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
        errorHandler(e)
        throw e
    }
    return md5 + '.ogg'
}

const conventSilk = (rawFilePath: string, filePath: string): Promise<void> => {
    return runSilkChild(path.join(getStaticPath(), 'silkchild.js'), {
        rawFilePath,
        filePath,
    })
}
