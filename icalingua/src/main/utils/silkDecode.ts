import axios from 'axios'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import getStaticPath from '../../utils/getStaticPath'
import errorHandler from './errorHandler'
import runSilkChild from './silkChildProcess'

const CONVERSION_RESULT_GRACE_MS = 5000
const CONVERSION_RESULT_POLL_MS = 50

const waitForConvertedFile = async (filePath: string, timeoutMs: number) => {
    if (fs.existsSync(filePath)) return true

    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, CONVERSION_RESULT_POLL_MS))
        if (fs.existsSync(filePath)) return true
    }

    return fs.existsSync(filePath)
}

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
        // 其他转换任务可能已经完成了同一份语音，给它一个短暂的发布窗口。
        if (await waitForConvertedFile(filePath, CONVERSION_RESULT_GRACE_MS)) {
            return md5 + '.ogg'
        }
        errorHandler(e)
        throw e
    }

    if (!(await waitForConvertedFile(filePath, CONVERSION_RESULT_GRACE_MS))) {
        const error = new Error('语音转换完成但未生成 OGG 文件')
        errorHandler(error)
        throw error
    }

    return md5 + '.ogg'
}

const conventSilk = (rawFilePath: string, filePath: string): Promise<void> => {
    return runSilkChild(path.join(getStaticPath(), 'silkchild.js'), {
        rawFilePath,
        filePath,
    })
}
