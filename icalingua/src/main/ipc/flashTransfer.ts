import { BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import type {
    FlashTransferDownload,
    FlashTransferEntry,
    FlashTransferRequest,
    FlashTransferResponse,
} from '@icalingua/types/FlashTransfer'
import type Adapter from '@icalingua/types/Adapter'
import { flashTransferPath } from '../utils/flashTransfer'
import { download } from './downloadManager'
import { showFlashTransferDetailWindow, showFlashTransferWindow } from '../utils/windowManager'

async function collectFlashTransferFiles(sources: string[]): Promise<FlashTransferEntry[]> {
    if (
        !Array.isArray(sources) ||
        !sources.length ||
        sources.some((source) => typeof source !== 'string' || !path.isAbsolute(source))
    )
        throw new Error('文件路径无效')
    const entries: FlashTransferEntry[] = []
    const collect = async (source: string, relative: string) => {
        if (entries.length >= 10000) throw new Error('一次最多添加 10000 个文件及目录项目')
        const stat = await fs.promises.lstat(source)
        if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()))
            throw new Error('不支持符号链接或特殊文件：' + relative)
        const normalized = flashTransferPath(relative)
        entries.push({
            source_path: source,
            relative_path: normalized,
            is_dir: stat.isDirectory(),
            size: stat.isFile() ? stat.size : 0,
        })
        if (stat.isDirectory()) {
            const names = (await fs.promises.readdir(source)).sort((a, b) => a.localeCompare(b))
            for (const name of names) await collect(path.join(source, name), normalized + '/' + name)
        }
    }
    const roots = new Set<string>()
    for (const source of new Set(sources)) {
        const stat = await fs.promises.lstat(source)
        const name = path.basename(source)
        const extension = stat.isFile() ? path.extname(name) : ''
        const stem = extension ? name.slice(0, -extension.length) : name
        let relative = name,
            count = 2
        while (roots.has(relative.toLowerCase())) relative = stem + ' (' + count++ + ')' + extension
        roots.add(relative.toLowerCase())
        await collect(source, relative)
    }
    return entries
}

/** 文件选择与系统下载留在主进程，协议操作交由当前适配器。 */
export function registerFlashTransferIpc(adapter: Adapter) {
    ipcMain.on('OpenFlashTransfer', () => showFlashTransferWindow())
    ipcMain.on('OpenFlashTransferDetail', (_, input: string) => showFlashTransferDetailWindow(String(input || '')))
    ipcMain.handle('SelectFlashTransferFiles', async (event, directory: boolean) => {
        const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
            title: directory ? '导入完整目录' : '添加文件',
            properties: directory ? ['openDirectory'] : ['openFile', 'multiSelections'],
        })
        if (result.canceled) return []
        return collectFlashTransferFiles(result.filePaths)
    })
    ipcMain.handle('CollectFlashTransferFiles', (_, paths: string[]) => collectFlashTransferFiles(paths))
    ipcMain.handle(
        'FlashTransferRequest',
        async (event, request: FlashTransferRequest): Promise<FlashTransferResponse> => {
            if (typeof adapter?.flashTransferRequest !== 'function')
                return { ok: false, error: '当前适配器不支持 QQ 闪传，请使用已更新的 oicq 或 Bridge' }
            return adapter.flashTransferRequest(request, (percentage) => {
                if (!event.sender.isDestroyed())
                    event.sender.send('FlashTransferUploadProgress', { request_id: request.request_id, percentage })
            })
        },
    )
    ipcMain.handle('CopyFlashTransferText', (_, text: string) => clipboard.writeText(String(text || '')))
    ipcMain.handle('OpenFlashTransferWebsite', (_, input: string) => {
        const url = new URL(input)
        if (url.protocol !== 'https:' || url.hostname !== 'qfile.qq.com') throw new Error('闪传链接无效')
        return shell.openExternal(url.href)
    })
    ipcMain.handle('DownloadFlashTransferFiles', async (event, files: FlashTransferDownload[]) => {
        if (!Array.isArray(files) || !files.length) throw new Error('没有可下载的文件')
        const rows = files.map((file) => {
            const relative = flashTransferPath(file.path)
            const url = new URL(file.url)
            if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('下载地址无效')
            return { relative, url: url.href }
        })
        const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
            title: '选择闪传文件保存目录',
            properties: ['openDirectory', 'createDirectory'],
        })
        if (result.canceled) return { canceled: true, queued: 0, failed: [] }
        const base = path.resolve(result.filePaths[0])
        let queued = 0
        const failed: { path: string; error: string }[] = []
        for (let i = 0; i < rows.length; i += 3) {
            await Promise.all(
                rows.slice(i, i + 3).map(async (row) => {
                    try {
                        const target = path.resolve(base, ...row.relative.split('/'))
                        const relative = path.relative(base, target)
                        if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative))
                            throw new Error('下载路径超出保存目录')
                        await download(row.url, path.basename(target), path.dirname(target))
                        queued++
                    } catch (error) {
                        failed.push({
                            path: row.relative,
                            error: error instanceof Error ? error.message : String(error),
                        })
                    }
                }),
            )
        }
        return { canceled: false, queued, failed }
    })
}
