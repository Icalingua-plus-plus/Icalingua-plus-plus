/**
 * 将文件列表（来自 Room.vue 的 files[]）转换为 ipc.sendMessage 所需的参数。
 *
 * 处理逻辑：
 *   - 图片 → media[]（含 b64 + url）
 *   - 音频 → media[]（含 b64）+ file（用于 silk 编码）
 *   - 其他文件 → file: {type, size, path}（走文件上传通道）
 */

import type SendMessageParams from '@icalingua/types/SendMessageParams'
import type { ImageAttachment } from '@icalingua/types/SendMessageParams'

export interface FileObj {
    blob?: Blob
    name: string
    size: number
    type: string
    extension?: string
    localUrl?: string
    path?: string
}

export interface ProcessedFiles {
    /** 图片/音频附件列表 */
    media: ImageAttachment[]
    /** 非媒体文件（走文件上传通道），最多一个 */
    file: SendMessageParams['file'] | null
}

const LARGE_FILE_SIZE = 10_485_760

/**
 * 处理文件列表，返回 IPC 发送所需的参数。
 *
 * @param files - 来自 Room.vue 的文件对象数组
 * @param warnLargeFile - 大文件警告回调（可选）
 */
export async function processFiles(files: FileObj[], warnLargeFile?: (msg: string) => void): Promise<ProcessedFiles> {
    const result: ProcessedFiles = { media: [], file: null }
    if (!files || !files.length) return result

    const crypto = require('crypto')

    for (const f of files) {
        if (!f.blob) {
            // 无 blob 的文件（理论上不会出现，防御性处理）
            result.file = { type: f.type, size: f.size, path: f.path }
            continue
        }

        const isImage = f.type.includes('image')
        const isAudio = f.type.startsWith('audio')

        if (isImage) {
            if (f.size >= LARGE_FILE_SIZE && warnLargeFile) {
                warnLargeFile('图片较大，发送可能失败，软件可能卡死')
            }
            const buffer = Buffer.from(await f.blob.arrayBuffer())
            const imgHashStr = crypto.createHash('md5').update(buffer).digest('hex').toUpperCase()
            const b64 = buffer.toString('base64')
            result.media.push({
                b64: `data:${f.type};base64,${b64}`,
                url: `https://gchat.qpic.cn/gchatpic_new/0/0-0-${imgHashStr}/0`,
            })
        } else if (isAudio) {
            if (f.size >= LARGE_FILE_SIZE && warnLargeFile) {
                warnLargeFile('语音较大，发送可能失败，软件可能卡死')
            }
            const buffer = Buffer.from(await f.blob.arrayBuffer())
            result.media.push({ b64: `data:audio;base64,${buffer.toString('base64')}` })
            // 音频也需要 file 字段（用于 silk 编码等后续处理）
            result.file = { type: f.type, size: f.size, path: f.path }
        } else {
            // 普通文件（视频、文档等）→ 走文件上传通道
            result.file = { type: f.type, size: f.size, path: f.path }
        }
    }

    return result
}
