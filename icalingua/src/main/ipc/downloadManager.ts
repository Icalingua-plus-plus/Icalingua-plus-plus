// allow: SIZE_OK - 下载状态、完成路径与 IPC 必须共享同一 DownloadItem 生命周期
import Aria2Config from '@icalingua/types/Aria2Config'
import Message from '@icalingua/types/Message'
import Room from '@icalingua/types/Room'
import { BrowserWindow, DownloadItem, app, dialog, ipcMain, shell } from 'electron'
import edl from 'electron-dl'
import path from 'path'
import { getConfig, saveConfigFile } from '../utils/configManager'
import ui from '../utils/ui'
import { getMainWindow } from '../utils/windowManager'
import { getGroupFileMeta, getPrivateFileUrl } from './botAndStorage'
import fs from 'fs'
import crypto from 'crypto'
import ChildProcess from 'child_process'
import errorHandler from '../utils/errorHandler'
import axios from 'axios'
import { fileTypeFromStream } from 'file-type'
import { Readable } from 'stream'
import fetch from 'node-fetch'
import { Agent } from 'https'

class Aria2RpcClient {
    private readonly agent?: Agent
    private id = 0

    constructor(private readonly config: Aria2Config) {
        // This agent is used only by aria2 RPC requests and does not alter global TLS verification.
        if (config.secure && config.allowSelfSigned) {
            this.agent = new Agent({ rejectUnauthorized: false })
        }
    }

    private get url() {
        const protocol = this.config.secure ? 'https' : 'http'
        return `${protocol}://${this.config.host}:${this.config.port}${this.config.path}`
    }

    async open() {
        await this.call('aria2.getVersion')
    }

    async call(method: string, ...parameters: unknown[]) {
        const params = this.config.secret ? [`token:${this.config.secret}`, ...parameters] : parameters
        const response = await fetch(this.url, {
            method: 'POST',
            body: JSON.stringify({ method, jsonrpc: '2.0', id: this.id++, params }),
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            agent: this.agent,
        })
        if (!response.ok) throw new Error(`Aria2 RPC HTTP ${response.status}`)

        const result = await response.json()
        if (result.error) throw new Error(result.error.message || 'Aria2 RPC error')
        return result.result
    }
}

let aria2: Aria2RpcClient | null = null

export const loadConfig = (config: Aria2Config) => {
    const { enabled } = config
    if (enabled) {
        aria2 = new Aria2RpcClient(config)
        aria2
            .open()
            .then(() => {
                ui.messageSuccess('Aria2 RPC 已连接')
                console.log('Aria2 RPC 已连接')
            })
            .catch((err) => {
                ui.messageError('连接 Aria2 RPC 失败')
                console.error('连接 Aria2 RPC 失败')
                errorHandler(err, true)
            })
    } else aria2 = null
}

const downloads = new Map<string, DownloadItem>()

export const getDefaultDownloadPath = () => getConfig().downloadPath || app.getPath('downloads')

const resolveDownloadDirectory = (dir?: string) => {
    const defaultDownloadPath = getDefaultDownloadPath()
    if (!dir || path.isAbsolute(dir)) return dir || defaultDownloadPath

    const resolved = path.resolve(defaultDownloadPath, dir)
    const relative = path.relative(defaultDownloadPath, resolved)
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error('下载目录不能超出默认下载目录')
    }
    return resolved
}

export const ensureDownloadDirectory = (dir?: string) => {
    const resolved = resolveDownloadDirectory(dir)
    fs.mkdirSync(resolved, { recursive: true })
    return resolved
}

const formatFileSize = (size: number) => {
    if (size < 1024) return size + 'B'
    else if (size < 1024 * 1024) return (size / 1024).toFixed(2) + 'KB'
    else if (size < 1024 * 1024 * 1024) return (size / 1024 / 1024).toFixed(2) + 'MB'
    else if (size < 1024 * 1024 * 1024 * 1024) return (size / 1024 / 1024 / 1024).toFixed(2) + 'GB'
    else return (size / 1024 / 1024 / 1024 / 1024).toFixed(2) + 'TB'
}

