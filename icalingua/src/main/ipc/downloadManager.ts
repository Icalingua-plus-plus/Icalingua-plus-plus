import Aria2Config from '@icalingua/types/Aria2Config'
import Message from '@icalingua/types/Message'
import Room from '@icalingua/types/Room'
import Aria2 from 'aria2'
import { app, ipcMain } from 'electron'
import edl from 'electron-dl'
import path from 'path'
import { getConfig, saveConfigFile } from '../utils/configManager'
import ui from '../utils/ui'
import { getMainWindow } from '../utils/windowManager'
import { getGroupFileMeta } from './botAndStorage'

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

export const download = (url: string, out: string, dir?: string) => {
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
export const downloadImage = (url: string) => {
    console.log(url)
    const out = 'QQ_Image_' + new Date().getTime() + '.jpg'
    const dir = app.getPath('downloads')
    download(url, out, aria ? null : dir)
    ui.notifySuccess({
        title: 'Image Saved',
        message: aria ? out : path.join(dir, out),
    })
}

export const downloadGroupFile = async (gin: number, fid: string) => {
    try {
        const meta = await getGroupFileMeta(gin, fid)
        download(meta.url, meta.name)
    } catch (e) {
        ui.notifyError(e)
        console.error(e)
    }
}

export const downloadFileByMessageData = (data: { action: string; message: Message; room: Room }) => {
    if (data.action === 'download') {
        if (data.message.file.type.includes('image')) {
            downloadImage(data.message.file.url)
        } else {
            if (data.room.roomId < 0 && data.message.file.fid)
                downloadGroupFile(-data.room.roomId, data.message.file.fid)
            else download(data.message.file.url, data.message.content)
        }
    }
}

ipcMain.on('download', (_, url, out, dir) => download(url, out, dir))
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
