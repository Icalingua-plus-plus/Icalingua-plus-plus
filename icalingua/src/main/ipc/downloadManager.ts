import Aria2Config from '@icalingua/types/Aria2Config'
import Message from '@icalingua/types/Message'
import Room from '@icalingua/types/Room'
import Aria2 from 'aria2'
import { BrowserWindow, DownloadItem, app, dialog, ipcMain, net } from 'electron'
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

let aria: Aria2

export const loadConfig = (config: Aria2Config) => {
    if (config.enabled) {
        aria = new Aria2(config)
        aria.open()
            .then(() => {
                ui.messageSuccess('Aria2 RPC connected')
                console.log('Aria2 RPC connected')
            })
            .catch((err) => {
                ui.messageError('Aria2 failed')
                console.log('Aria2 failed', err)
                errorHandler(err, true)
            })
    } else aria = null
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

export const download = (url: string, out: string, dir?: string, saveAs = false) => {
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
    if (aria) {
        aria.call('aria2.addUri', [url], { out, dir })
            .then(() => ui.messageSuccess('Pushed to Aria2 JSON RPC'))
            .catch((err) => {
                errorHandler(err, true)
                ui.messageError('Aria2 failed')
            })
    } else if (!downloads.has(url)) {
        edl.download(getMainWindow(), url, {
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

const mime2Ext = (mime: string) => {
    switch (mime) {
        case 'image/jpeg':
            return 'jpg'
        case 'image/tiff':
            return 'tif'
        case 'image/x-icon':
            return 'ico'
        case 'image/svg+xml':
            return 'svg'
        case 'image/png':
        case 'image/gif':
        case 'image/webp':
        case 'image/bmp':
        case 'image/avif':
        case 'image/apng':
            return mime.split('/')[1]
        default:
            return 'jpg'
    }
}

const getImageExt = async (url: string) => {
    let responsePromise = new Promise<Electron.IncomingMessage>((resolve, reject) => {
        let request = net.request({
            url: url,
            method: 'GET',
            host: 'gchat.qpic.cn',
        })
        // 此处headers从edge抓包
        request.setHeader(
            'User-Agent',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36 Edg/114.0.1823.67',
        )
        request.setHeader('Range', 'bytes=0-5')
        request.setHeader(
            'Accept',
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        )
        request.setHeader('Accept-Encoding', 'gzip, deflate, br')
        request.setHeader('Cache-Control', 'max-age=0')
        request.setHeader('Accept-Language', 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6')
        request.setHeader('Sec-Fetch-Dest', 'document')
        request.setHeader('Sec-Fetch-Mode', 'navigate')
        request.setHeader('Sec-Fetch-Site', 'none')
        request.setHeader('Sec-Fetch-User', '?1')
        request.setHeader('sec-ch-ua', '"Not.A/Brand";v="8", "Chromium";v="114", "Microsoft Edge";v="114"')
        request.setHeader('sec-ch-ua-mobile', '?0')
        request.setHeader('sec-ch-ua-platform', '"Windows"')
        request.setHeader('sec-gpc', '1')
        request.setHeader('dnt', '1')
        request.setHeader('Upgrade-Insecure-Requests', '1')
        request.on('error', (err) => {
            reject(err)
        })
        request.on('response', (response) => {
            response.on('end', () => {
                resolve(response)
            })
            // 必须设置handler，否则end不会触发
            response.on('data', (_) => {})
            response.on('error', (err) => {
                reject(err)
            })
        })
        request.end()
    })
    try {
        let response = await responsePromise
        return mime2Ext(response.headers['content-type'] as string)
    } catch (e: any) {
        // 如果出错则使用使用jpg
        const err = e as Error
        ui.notifyError({
            title: 'Failed to get image extension',
            message: err.message,
        })
        return 'jpg'
    }
}

/**
 * 其实就是个只有 url 的下载方法，用来下图片
 */
export const downloadImage = async (url: string, saveAs = false) => {
    const out = 'QQ_Image_' + new Date().getTime() + '.' + (await getImageExt(url))
    const dir = app.getPath('downloads')
    download(url, out, aria ? null : dir, saveAs)
    if (!saveAs)
        ui.notifySuccess({
            title: 'Image Saved',
            message: aria ? out : path.join(dir, out),
        })
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
    try {
        const meta = await getGroupFileMeta(gin, fid)
        if (meta.url === 'error') {
            ui.notifyError({
                title: '下载失败',
                message: meta.name,
            })
            return
        }
        download(meta.url, meta.name, undefined, saveAs)
    } catch (e) {
        ui.notifyError(e)
        errorHandler(e, true)
    }
}

export const downloadFileByMessageData = (data: { action: string; message: Message; room: Room }, saveAs = false) => {
    if (data.action === 'download') {
        if (data.message.file.type.includes('image')) {
            downloadImage(data.message.file.url, saveAs)
        } else if (data.message.file.type.toLowerCase().includes('audio/')) {
            const file = data.message.file
            if (file.url === file.name) {
                let recordPath = ''
                if (getConfig().adapter === 'socketIo') {
                    recordPath = getConfig().server + '/records/' + file.url
                } else {
                    recordPath = path.join(app.getPath('userData'), 'records', file.url)
                }
                download(recordPath, 'QQ_Record_' + file.url, undefined, saveAs)
            } else {
                download(file.url, 'QQ_Record_' + new Date().getTime() + '.ogg', undefined, saveAs)
            }
        } else {
            if (data.room.roomId < 0 && data.message.file.fid)
                downloadGroupFile(-data.room.roomId, data.message.file.fid, saveAs)
            else download(data.message.file.url, data.message.content, undefined, saveAs)
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