const registerDownload = (item: DownloadItem, url: string, fileName: string) => {
    const size = item.getTotalBytes()
    const uiProgress = ui.notifyProgress(url, `正在下载 ${fileName} (${formatFileSize(size)})`)
    downloads.set(url, item)

    item.on('updated', () => {
        uiProgress.value((item.getReceivedBytes() / size) * 100)
    })

    item.on('done', (_, state) => {
        downloads.delete(url)
        uiProgress.close()

        switch (state) {
            case 'cancelled':
                ui.messageError(`下载已取消 ${fileName}`)
                break
            case 'interrupted':
                ui.messageError(`下载中止 ${fileName}`)
                break
            case 'completed':
                ui.notifyDownloadComplete(fileName, item.getSavePath())
                break
        }
    })
}

export const download = async (url: string, out: string, dir?: string, saveAs = false) => {
    url = new URL(url).href
    dir = resolveDownloadDirectory(dir)
    if (saveAs) {
        const result = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow() || getMainWindow(), {
            defaultPath: path.join(dir, out),
        })
        if (result.canceled) return
        out = path.basename(result.filePath)
        dir = path.dirname(result.filePath)
    }
    fs.mkdirSync(dir, { recursive: true })
    const ext = path.extname(out)
    const base = path.basename(out, ext)
    let i = 1
    while (!saveAs && fs.existsSync(path.join(dir, out))) {
        out = base + ' (' + i + ')' + ext
        i++
    }
    if (aria2) {
        try {
            await aria2.call('aria2.addUri', [url], { out, dir })
            if (!getConfig().aria2.slient) {
                ui.messageSuccess(`已创建 Aria2 下载任务 ${out}`)
            }
            return
        } catch (err) {
            ui.messageError('创建 Aria2 下载任务失败')
            console.error('创建 Aria2 下载任务失败')
            errorHandler(err, true)
            // Aria2 出错时回退到默认下载器
        }
    }
    if (!downloads.has(url)) {
        await edl.download(getMainWindow(), url, {
            directory: dir,
            filename: out,
            onStarted(item) {
                // 修复 electron-dl 多文件同时下载时错误发送事件的问题
                if (item.getURL() === url) {
                    registerDownload(item, url, out)
                }
            },
        })
    }
}

loadConfig(getConfig().aria2)

const extFromMime = (mime: string) => {
    mime = mime.split(';', 1)[0].trim().toLowerCase()

    switch (mime) {
        case 'image/jpeg':
            return 'jpg'
        case 'image/tiff':
            return 'tif'
        case 'image/x-icon':
            return 'ico'
        case 'image/svg+xml':
            return 'svg'
        case 'image/apng':
            // APNG 向下兼容 PNG，因此使用 .png 拓展名
            return 'png'
        case 'image/heif-sequence':
            return 'heifs'
        case 'image/heic-sequence':
            return 'heics'
        case 'image/png':
        case 'image/gif':
        case 'image/webp':
        case 'image/bmp':
        case 'image/heif':
        case 'image/heic':
        case 'image/jxl':
        case 'image/avif':
            return mime.split('/')[1]
        default:
            return null
    }
}
export const extFromStream = async (stream: Readable) => {
    const type = await fileTypeFromStream(stream)
    if (!type) {
        return null
    }
    switch (type.mime) {
        case 'image/apng':
            return 'png'
        default:
            return type.ext
    }
}

export const getImageExt = async (url: string) => {
    try {
        const response = await axios.get(url, {
            responseType: 'stream',
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.5249.199 Safari/537.36 ILPP/2',
                // 参见 file-type/core.js 里的 minimumBytes（未导出）
                Range: 'bytes=0-4100',
            },
        })
        const contentType = response.headers['content-type']
        const ext = typeof contentType === 'string' ? extFromMime(contentType) : null
        if (ext) {
            return ext
        }
        // 希望服务器返回了 Content-Type，但如果没有，尝试使用 file-type 库
        const ext2 = await extFromStream(response.data)
        if (ext2) {
            return ext2
        }
    } catch (err) {
        console.error(`检测图片类型失败: ${url}`)
        errorHandler(err, true)
    }
    return 'jpg'
}

/**
 * 其实就是个只有 url 的下载方法，用来下图片
 */
