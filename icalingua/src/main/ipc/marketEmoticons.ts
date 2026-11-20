import { ipcMain } from 'electron'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import type Adapter from '@icalingua/types/Adapter'
import { getMarketEmoticonPack, searchMarketEmoticons } from '../../utils/marketEmoticons'
import { download } from './downloadManager'
import { getStickerGroups, getStickerGroupDir } from '../utils/stickerGroups'

export function registerMarketEmoticonIpc(adapter: Adapter): void {
    ipcMain.handle('SearchMarketEmoticons', (_, keyword: string, cursor = '') =>
        searchMarketEmoticons(adapter, keyword, cursor),
    )
    ipcMain.handle('GetMarketEmoticonPack', async (_, id: number, type = 3) => {
        try {
            return await getMarketEmoticonPack(id, type)
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) return null
            throw error
        }
    })
    ipcMain.handle('GetStickerGroups', getStickerGroups)
    ipcMain.handle('SaveMarketEmoticonPack', async (_, id: number, type = 3, group = '') => {
        const dir = getStickerGroupDir(group)
        const pack = await getMarketEmoticonPack(id, type)
        await fs.promises.mkdir(dir, { recursive: true })
        const filename = (value: string) => value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '') || '表情'
        let failed = 0
        for (const [index, item] of pack.items.entries()) {
            try {
                await download(
                    item.url,
                    pack.id + '-' + (index + 1) + '-' + filename(item.name) + path.extname(new URL(item.url).pathname),
                    dir,
                )
            } catch {
                failed++
            }
        }
        return { total: pack.items.length, failed }
    })
}
