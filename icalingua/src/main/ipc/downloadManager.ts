import Aria2Config from '@icalingua/types/Aria2Config'
import Message from '@icalingua/types/Message'
import Room from '@icalingua/types/Room'
import Aria2 from 'aria2'
import { BrowserWindow, app, dialog, ipcMain } from 'electron'
import edl from 'electron-dl'
import path from 'path'
import { getConfig, saveConfigFile } from '../utils/configManager'
import ui from '../utils/ui'
import { getMainWindow } from '../utils/windowManager'
import { getGroupFileMeta } from './botAndStorage'
import fs from 'fs'
import crypto from 'crypto'
import ChildProcess from 'child_process'

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
            })
    } else aria = null
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
                console.log(err)
                ui.messageError('Aria2 failed')
            })
    } else {
        edl.download(getMainWindow(), url, {
            directory: dir,
            filename: out,
            onCompleted: () => ui.messageSuccess('下载完成'),
        })
        ui.message('已开始下载')
    }
}

loadConfig(getConfig().aria2)

/**
 * 其实就是个只有 url 的下载方法，用来下图片
 */
export const downloadImage = (url: string, saveAs = false) => {
    console.log(url)
    const out = 'QQ_Image_' + new Date().getTime() + '.jpg'
    const dir = app.getPath('downloads')
    download(url, out, aria ? null : dir, saveAs)
    if (!saveAs)
        ui.notifySuccess({
            title: 'Image Saved',
            message: aria ? out : path.join(dir, out),
        })
}

export const downloadImage2Open = (url: string) => {
    console.log(url)
    let out = '',
        dir = '',
        image = ''
    if (url.startsWith('https://gchat.qpic.cn/gchatpic_new/')) {
        const md5 = url.replace('https://gchat.qpic.cn/gchatpic_new/', '').split('/')[1].split('-')[2]
        out = 'QQ_Image_' + md5 + '.jpg'
        dir = app.getPath('temp')
        image = path.join(dir, out)
    } else {
        const md5 = crypto.createHash('md5')
        md5.update(url)
        out = 'QQ_Image_' + md5.digest('hex') + '.jpg'
        dir = app.getPath('temp')
        image = path.join(dir, out)
    }
    if (fs.existsSync(image)) {
        ChildProcess.exec(image, (error) => {
            if (error) {
                ui.messageError('本地查看器错误')
                console.log(`exec error: ${error}`)
            }
        })
        return
    }
    edl.download(getMainWindow(), url, {
        directory: dir,
        filename: out,
        onCompleted: () => {
            ChildProcess.exec(image, (error) => {
                if (error) {
                    ui.messageError('本地查看器错误')
                    console.log(`exec error: ${error}`)
                }
            })
        },
    })
}

export const downloadGroupFile = async (gin: number, fid: string, saveAs = false) => {
    try {
        const meta = await getGroupFileMeta(gin, fid)
        download(meta.url, meta.name, undefined, saveAs)
    } catch (e) {
        ui.notifyError(e)
        console.error(e)
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
ipcMain.on('downloadImage', (_, url) => downloadImage(url))
ipcMain.on('downloadGroupFile', (_, gin: number, fid: string) => downloadGroupFile(gin, fid))
ipcMain.on('setAria2Config', (_, config: Aria2Config) => {
    getConfig().aria2 = config
    loadConfig(config)
    saveConfigFile()
})
