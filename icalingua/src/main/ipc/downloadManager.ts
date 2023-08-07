import Aria2Config from '@icalingua/types/Aria2Config'
import Message from '@icalingua/types/Message'
import Room from '@icalingua/types/Room'
import Aria2 from 'aria2'
import { BrowserWindow, DownloadItem, app, dialog, ipcMain } from 'electron'
import edl from 'electron-dl'
import path from 'path'
import { getConfig, saveConfigFile } from '../utils/configManager'
import ui from '../utils/ui'
import { getMainWindow } from '../utils/windowManager'
import { getGroupFileMeta } from './botAndStorage'
import fs from 'fs'
import crypto from 'crypto'
import ChildProcess from 'child_process'
import errorHandler from '../utils/errorHandler'
import axios from 'axios'
import fileType from 'file-type'
import { Readable } from 'stream'
import fetch from 'node-fetch'

let aria2: Aria2 | null = null

export const loadConfig = (config: Aria2Config) => {
    const { enabled, slient, ...rest } = config
    if (enabled) {
        aria2 = new Aria2({
            // aria2 在导入 node-fetch 时有问题，手动指定一下
            fetch,
            ...rest,
        })
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
                ui.messageSuccess(`下载完成 ${fileName}`)
                break
        }
    })
}

export const download = async (url: string, out: string, dir?: string, saveAs = false) => {
    if (saveAs) {
        const result = dialog.showSaveDialogSync(BrowserWindow.getFocusedWindow() || getMainWindow(), {
            defaultPath: dir ? path.join(dir, out) : out,
        })
        if (!result) return
        out = path.basename(result)
        dir = path.dirname(result)
    }
    const ext = path.extname(out)
    const base = path.basename(out, ext)
    let i = 1
    while (!saveAs && fs.existsSync(path.join(dir ? dir : app.getPath('downloads'), out))) {
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
const extFromStream = async (stream: Readable) => {
    const type = await fileType.fromStream(stream)
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

const getImageExt = async (url: string) => {
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
        const ext = extFromMime(response.headers['content-type'])
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
    const dir = app.getPath('downloads')
    await download(url, out, aria2 ? null : dir, saveAs)
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

export const downloadGroupFile = async (gin: number, fid: string, saveAs = false) => {
    const meta = await getGroupFileMeta(gin, fid)
    if (meta.url === 'error') {
        ui.notifyError({
            title: '下载失败',
            message: meta.name,
        })
        return
    }
    await download(meta.url, meta.name, undefined, saveAs)
}

export const downloadFileByMessageData = async (
    data: { action: string; message: Message; room: Room },
    saveAs = false,
) => {
    if (data.action === 'download') {
        if (data.message.file.type.includes('image')) {
            await downloadImage(data.message.file.url, saveAs)
        } else if (data.message.file.type.toLowerCase().includes('audio/')) {
            const file = data.message.file
            if (file.url === file.name) {
                let recordPath = ''
                if (getConfig().adapter === 'socketIo') {
                    recordPath = getConfig().server + '/records/' + file.url
                } else {
                    recordPath = path.join(app.getPath('userData'), 'records', file.url)
                }
                await download(recordPath, 'QQ_Record_' + file.url, undefined, saveAs)
            } else {
                await download(file.url, 'QQ_Record_' + new Date().getTime() + '.ogg', undefined, saveAs)
            }
        } else {
            if (data.room.roomId < 0 && data.message.file.fid)
                await downloadGroupFile(-data.room.roomId, data.message.file.fid, saveAs)
            else await download(data.message.file.url, data.message.content, undefined, saveAs)
        }
    }
}

ipcMain.on('download', (_, url, out, dir, saveAs) => download(url, out, dir, saveAs))
ipcMain.on('downloadFileByMessageData', (_, data: { action: string; message: Message; room: Room }) =>
    downloadFileByMessageData(data),
)
ipcMain.on('downloadImage', (_, url, saveAs = false) => downloadImage(url, saveAs))
ipcMain.on('downloadGroupFile', (_, gin: number, fid: string) => downloadGroupFile(gin, fid))
ipcMain.on('cancelDownload', (_, url: string) => downloads.get(url)?.cancel())
ipcMain.on('setAria2Config', (_, config: Aria2Config) => {
    getConfig().aria2 = config
    loadConfig(config)
    saveConfigFile()
})
