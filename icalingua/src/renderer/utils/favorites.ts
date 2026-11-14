import { makeFavoriteImageLink, safeFavoriteUrl } from '../../utils/favoriteImageLink'
import formatDate from '../../utils/formatDate'
import formatFileSize from '../../utils/formatFileSize'

import type {
    FavoriteCollection,
    FavoriteDetail,
    FavoriteFile,
    FavoritePicture,
    FavoriteRequest,
} from '@icalingua/types/Favorites'
import ipc from './ipc'

export { safeFavoriteUrl }

export const favoriteTypes = [
    { value: 1, label: '文本', icon: 'el-icon-document' },
    { value: 8, label: '笔记', icon: 'el-icon-edit-outline' },
    { value: 6, label: '链接', icon: 'el-icon-link' },
    { value: 2, label: '图片', icon: 'el-icon-picture-outline' },
    { value: 3, label: '文件', icon: 'el-icon-folder-opened' },
    { value: 4, label: '语音', icon: 'el-icon-microphone' },
    { value: 5, label: '视频', icon: 'el-icon-video-camera' },
    { value: 7, label: '位置', icon: 'el-icon-location-outline' },
]

/** 同步响应中 status=1 为正常收藏；删除等非正常状态不是可展示的收藏。 */
export function isFavoriteVisible(item: FavoriteCollection): boolean {
    return Boolean(item?.cid) && (item.status === undefined || item.status === 1)
}

/** 按顺序应用同步记录：非正常状态需要移除已有记录，而不是生成空白收藏。 */
export function mergeFavoritePage(current: FavoriteCollection[], records: FavoriteCollection[]): FavoriteCollection[] {
    const items = new Map(current.filter(isFavoriteVisible).map((item) => [item.cid, item]))
    for (const item of records) {
        if (!item?.cid) continue
        if (isFavoriteVisible(item)) items.set(item.cid, item)
        else items.delete(item.cid)
    }
    return Array.from(items.values())
}

export function favoritePageSignature(records: FavoriteCollection[]): string {
    return JSON.stringify(records.map((item) => [item.cid, item.status, item.modify_time, item.sequence]))
}

export function favoriteType(type?: number) {
    return (
        favoriteTypes.find((item) => item.value === type) || { value: type, label: '收藏', icon: 'el-icon-collection' }
    )
}

export function favoriteTitle(item: FavoriteCollection): string {
    const summary = item?.summary || {}
    return (
        summary.rich_media_summary?.title ||
        summary.link_summary?.title ||
        summary.file_summary?.file_info?.name ||
        summary.video_summary?.title ||
        summary.location_summary?.name ||
        summary.text_summary?.brief?.split('\n')[0] ||
        summary.gallery_summary?.notes ||
        summary.audio_summary?.note ||
        summary.rich_media_summary?.brief?.split('\n')[0] ||
        `未命名${favoriteType(item?.type).label}`
    )
}

export function favoriteExcerpt(item: FavoriteCollection): string {
    const summary = item?.summary || {}
    return (
        summary.rich_media_summary?.brief ||
        summary.link_summary?.brief ||
        summary.text_summary?.brief ||
        summary.link_summary?.uri ||
        summary.gallery_summary?.notes ||
        summary.audio_summary?.stt ||
        summary.location_summary?.address ||
        summary.file_summary?.file_info?.name ||
        ''
    )
}

export function favoriteTime(value: number | string): string {
    const timestamp = Number(value)
    if (!Number.isFinite(timestamp) || timestamp <= 0) return '时间未知'
    const date = new Date(timestamp < 100000000000 ? timestamp * 1000 : timestamp)
    if (!Number.isFinite(date.getTime())) return '时间未知'
    return formatDate('yyyy-MM-dd hh:mm:ss', date)
}

export function favoriteSize(value: number | string): string {
    const size = Number(value)
    if (!Number.isFinite(size) || size < 0) return '大小未知'
    return formatFileSize(size)
}

/** 统一处理 IPC 返回的失败结果，供管理器与编辑器共用。 */
export async function favoriteRequest<T = unknown>(request: FavoriteRequest): Promise<T> {
    const result = await ipc.favoritesRequest<T>(request)
    if (!result) throw new Error('收藏请求失败，请重试')
    if (result.ok === false) throw new Error(result.error || '收藏请求失败，请重试')
    return result.data
}

export function favoritePictures(detail: FavoriteDetail): FavoritePicture[] {
    const summary = detail?.collection?.summary || {}
    const pictures = [
        ...(summary.gallery_summary?.pic_list || []),
        ...(summary.rich_media_summary?.pic_list || []),
        ...(summary.link_summary?.pic_list || []),
        ...(detail?.content?.rich_media_content?.pic_list || []),
        summary.video_summary?.preview_pic_info,
    ].filter(Boolean)
    const seen = new Set<string>()
    return pictures.filter((picture) => {
        const id = picture.pic_id || picture.uri || JSON.stringify(picture)
        if (seen.has(id)) return false
        seen.add(id)
        return true
    })
}

