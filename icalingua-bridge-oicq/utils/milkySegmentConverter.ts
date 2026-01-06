/**
 * Milky 消息段与 oicq MessageElem 的转换器
 */

import { IncomingSegment, OutgoingSegment } from '@saltify/milky-types'
import type { MessageElem } from 'oicq-icalingua-plus-plus'

/**
 * 将 Milky IncomingSegment 转换为 oicq MessageElem
 * 用于接收消息时复用 processMessage
 */
export function milkyToOicqSegment(segment: IncomingSegment): MessageElem {
    switch (segment.type) {
        case 'text':
            return {
                type: 'text',
                data: { text: segment.data.text },
            }

        case 'mention':
            return {
                type: 'at',
                data: { qq: Number(segment.data.user_id) },
            }

        case 'mention_all':
            return {
                type: 'at',
                data: { qq: 'all' },
            }

        case 'face':
            return {
                type: 'face',
                data: { id: Number(segment.data.face_id) },
            }

        case 'reply':
            // reply 需要特殊处理，因为 milky 用的是 message_seq
            // 这里先返回一个占位，实际的 id 需要在 adapter 层构造
            return {
                type: 'reply',
                data: {
                    id: String(segment.data.message_seq), // 临时用 seq，后续需要转换
                },
            }

        case 'image':
            return {
                type: 'image',
                data: {
                    file: segment.data.resource_id,
                    url: segment.data.temp_url,
                },
            } as MessageElem

        case 'record':
            return {
                type: 'record',
                data: {
                    file: segment.data.resource_id,
                    url: segment.data.temp_url,
                },
            }

        case 'video':
            return {
                type: 'video',
                data: {
                    file: segment.data.resource_id,
                    url: segment.data.temp_url,
                },
            }

        case 'file':
            // 私聊文件需要 file_hash，序列化到 fid 中: file_id|file_hash
            const fileId = segment.data.file_id
            const fileHash = segment.data.file_hash
            const fid = fileHash ? `${fileId}|${fileHash}` : fileId
            return {
                type: 'file',
                data: {
                    name: segment.data.file_name,
                    fid: fid,
                    file_id: fileId,
                    size: Number(segment.data.file_size),
                    url: '',
                    md5: '',
                    duration: 0,
                    busid: 0,
                    fileid: fileId,
                },
            } as MessageElem

        case 'forward':
            return {
                type: 'json',
                data: {
                    data: JSON.stringify({
                        app: 'com.tencent.multimsg',
                        meta: {
                            detail: {
                                resid: segment.data.forward_id,
                            },
                        },
                        prompt: '[聊天记录]',
                    }),
                },
            }

        case 'market_face':
            return {
                type: 'image',
                data: {
                    file: segment.data.url,
                    url: segment.data.url,
                },
            }

        case 'light_app':
            return {
                type: 'json',
                data: {
                    data: segment.data.json_payload,
                },
            }

        case 'xml':
            return {
                type: 'xml',
                data: {
                    data: segment.data.xml_payload,
                    type: segment.data.service_id,
                },
            }

        default:
            console.log('[milkySegmentConverter] 未知消息段类型:', segment)
            return {
                type: 'text',
                data: { text: '[未知消息类型]' },
            }
    }
}

/**
 * 将 oicq MessageElem 转换为 Milky OutgoingSegment
 * 用于发送消息
 */
export function oicqToMilkySegment(elem: MessageElem): OutgoingSegment | null {
    switch (elem.type) {
        case 'text':
            return {
                type: 'text',
                data: { text: elem.data.text },
            }

        case 'at':
            if (elem.data.qq === 'all') {
                return {
                    type: 'mention_all',
                    data: {},
                }
            }
            return {
                type: 'mention',
                data: { user_id: Number(elem.data.qq) },
            }

        case 'face':
            return {
                type: 'face',
                data: { face_id: String(elem.data.id) },
            }

        case 'reply':
            return {
                type: 'reply',
                data: { message_seq: Number(elem.data.id) },
            }

        case 'image':
        case 'flash': {
            const imgFile = elem.data.file
            let imgUri: string
            if (typeof imgFile === 'string') {
                if (
                    imgFile.startsWith('base64://') ||
                    imgFile.startsWith('http://') ||
                    imgFile.startsWith('https://') ||
                    imgFile.startsWith('file://')
                ) {
                    imgUri = imgFile
                } else {
                    imgUri = `file://${imgFile}`
                }
            } else if (imgFile instanceof Uint8Array) {
                imgUri = `base64://${Buffer.from(imgFile).toString('base64')}`
            } else if (imgFile instanceof ArrayBuffer) {
                imgUri = `base64://${Buffer.from(new Uint8Array(imgFile)).toString('base64')}`
            } else {
                imgUri = String(imgFile)
            }
            return {
                type: 'image',
                data: {
                    uri: imgUri,
                    sub_type: 'normal',
                },
            }
        }

        case 'record': {
            const recFile = elem.data.file
            let recUri: string
            if (typeof recFile === 'string') {
                if (
                    recFile.startsWith('base64://') ||
                    recFile.startsWith('http://') ||
                    recFile.startsWith('https://') ||
                    recFile.startsWith('file://')
                ) {
                    recUri = recFile
                } else {
                    recUri = `file://${recFile}`
                }
            } else if (recFile instanceof Uint8Array) {
                recUri = `base64://${Buffer.from(recFile).toString('base64')}`
            } else if (recFile instanceof ArrayBuffer) {
                recUri = `base64://${Buffer.from(new Uint8Array(recFile)).toString('base64')}`
            } else {
                recUri = String(recFile)
            }
            return {
                type: 'record',
                data: { uri: recUri },
            }
        }

        case 'video':
            return {
                type: 'video',
                data: {
                    uri: elem.data.file.startsWith('file://') ? elem.data.file : `file://${elem.data.file}`,
                },
            }

        // 以下类型 milky 不支持或需要特殊处理
        case 'json':
        case 'xml':
        case 'share':
        case 'location':
        case 'music':
        case 'poke':
        case 'shake':
        case 'anonymous':
            return null

        default:
            return null
    }
}

/**
 * 批量转换 Milky 消息段到 oicq 格式
 */
export function milkySegmentsToOicq(segments: IncomingSegment[]): MessageElem[] {
    return segments.map(milkyToOicqSegment)
}

/**
 * 批量转换 oicq 消息元素到 Milky 格式
 */
export function oicqSegmentsToMilky(elems: MessageElem[]): OutgoingSegment[] {
    return elems.map(oicqToMilkySegment).filter((s): s is OutgoingSegment => s !== null)
}