export const downloadImage = async (url: string, saveAs = false, basename = '') => {
    if (!basename) {
        basename = 'QQ_Image_' + new Date().getTime()
    }
    const out = basename + '.' + (await getImageExt(url))
    await download(url, out, undefined, saveAs)
}

export const downloadImage2Open = async (url: string) => {
    let md5 = ''
    if (url.startsWith('https://gchat.qpic.cn/gchatpic_new/')) {
        md5 = url.replace('https://gchat.qpic.cn/gchatpic_new/', '').split('/')[1].split('-')[2]
    } else {
        const hash = crypto.createHash('md5')
        hash.update(url)
        md5 = hash.digest('hex')
    }
    const dir = app.getPath('temp')
    const out = 'QQ_Image_' + md5 + '.' + (await getImageExt(url))
    const image = path.join(dir, out)
    if (!fs.existsSync(image)) {
        await edl.download(getMainWindow(), url, {
            directory: dir,
            filename: out,
        })
    }
    ChildProcess.exec(image, (error) => {
        if (error) {
            ui.messageError('本地查看器错误')
            errorHandler(error, true)
        }
    })
}

export const downloadGroupFile = async (gin: number, fid: string, name?: string, saveAs = false) => {
    const meta = await getGroupFileMeta(gin, fid)
    if (meta.url === 'error') {
        ui.notifyError({
            title: '下载失败',
            message: meta.name,
        })
        return
    }
    await download(meta.url, meta.name || name, undefined, saveAs)
}

export const downloadPrivateFileWithoutUrl = async (fid: string, name: string, saveAs = false) => {
    const url = await getPrivateFileUrl(fid)
    await download(url, name, undefined, saveAs)
}

export const downloadFileByMessageData = async (
    data: { action: string; message: Message; room: Room },
    saveAs = false,
) => {
    if (data.action === 'download') {
        if (data.message.file.type.includes('image')) {
            await downloadImage(data.message.file.url, saveAs)
        } else if (
            data.message.file.url === data.message.file.name &&
            data.message.file.type.toLowerCase().includes('audio/')
        ) {
            let recordPath = ''
            if (getConfig().adapter === 'socketIo') {
                recordPath = getConfig().server + '/records/' + data.message.file.url
            } else {
                recordPath = 'file://' + path.join(app.getPath('userData'), 'records', data.message.file.url)
            }
            await download(recordPath, 'QQ_Record_' + data.message.file.url, undefined, saveAs)
        } else {
            if (data.room.roomId < 0 && data.message.file.fid)
                await downloadGroupFile(-data.room.roomId, data.message.file.fid, data.message.file.name, saveAs)
            else if (data.message.file.url)
                await download(data.message.file.url, data.message.content, undefined, saveAs)
            else await downloadPrivateFileWithoutUrl(data.message.file.fid, data.message.file.name, saveAs)
        }
    }
}

export const saveTextAs = async (text: string, filename: string) => {
    const result = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow() || getMainWindow(), {
        defaultPath: filename,
    })
    if (result.canceled) return
    const f = await fs.promises.open(result.filePath, 'w')
    await f.write(text)
}

ipcMain.on('download', (_, url, out, dir, saveAs) => download(url, out, dir, saveAs))
ipcMain.on('createDownloadDirectory', (_, dir: string) => {
    try {
        ensureDownloadDirectory(dir)
    } catch (error) {
        console.error('创建下载目录失败', error)
        errorHandler(error, true)
    }
})
ipcMain.on('downloadFileByMessageData', (_, data: { action: string; message: Message; room: Room }) =>
    downloadFileByMessageData(data),
)
ipcMain.on('downloadImage', (_, url, saveAs = false) => downloadImage(url, saveAs))
ipcMain.on('downloadGroupFile', (_, gin: number, fid: string) => downloadGroupFile(gin, fid))
ipcMain.on('cancelDownload', (_, url: string) => downloads.get(url)?.cancel())
ipcMain.on('openDownloadedFile', async (_, filePath: string) => {
    const error = await shell.openPath(filePath)
    if (error) ui.messageError(`打开文件失败：${error}`)
})
ipcMain.on('setAria2Config', (_, config: Aria2Config) => {
    getConfig().aria2 = config
    loadConfig(config)
    saveConfigFile()
})
ipcMain.on('saveTextAs', (_, text, filename) => saveTextAs(text, filename))