export function favoriteFiles(detail: FavoriteDetail): FavoriteFile[] {
    const summary = detail?.collection?.summary || {}
    const seen = new Set<string>()
    return [
        summary.file_summary?.file_info,
        summary.video_summary?.store_file_info,
        ...(detail?.content?.rich_media_content?.file_list || []),
    ]
        .filter(Boolean)
        .filter((file) => {
            const id = file.fid || JSON.stringify(file)
            if (seen.has(id)) return false
            seen.add(id)
            return true
        })
}

/**
 * 为无脚本、无同源权限的 iframe 生成收藏预览文档。
 * 只保留排版标签及 HTTP(S) 图片/链接，不将收藏 HTML 注入 Electron 主文档。
 */
export function favoritePreviewDocument(html: string, colors: Record<string, string> = {}): string {
    const color = (value: string, fallback: string) =>
        value && !/[;{}<>]/.test(value) && CSS.supports('color', value) ? value : fallback
    const foreground = color(colors.foreground, 'CanvasText')
    const background = color(colors.background, 'Canvas')
    const accent = color(colors.accent, 'LinkText')
    const border = color(colors.border, foreground)
    const codeBackground = color(colors.codeBackground, background)
    const codeForeground = color(colors.codeForeground, foreground)
    const inlineCodeForeground = color(colors.inlineCodeForeground, foreground)
    const source = new DOMParser().parseFromString(html || '', 'text/html')
    const output = document.implementation.createHTMLDocument('收藏预览')
    const allowed = new Set([
        'P',
        'BR',
        'DIV',
        'SPAN',
        'B',
        'STRONG',
        'I',
        'EM',
        'U',
        'S',
        'DEL',
        'BLOCKQUOTE',
        'PRE',
        'CODE',
        'UL',
        'OL',
        'LI',
        'H1',
        'H2',
        'H3',
        'H4',
        'H5',
        'H6',
        'HR',
        'TABLE',
        'THEAD',
        'TBODY',
        'TR',
        'TD',
        'TH',
        'A',
        'IMG',
    ])
    const blocked = new Set([
        'SCRIPT',
        'STYLE',
        'IFRAME',
        'OBJECT',
        'EMBED',
        'FORM',
        'INPUT',
        'TEXTAREA',
        'BUTTON',
        'SVG',
        'MATH',
        'LINK',
        'META',
        'BASE',
        'TEMPLATE',
    ])
    const copy = (node: Node, target: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            target.appendChild(output.createTextNode(node.textContent || ''))
            return
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return
        const element = node as HTMLElement
        if (blocked.has(element.tagName)) return
        const child = allowed.has(element.tagName) ? output.createElement(element.tagName.toLowerCase()) : null
        if (child && ['A', 'IMG'].includes(element.tagName)) {
            const url = safeFavoriteUrl(element.getAttribute(element.tagName === 'IMG' ? 'src' : 'href') || '')
            if (url) child.setAttribute(element.tagName === 'IMG' ? 'src' : 'href', url)
            if (element.tagName === 'A') {
                child.setAttribute('target', '_blank')
                child.setAttribute('rel', 'noopener noreferrer')
            } else {
                child.setAttribute('alt', element.getAttribute('alt') || '收藏图片')
                child.setAttribute('referrerpolicy', 'no-referrer')
                child.setAttribute('loading', 'lazy')
            }
        }
        Array.from(node.childNodes).forEach((item) => copy(item, child || target))
        if (child) target.appendChild(child)
    }
    Array.from(source.body.childNodes).forEach((node) => copy(node, output.body))
    for (const image of Array.from(output.body.querySelectorAll('img[src]'))) {
        // 图片自身已有外链时，将外链解开，避免嵌套链接或多图共用错误的点击目标。
        const originalLink = image.closest('a')
        if (originalLink) originalLink.replaceWith(...Array.from(originalLink.childNodes))
        const link = output.createElement('a')
        link.className = 'favorite-inline-image'
        link.href = makeFavoriteImageLink(image.getAttribute('src'))
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        link.title = '查看原图'
        image.replaceWith(link)
        link.appendChild(image)
    }
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; img-src https: http:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>
        :root { color-scheme: light dark; } body { margin:0; padding:4px; font:14px/1.8 system-ui,sans-serif; color:${foreground}; background:${background}; overflow-wrap:anywhere; }
        .favorite-inline-image { display:inline-block; max-width:100%; cursor:zoom-in; }
        img { max-width:100%; height:auto; border-radius:6px; } p { margin:0 0 12px; } a { color:${accent}; }
        code { color:${inlineCodeForeground}; background:${codeBackground}; }
        pre { white-space:pre-wrap; padding:12px; color:${codeForeground}; background:${codeBackground}; border-radius:6px; }
        pre code { color:inherit; background:transparent; }
        blockquote { margin:12px 0; padding-left:12px; border-left:3px solid ${border}; } table { width:100%; border-collapse:collapse; } td,th { border:1px solid ${border}; padding:6px; }
        h1,h2,h3 { line-height:1.4; } ul,ol { padding-left:24px; }
        </style></head><body>${output.body.innerHTML}</body></html>`
}
