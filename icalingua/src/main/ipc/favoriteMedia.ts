import type Adapter from '@icalingua/types/Adapter'
import type { FavoriteDownload, FavoriteResponse } from '@icalingua/types/Favorites'
import { ipcMain, Session } from 'electron'
import path from 'path'
import { download } from './downloadManager'
import { safeFavoriteUrl } from '../../utils/favoriteImageLink'

function resourceName(file: FavoriteDownload) {
    const name = path.basename((file.name || '').replace(/\\/g, '/'))
    return !name || name === '.' || name === '..' ? 'QQ_Favorite_File' : name
}

/** 资源鉴权凭据由 adapter 获取，UI 只传收藏与文件 ID。 */
async function fileTicket(adapter: Adapter, cid: string, fid?: string): Promise<FavoriteDownload> {
    const response = await adapter.favoritesRequest({ action: 'fileUrl', cid, fid })
    if (response.ok === false) throw new Error(response.error)
    const file = response.data as FavoriteDownload
    if (!file || !safeFavoriteUrl(file.url) || file.cid !== cid || (fid && file.fid !== fid))
        throw new Error('收藏下载资源无效')
    const headers = file.headers || {}
    if (
        Object.keys(headers).some((name) => name !== 'Cookie') ||
        Object.values(headers).some((value) => typeof value !== 'string' || /[\r\n]/.test(value))
    )
        throw new Error('收藏下载鉴权信息无效')
    return file
}

/** 文件复用下载管理器，视频直接将资源地址交给现有播放器。 */
export function registerFavoriteMediaIpc(adapter: Adapter) {
    const videoHeaders = new Map<number, { url: string; cookie?: string }>()
    const sessions = new WeakSet<Session>()
    ipcMain.handle('DownloadFavoriteFile', async (_, cid: string, fid?: string): Promise<FavoriteResponse> => {
        try {
            const file = await fileTicket(adapter, cid, fid)
            const name = resourceName(file) + (file.rename_file ? '.rename' : '')
            const saved = await download(file.url, name, undefined, false, { headers: file.headers })
            return { ok: true, data: { path: saved } }
        } catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : '收藏文件下载失败' }
        }
    })
    ipcMain.handle(
        'GetFavoriteVideoUrl',
        async (event, cid: string, fid?: string): Promise<FavoriteResponse<{ url: string }>> => {
            try {
                const file = await fileTicket(adapter, cid, fid)
                if (file.type !== 5) throw new Error('该收藏不是视频')
                if (file.rename_file) throw new Error(file.risk_tips || '该资源需要重命名下载，无法直接播放')
                const { sender } = event
                if (sender.isDestroyed()) throw new Error('收藏窗口已关闭')
                const id = sender.id
                if (!videoHeaders.has(id)) sender.once('destroyed', () => videoHeaders.delete(id))
                videoHeaders.set(id, { url: file.url, cookie: file.headers?.Cookie })
                if (!sessions.has(sender.session)) {
                    sessions.add(sender.session)
                    // HTML video 无法自行设置请求头；仅匹配该窗口当前视频的原始 URL，保留 Range 等请求头。
                    sender.session.webRequest.onBeforeSendHeaders(
                        { urls: ['http://*/*', 'https://*/*'] },
                        (details, callback) => {
                            const video = videoHeaders.get(details.webContentsId)
                            if (details.resourceType === 'media' && video?.url === details.url && video.cookie) {
                                for (const name of Object.keys(details.requestHeaders))
                                    if (name.toLowerCase() === 'cookie') delete details.requestHeaders[name]
                                details.requestHeaders.Cookie = video.cookie
                            }
                            callback({ requestHeaders: details.requestHeaders })
                        },
                    )
                }
                return { ok: true, data: { url: file.url } }
            } catch (error) {
                return { ok: false, error: error instanceof Error ? error.message : '视频加载失败' }
            }
        },
    )
}
