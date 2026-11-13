import type {
    FlashTransferDownload,
    FlashTransferEntry,
    FlashTransferFile,
    FlashTransferProtocolClient,
    FlashTransferRequest,
    FlashTransferResponse,
    FlashTransferUploadInput,
} from '@icalingua/types/FlashTransfer'

export function flashTransferPath(value: string): string {
    if (typeof value !== 'string' || !value || value.length > 4096) throw new Error('文件路径无效')
    const parts = value.replace(/\\/g, '/').split('/')
    if (parts.some((part) => !part || part === '.' || part === '..' || /[<>:"|?*\u0000-\u001f]/.test(part)))
        throw new Error('文件名包含不支持的字符或路径')
    return parts.join('/')
}

export function buildFlashTransferFiles(entries: FlashTransferEntry[]): FlashTransferUploadInput[] {
    if (!Array.isArray(entries) || !entries.length || entries.length > 10000) throw new Error('请选择要上传的文件')
    if (!entries.some((entry) => !entry.is_dir)) throw new Error('请至少添加一个文件')
    const files: FlashTransferUploadInput[] = []
    const nodes = new Map<string, FlashTransferUploadInput>()
    const seen = new Set<string>()
    for (const entry of entries) {
        const relative = flashTransferPath(entry.relative_path)
        const key = process.platform === 'win32' ? relative.toLowerCase() : relative
        if (seen.has(key)) throw new Error('目录中存在同名项目：' + relative)
        seen.add(key)
        if (!entry.is_dir && (typeof entry.source_path !== 'string' || !entry.source_path))
            throw new Error('文件来源无效：' + relative)
        const parts = relative.split('/')
        let children = files
        for (let index = 0; index < parts.length; index++) {
            const prefix = parts.slice(0, index + 1).join('/')
            const key = process.platform === 'win32' ? prefix.toLowerCase() : prefix
            const directory = entry.is_dir || index < parts.length - 1
            let node = nodes.get(key)
            if (node) {
                if (!directory || !('children' in node)) throw new Error('文件与目录重名：' + prefix)
            } else {
                node = directory
                    ? { name: parts[index], children: [] }
                    : { file: entry.source_path, name: parts[index] }
                nodes.set(key, node)
                children.push(node)
            }
            if ('children' in node) children = node.children
        }
    }
    return files
}

const transfers = new WeakMap<
    FlashTransferProtocolClient,
    ReturnType<FlashTransferProtocolClient['acquireFlashTransfer']>
>()

/** 闪传文件集操作；下载只返回地址，不传输文件内容。 */
export async function flashTransferRequest(
    client: FlashTransferProtocolClient,
    request: FlashTransferRequest,
    progress?: (percentage: number) => void,
): Promise<FlashTransferResponse> {
    try {
        if (!client || typeof client.acquireFlashTransfer !== 'function')
            throw new Error('当前协议库不支持 QQ 闪传，请更新 oicq 并重新登录')
        if (request?.action === 'capabilities') return { ok: true, data: { available: true, uin: client.uin } }
        let transfer = transfers.get(client)
        if (!transfer) {
            transfer = client.acquireFlashTransfer({ timeout: 120000 })
            transfers.set(client, transfer)
        }
        const fileset = () => {
            if (typeof request.fileset_id !== 'string' || !request.fileset_id.trim()) throw new Error('文件集 ID 无效')
            return request.fileset_id
        }
        let data: unknown
        switch (request?.action) {
            case 'resolve': {
                const input = String(request.input || '').trim()
                if (!input) throw new Error('请输入分享链接、分享码或文件集 ID')
                data = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(input) ? input : await transfer.resolve(input)
                break
            }
            case 'stat':
                data = await transfer.stat(fileset())
                break
            case 'list': {
                const files: FlashTransferFile[] = []
                for await (const file of transfer.files(fileset(), request.parent_id || '')) files.push(file)
                data = files
                break
            }
            case 'upload':
                data = await transfer.upload(
                    buildFlashTransferFiles(request.entries),
                    request.name?.trim() || undefined,
                    (value) => progress?.(Number(value)),
                )
                break
            case 'create':
                data = await transfer.create(request.name, request.options)
                break
            case 'add_files':
                data = await transfer.addFiles(request.task, request.metadata)
                break
            case 'apply_upload':
                data = await transfer.applyUpload(request.task, request.file, request.source)
                break
            case 'complete_file':
                await transfer.completeFile(request.ticket)
                break
            case 'submit':
                await transfer.submit(request.task_id)
                break
            case 'send':
                if (typeof request.group !== 'boolean') throw new Error('请选择好友或群聊')
                if (!request.target || !/^(?:[1-9]\d*|u_[\w-]+)$/.test(String(request.target)))
                    throw new Error('接收方无效')
                data = await transfer.send(fileset(), {
                    type: request.group ? 'group' : 'private',
                    target: /^\d+$/.test(String(request.target)) ? Number(request.target) : request.target,
                })
                break
            case 'urls': {
                const id = fileset()
                const entries: { file: FlashTransferFile; path: string }[] = []
                const ancestors = new Set<string>()
                const collect = async (files: FlashTransferFile[], prefix: string) => {
                    for (const file of files) {
                        const relative = flashTransferPath(prefix ? prefix + '/' + file.name : file.name)
                        if (file.is_dir) {
                            if (!file.cli_fileid || ancestors.has(file.cli_fileid)) throw new Error('目录结构存在循环')
                            ancestors.add(file.cli_fileid)
                            const children: FlashTransferFile[] = []
                            for await (const child of transfer.files(id, file.cli_fileid)) children.push(child)
                            await collect(children, relative)
                            ancestors.delete(file.cli_fileid)
                        } else {
                            if (!file.physical?.id) throw new Error('文件尚未上传完成：' + relative)
                            if (entries.length >= 10000) throw new Error('一次最多获取 10000 个文件的下载地址')
                            entries.push({ file, path: relative })
                        }
                    }
                }
                if (!Array.isArray(request.files) || !request.files.length) throw new Error('请选择文件或目录')
                await collect(request.files, request.prefix || '')
                const urls = entries.length ? await transfer.getDownloadUrls(entries.map((entry) => entry.file)) : []
                data = entries.map((entry, index): FlashTransferDownload => ({
                    path: entry.path,
                    url: urls[index].url,
                    size: Number(entry.file.file_size),
                    sha1: entry.file.sha1,
                }))
                break
            }
            default:
                throw new Error('无效的闪传操作')
        }
        return { ok: true, data }
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error), code: error?.code }
    }
}
