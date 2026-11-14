import type { FlashTransferEntry, FlashTransferRecord, FlashTransferRequest } from '@icalingua/types/FlashTransfer'
import ipc from './ipc'

export async function requestFlashTransfer<T = any>(request: FlashTransferRequest): Promise<T> {
    const result = await ipc.flashTransferRequest<T>(request)
    if (!result?.ok) throw new Error((result?.error || '闪传操作失败') + (result?.code ? ` (${result.code})` : ''))
    return result.data
}

export const flashTransferStorageKey = (uin: number) => `icalingua.qq-flash-transfer.v1.${uin}`

export function normalizeFlashTransferRecord(value: any): FlashTransferRecord | null {
    if (!value || typeof value.fileset_id !== 'string' || !value.fileset_id) return null
    return {
        fileset_id: value.fileset_id,
        name: String(value.name || '未命名闪传'),
        share_link:
            typeof value.share_link === 'string' && /^https:\/\/qfile\.qq\.com\//.test(value.share_link)
                ? value.share_link
                : '',
        file_count: Math.max(0, Number(value.file_count) || 0),
        total_size: Math.max(0, Number(value.total_size) || 0),
        expire_time: Math.max(0, Number(value.expire_time) || 0),
        created_at: Math.max(0, Number(value.created_at) || 0),
        saved_at: Math.max(0, Number(value.saved_at) || Date.now()),
        last_shared_at: Math.max(0, Number(value.last_shared_at) || 0),
    }
}

export function loadFlashTransferRecords(uin: number): FlashTransferRecord[] {
    const raw = localStorage.getItem(flashTransferStorageKey(uin))
    if (!raw) return []
    const rows = JSON.parse(raw)
    if (!Array.isArray(rows)) throw new Error('本地闪传记录格式无效')
    return rows.map(normalizeFlashTransferRecord).filter(Boolean)
}

export function saveFlashTransferRecord(uin: number, record: FlashTransferRecord): FlashTransferRecord[] {
    const safe = normalizeFlashTransferRecord(record)
    if (!safe) throw new Error('文件集元数据无效')
    const records = loadFlashTransferRecords(uin).filter((item) => item.fileset_id !== safe.fileset_id)
    records.unshift(safe)
    localStorage.setItem(flashTransferStorageKey(uin), JSON.stringify(records))
    return records
}

export function flashTransferRecord(
    fileset_id: string,
    info: any,
    fallback: Partial<FlashTransferRecord> = {},
): FlashTransferRecord {
    return normalizeFlashTransferRecord({
        ...fallback,
        fileset_id,
        name: info.name || fallback.name,
        share_link: info.share_info?.share_link || info.share_link || fallback.share_link,
        file_count: info.total_file_count ?? fallback.file_count,
        total_size: info.total_file_size ?? fallback.total_size,
        expire_time: info.expired_time || info.expire_time || fallback.expire_time,
        created_at: Number(info.create_time) * 1000 || fallback.created_at || Date.now(),
        saved_at: Date.now(),
    })
}

export function flashTransferName(value: string): string {
    const name = String(value || '').trim()
    if (!name || name === '.' || name === '..' || /[<>:"/\\|?*\u0000-\u001f]/.test(name) || name.length > 200)
        throw new Error('请输入有效的文件或文件夹名称')
    return name
}

export function addFlashTransferEntries(
    current: FlashTransferEntry[],
    incoming: FlashTransferEntry[],
    prefix = '',
): FlashTransferEntry[] {
    const result = current.slice()
    const occupied = new Set(result.map((item) => item.relative_path.toLocaleLowerCase()))
    const roots = new Map<string, string>()
    for (const item of incoming) {
        const parts = item.relative_path.split('/')
        parts.forEach(flashTransferName)
        if (!roots.has(parts[0])) {
            const original = parts[0]
            let name = original,
                count = 2
            const dot = !item.is_dir ? original.lastIndexOf('.') : -1
            const base = dot > 0 ? original.slice(0, dot) : original
            const extension = dot > 0 ? original.slice(dot) : ''
            while (occupied.has(((prefix ? prefix + '/' : '') + name).toLocaleLowerCase()))
                name = `${base} (${count++})${extension}`
            roots.set(original, name)
        }
        parts[0] = roots.get(parts[0])
        const relative_path = (prefix ? prefix + '/' : '') + parts.join('/')
        if (occupied.has(relative_path.toLocaleLowerCase())) throw new Error('目录中存在同名项目')
        result.push({ ...item, relative_path })
        occupied.add(relative_path.toLocaleLowerCase())
    }
    return result
}

export function moveFlashTransferEntries(
    entries: FlashTransferEntry[],
    source: string,
    destination: string,
): FlashTransferEntry[] {
    if (source === destination) return entries
    destination.split('/').forEach(flashTransferName)
    if (destination.startsWith(source + '/')) throw new Error('不能将文件夹移动到自身内部')
    const moved = entries.filter((item) => item.relative_path === source || item.relative_path.startsWith(source + '/'))
    if (!moved.length) throw new Error('项目不存在')
    const others = entries.filter((item) => !moved.includes(item))
    const targets = moved.map((item) => ({
        ...item,
        relative_path: destination + item.relative_path.slice(source.length),
    }))
    const occupied = new Set(others.map((item) => item.relative_path.toLocaleLowerCase()))
    if (targets.some((item) => occupied.has(item.relative_path.toLocaleLowerCase())))
        throw new Error('目标位置已有同名项目')
    return [...others, ...targets]
}

export function flashTransferFolderTree(entries: FlashTransferEntry[]) {
    const root = { path: '', name: '文件集根目录', children: [] }
    const nodes = new Map<string, any>([['', root]])
    for (const entry of entries
        .filter((item) => item.is_dir)
        .sort((a, b) => a.relative_path.localeCompare(b.relative_path))) {
        const parts = entry.relative_path.split('/')
        const name = parts.pop()
        const node = { path: entry.relative_path, name, children: [] }
        nodes.set(entry.relative_path, node)
        nodes.get(parts.join('/'))?.children.push(node)
    }
    return [root]
}

export function flashTransferSize(bytes: number | string): string {
    const value = Number(bytes) || 0
    if (value < 1024) return value + ' B'
    const index = Math.min(3, Math.floor(Math.log(value) / Math.log(1024)))
    return (value / 1024 ** index).toFixed(index > 1 ? 2 : 1) + [' B', ' KB', ' MB', ' GB'][index]
}

export function flashTransferTime(value: number | string): string {
    const time = Number(value)
    return time > 0 ? new Date(time < 1e12 ? time * 1000 : time).toLocaleString() : '—'
}

export function flashTransferExpiry(value: number | string): string {
    const time = Number(value)
    if (!(time > 0)) return '有效期未知'
    const left = (time < 1e12 ? time * 1000 : time) - Date.now()
    if (left <= 0) return '已过期'
    const hours = Math.floor(left / 3600000)
    if (hours >= 24) return Math.floor(hours / 24) + ' 天后到期'
    return hours ? hours + ' 小时后到期' : '即将到期'
}
