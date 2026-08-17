import BilibiliMiniApp from '@icalingua/types/BilibiliMiniApp'
import Message from '@icalingua/types/Message'
import StructMessageCard from '@icalingua/types/StructMessageCard'
import { AtElem, FileElem, FriendInfo, GroupMessageEventData, MemberBaseInfo } from 'oicq-icalingua-plus-plus'
import path from 'path'
import type oicqAdapter from '../adapters/oicqAdapter'
import getImageUrlByMd5 from './getImageUrlByMd5'
import mime from './mime'
import silkDecode from './silkDecode'
import formatDate from './formatDate'
import { ImgPttElemPlus, MessageElemPlus } from '../types/MessageElemPlus'
import { formatForwardMessageBodyPrefix, getForwardMessagePrompt } from './forwardMessageMeta'
import sleep from './sleep'

type LastMessageLike = {
    content?: string
    username?: string | null
}

/** 语音异步解码完成后的落库/推送回调，由 adapter 在 storage 初始化后注册 */
type SilkDecodeCompleter = {
    replaceMessage: (roomId: number, messageId: string | number, message: Message) => Promise<any>
    renewMessage: (roomId: number, messageId: string, message: Partial<Message>) => void
    getMessage?: (roomId: number, messageId: string) => Promise<Message | null>
}

const base64decode = (str: string): string => {
    if (typeof str !== 'string') {
        throw new Error('Input value must be a string.')
    }
    return Buffer.from(str, 'base64').toString('utf8')
}

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

let silkDecodeCompleter: SilkDecodeCompleter | null = null

export const registerSilkDecodeCompleter = (completer: SilkDecodeCompleter) => {
    silkDecodeCompleter = completer
}

const AUDIO_DECODING_PLACEHOLDER = '[语音解码中]'
const AUDIO_DECODING_FILE = 'decoding'

const buildAudioFile = (fileName: string, fid?: string) => {
    const file = {
        type: 'audio/ogg',
        url: fileName,
        name: fileName,
    } as Message['file']
    if (fid) file.fid = fid
    return file
}

const clearDecodingPlaceholderContent = (content: string) => {
    if (!content) return ''
    if (content === AUDIO_DECODING_PLACEHOLDER) return ''
    return content.split(AUDIO_DECODING_PLACEHOLDER).join('').replace(/^\n+/, '').replace(/\n+$/, '')
}

const shiftMediaOrders = (message: Message, removedLength: number) => {
    for (const file of message.files || []) {
        if (Number.isInteger(file.order)) file.order = Math.max(0, file.order - removedLength)
    }
}

/**
 * 后台解码 silk，不阻塞消息入库。
 * 等消息写入 DB 后再 replace + renew，避免与 addMessage 竞态。
 */
const scheduleAsyncSilkDecode = (roomId: number, message: Message, url: string, fileIndex: number, fid?: string) => {
    const messageId = message._id
    if (messageId === undefined || messageId === null || messageId === '') return

    setImmediate(async () => {
        const completer = silkDecodeCompleter
        if (!completer) {
            try {
                const fileName = await silkDecode(url)
                const file = buildAudioFile(fileName, fid)
                message.file = file
                message.files[fileIndex] = file
                message.content = clearDecodingPlaceholderContent(message.content)
            } catch (e) {
                console.error(e)
                message.content = '[语音转换失败]' + getErrorMessage(e) + '\n' + url
            }
            return
        }

        try {
            const fileName = await silkDecode(url)
            const file = buildAudioFile(fileName, fid)

            if (completer.getMessage) {
                const deadline = Date.now() + 3000
                while (Date.now() < deadline) {
                    const existing = await completer.getMessage(roomId, String(messageId))
                    if (existing) break
                    await sleep(20)
                }
            } else {
                await sleep(50)
            }

            message.file = file
            if (fileIndex >= 0 && fileIndex < message.files.length) {
                message.files[fileIndex] = file
            } else {
                message.files.push(file)
            }
            message.content = clearDecodingPlaceholderContent(message.content)

            await completer.replaceMessage(roomId, messageId, message)
            completer.renewMessage(roomId, String(messageId), {
                file,
                files: message.files,
                content: message.content,
            })
        } catch (e) {
            console.error(e)
            message.content = '[语音转换失败]' + getErrorMessage(e) + '\n' + url
            try {
                await completer.replaceMessage(roomId, messageId, message)
                completer.renewMessage(roomId, String(messageId), {
                    content: message.content,
                    file: message.file,
                    files: message.files,
                })
            } catch (err) {
                console.error(err)
            }
        }
    })
}

const createProcessMessage = (adapter: typeof oicqAdapter) => {
    const processMessage = async (
        oicqMessage: MessageElemPlus[],
        message: Message,
        lastMessage: LastMessageLike,
        roomId = null,
        isHistory = false,
    ) => {
        try {
            if (!Array.isArray(oicqMessage)) oicqMessage = [oicqMessage]

            lastMessage.content = lastMessage.content ?? '' // 初始化最近信息内容

            let lastType: string | undefined
            let lastReply = false
            let replyAnonymous = false
            let markdown = ''
            let button_rows: Message['button_rows'] = []
            for (let i = 0; i < oicqMessage.length; i++) {
                const m = oicqMessage[i] || { type: 'unknown', data: {} }
                let appurl: string | undefined
                let url: string | undefined
                switch (m.type) {
                    case 'at':
                        if (!isNaN(m.data.qq as number)) {
                            m.data.qq = Number(m.data.qq) >>> 0
                        }
                        if (lastType === 'reply' && !replyAnonymous && message.replyMessage?.senderId === m.data.qq) {
                            lastReply = true
                            break
                        }
                        if (!m.data.text && (m.data.qq == 0 || m.data.qq == 'all')) {
                            m.data.text = '@全体成员'
                        } else if (!m.data.text) {
                            const info = await adapter._getGroupMemberInfo(Math.abs(roomId), m.data.qq as any, false)
                            m.data.text = '@' + (info?.card || info?.nickname || String(m.data.qq))
                        }
                        if (!m.data.text || m.data.text === '@') m.data.text = `@${String(m.data.qq)}`
                    // noinspection FallThroughInSwitchStatementJS 确信
                    case 'text':
                        // PCQQ 发送的消息的换行符是 \r，统一转成 \n
                        let text = m.data.text.split('\r\n').join('\n').split('\r').join('\n')
                        // 去除 \x00 字符，防止 postgreSQL 存储失败
                        text = text.split('\x00').join('')
                        if (lastReply) {
                            lastReply = false
                            text = text.replace(/^ /, '')
                        }
                        lastMessage.content += text
                        if ((m as AtElem).data.qq === 'all' && message.senderId !== 2854196310) {
                            message.at = 'all'
                        } else if ((m as AtElem).data.qq == adapter.getUin()) {
                            message.at = true
                        }
                        if (m.type === 'at') {
                            const atQQ = m.data.qq === 'all' ? 1 : m.data.qq
                            text = `<IcalinguaAt qq=${atQQ}>${encodeURIComponent(text).replace(/\./g, '%2E')}</IcalinguaAt>`
                        }
                        message.content += text
                        break
                    case 'flash':
                        message.flash = true
                    // noinspection FallThroughInSwitchStatementJS 确信
                    case 'image':
                        const data = m.data as ImgPttElemPlus['data']
                        if (data.prompt) {
                            lastMessage.content += data.prompt
                        } else {
                            lastMessage.content += '[Image]'
                        }
                        url = m.data.url || ''
                        if (typeof m.data.file !== 'string' && !url) {
                            const md5 = require('crypto').createHash('md5').update(m.data.file).digest('hex')
                            url = getImageUrlByMd5(md5)
                        }
                        if (typeof m.data.file === 'string' && !url) url = m.data.file
                        if (url && typeof url === 'string' && url.startsWith('base64://')) {
                            const base64 = url.slice(9)
                            const md5 = require('crypto')
                                .createHash('md5')
                                .update(Buffer.from(base64, 'base64'))
                                .digest('hex')
                            url = getImageUrlByMd5(md5)
                        }
                        if (typeof m.data.file === 'string' && url.includes('c2cpicdw.qpic.cn')) {
                            const md5 = m.data.file.slice(0, 32)
                            ;/^([a-f\d]{32}|[A-F\d]{32})$/.test(md5) && (url = getImageUrlByMd5(md5))
                        }
                        message.file = {
                            type: 'image/jpeg',
                            url,
                            order: message.content.length,
                            isFace: m.data.type === 'face',
                            height: data.height,
                            width: data.width,
                        }
                        message.files.push(message.file)
                        break
                    case 'bface':
                        lastMessage.content += '[Sticker]' + m.data.text
                        url = `https://gxh.vip.qq.com/club/item/parcel/item/${m.data.file.slice(
                            0,
                            2,
                        )}/${m.data.file.slice(0, 32)}/raw${m.data.width || m.data.height || 300}.gif`
                        message.file = {
                            type: 'image/webp',
                            url,
                            order: message.content.length,
                            isFace: true,
                        }
                        message.files.push(message.file)
                        break
                    case 'file':
                        lastMessage.content += '[File]' + (m.data.name || (m.data as any).file)
                        message.content += m.data.name || (m.data as any).file
                        url = m.data.url
                        if (!url && !isHistory) {
                            if (roomId < 0) {
                                const meta = await new Promise<FileElem['data']>((resolve) => {
                                    adapter.getGroupFileMeta(-roomId, m.data.fid || (m.data as any).file_id, resolve)
                                })
                                url = meta.url
                            } else {
                                url = await new Promise<string>((resolve) => {
                                    // 貌似会和 downloadPrivateFileWithoutUrl 冲突，downloadPrivateFileWithoutUrl 写了等于没写
                                    // 不知道 nt 的私聊文件 url 有效期多久，不行的话写个判断 adapter 吧
                                    adapter.getPrivateFileUrl(m.data.fid || (m.data as any).file_id, resolve)
                                })
                            }
                        }
                        message.file = {
                            type: mime(path.extname(m.data.name || (m.data as any).file)),
                            size: m.data.size || (m.data as any).file_size,
                            url,
                            name: m.data.name || (m.data as any).file,
                            fid: m.data.fid || (m.data as any).file_id,
                        }
                        message.files.push(message.file)
                        break
                    case 'share':
                        lastMessage.content += '[Link]' + m.data.title
                        message.content += m.data.url
                        break
                    case 'reply':
                        // Milky 1.2: reply 段已内嵌被回复消息的完整内容
                        if ((m.data as any)._milkyReply) {
                            const milkyReply = (m.data as any)._milkyReply
                            const senderId = milkyReply.senderId
                            if (senderId === 80000000) replyAnonymous = true

                            // 优先从存储查找（已有完整的用户名等信息）
                            let replyMsg: Message
                            if (roomId) {
                                replyMsg = await adapter.getMessageFromStorage(roomId, m.data.id)
                            }

                            if (!replyMsg) {
                                // 存储中没有，用 milky 内嵌数据构建
                                let senderName = milkyReply.senderName
                                if (!senderName) {
                                    if (senderId === adapter.getUin()) {
                                        senderName = 'You'
                                    } else if (roomId && roomId < 0) {
                                        // 群聊：查群成员名
                                        try {
                                            const info = await adapter._getGroupMemberInfo(
                                                Math.abs(roomId),
                                                senderId,
                                                false,
                                            )
                                            senderName = info.card || info.nickname
                                        } catch {
                                            senderName = String(senderId)
                                        }
                                    } else {
                                        senderName = String(senderId)
                                    }
                                }
                                replyMsg = {
                                    _id: m.data.id,
                                    date: '',
                                    senderId,
                                    timestamp: '',
                                    username: senderName,
                                    content: '',
                                    files: [],
                                }
                                if (milkyReply.segments && milkyReply.segments.length > 0) {
                                    const { milkySegmentsToOicq } = require('./milkySegmentConverter')
                                    await processMessage(milkySegmentsToOicq(milkyReply.segments), replyMsg, {}, roomId)
                                }
                            }

                            message.replyMessage = {
                                ...replyMsg,
                                _id: m.data.id,
                            }
                            if (replyMsg.file) {
                                message.replyMessage.file = replyMsg.file
                            }
                            if (replyMsg.files) {
                                message.replyMessage.files = replyMsg.files
                            }
                            if (replyMsg.senderId === adapter.getUin()) message.at = true
                            break
                        }
                        let user_id: number, time: number
                        const parsed = Buffer.from(m.data.id, 'base64')
                        if (parsed.length === 21) {
                            // Group
                            user_id = parsed.readUInt32BE(4)
                            time = parsed.readUInt32BE(16)
                        } else if (parsed.length === 17) {
                            // C2C
                            user_id = parsed.readUInt32BE(0)
                            time = parsed.readUInt32BE(12)
                        }
                        if (user_id === 80000000) replyAnonymous = true
                        let replyMessage: Message
                        if (roomId) {
                            replyMessage = await adapter.getMessageFromStorage(roomId, m.data.id)
                        }
                        if (!replyMessage) {
                            //get the message
                            let getRet
                            if (m.data.message) {
                                getRet = {
                                    data: {
                                        sender: {
                                            nickname: String(user_id),
                                            user_id,
                                        },
                                        message: m.data.message,
                                    },
                                }
                            } else {
                                getRet = await adapter.getMsg(m.data.id)
                            }
                            if (getRet.data) {
                                //获取到库里面还没有的历史消息
                                //暂时先不加回库里了
                                const data = getRet.data
                                const senderName =
                                    'group_id' in data
                                        ? (data as GroupMessageEventData).anonymous
                                            ? (data as GroupMessageEventData).anonymous.name
                                            : adapter.getUin() === data.sender.user_id
                                              ? 'You'
                                              : (data.sender as MemberBaseInfo).card || data.sender.nickname
                                        : (data.sender as FriendInfo).remark || data.sender.nickname
                                replyMessage = {
                                    _id: '',
                                    date: '',
                                    senderId: 0,
                                    timestamp: '',
                                    username: senderName,
                                    content: '',
                                    files: [],
                                }
                                await processMessage(data.message, replyMessage, {}, roomId)
                            }
                        }
                        if (replyMessage) {
                            message.replyMessage = {
                                ...replyMessage,
                                _id: m.data.id,
                            }
                            if (replyMessage.file) {
                                //兼容旧版本
                                message.replyMessage.file = replyMessage.file
                            }
                            if (replyMessage.files) {
                                message.replyMessage.files = replyMessage.files
                            }
                            if (replyMessage.senderId === adapter.getUin()) message.at = true
                        } else {
                            try {
                                message.replyMessage = {
                                    _id: m.data.id,
                                    username: user_id === adapter.getUin() ? 'You' : String(user_id),
                                    content: `无法找到原消息(${m.data.id})(${time})`,
                                    files: [],
                                    senderId: user_id,
                                }
                                if (m.data.text) {
                                    message.replyMessage.content = m.data.text
                                }
                            } catch (err) {
                                console.error(err)
                            }
                        }
                        break
                    case 'json':
                        let json: string = m.data.data
                        message.code = json
                        if (!json) break
                        const jsonObj = JSON.parse(json)
                        json = JSON.stringify(jsonObj)
                        if (jsonObj.app === 'com.tencent.mannounce') {
                            try {
                                const title = base64decode(jsonObj.meta.mannounce.title)
                                const content = base64decode(jsonObj.meta.mannounce.text)
                                lastMessage.content = `[${title}]`
                                message.content = title + '\n\n' + content
                                if (jsonObj.meta.mannounce.pic) {
                                    for (const pic of jsonObj.meta.mannounce.pic) {
                                        if (!pic.url) continue
                                        message.file = {
                                            type: 'image/jpeg',
                                            url: `https://gdynamic.qpic.cn/gdynamic/${pic.url}/0`,
                                        }
                                        message.files.push(message.file)
                                    }
                                }
                                break
                            } catch (err) {}
                        } else if (jsonObj.app === 'com.tencent.multimsg') {
                            try {
                                const resId = jsonObj.meta?.detail?.resid
                                const fileName = jsonObj.meta?.detail?.uniseq
                                const forwardSummary = getForwardMessagePrompt(jsonObj) || '[Forward multiple messages]'
                                const forwardPrefix = formatForwardMessageBodyPrefix(jsonObj)
                                if (resId) {
                                    lastMessage.content += forwardSummary
                                    message.content = `${forwardPrefix}[Forward: ${resId}]`
                                    break
                                } else if (fileName) {
                                    lastMessage.content += forwardSummary
                                    message.content = `${forwardPrefix}[NestedForward: ${fileName}]`
                                    break
                                }
                            } catch (err) {}
                        }
                        const biliRegex = /(https?:\\?\/\\?\/b23\.tv\\?\/\w*)\??/
                        const zhihuRegex = /(https?:\\?\/\\?\/\w*\.?zhihu\.com\\?\/[^?"=]*)\??/
                        const biliRegex2 = /(https?:\\?\/\\?\/\w*\.?bilibili\.com\\?\/[^?"=]*)\??/
                        //const jsonLinkRegex = /{.*"app":"com.tencent.structmsg".*"jumpUrl":"(https?:\\?\/\\?\/[^",]*)".*}/
                        const jsonAppLinkRegex = /"contentJumpUrl": ?"(https?:\\?\/\\?\/[^",]*)"/
                        if (biliRegex.test(json)) appurl = json.match(biliRegex)[1].replace(/\\\//g, '/')
                        else if (biliRegex2.test(json)) appurl = json.match(biliRegex2)[1].replace(/\\\//g, '/')
                        else if (zhihuRegex.test(json)) appurl = json.match(zhihuRegex)[1].replace(/\\\//g, '/')
                        //else if (jsonLinkRegex.test(json)) appurl = json.match(jsonLinkRegex)[1].replace(/\\\//g, '/')
                        else if (jsonAppLinkRegex.test(json))
                            appurl = json.match(jsonAppLinkRegex)[1].replace(/\\\//g, '/')
                        else {
                            //作为一般通过小程序解析内部 URL，像腾讯文档就可以
                            try {
                                const meta = (<BilibiliMiniApp>jsonObj).meta.detail_1
                                appurl = meta.qqdocurl
                            } catch (e) {}
                        }
                        if (appurl) {
                            try {
                                const meta =
                                    (<BilibiliMiniApp>jsonObj).meta.detail_1 || (<StructMessageCard>jsonObj).meta.news
                                lastMessage.content = meta.title + ' ' + meta.desc + ' '
                                message.content = meta.title + '\n\n' + meta.desc + '\n\n'

                                let previewUrl = meta.preview
                                if (!previewUrl.toLowerCase().startsWith('http')) {
                                    previewUrl = 'https://' + previewUrl
                                }
                                message.file = {
                                    type: 'image/jpeg',
                                    url: previewUrl,
                                }
                                message.files.push(message.file)
                            } catch (e) {}

                            lastMessage.content += appurl
                            message.content += appurl
                        } else if (
                            jsonObj.app === 'com.tencent.groupphoto' ||
                            jsonObj.app === 'com.tencent.qzone.albumShare'
                        ) {
                            try {
                                const pics = jsonObj.meta.albumData.pics
                                pics.forEach((pic: any) => {
                                    let pUrl = pic.url
                                    if (!pUrl.toLowerCase().startsWith('http')) {
                                        pUrl = 'https://' + pUrl
                                    }
                                    message.file = {
                                        type: 'image/jpeg',
                                        url: pUrl,
                                    }
                                    message.files.push(message.file)
                                })
                            } catch (e) {}

                            lastMessage.content += '[群相册]' + jsonObj.prompt
                            message.content += '[群相册]' + jsonObj.prompt
                        } else {
                            lastMessage.content = '[JSON]' + (jsonObj.prompt || '')
                            message.content = '[JSON]' + (jsonObj.prompt || '') + '\n\n'
                            try {
                                const urlRegex = /"jumpUrl": *"([^"]+)"/i
                                const previewRegex = /"preview": *"([^"]+)"/i
                                const pcUrlRegex = /"pcJumpUrl": *"([^"]+)"/i
                                const jumpUrl = json.match(urlRegex)
                                const pcJumpUrl = json.match(pcUrlRegex)
                                if (pcJumpUrl && pcJumpUrl[1])
                                    message.content += pcJumpUrl[1].replace(/\\\//g, '/').replace(/&amp;/g, '&')
                                else if (jumpUrl && jumpUrl[1])
                                    message.content += jumpUrl[1].replace(/\\\//g, '/').replace(/&amp;/g, '&')
                                const preview = json.match(previewRegex)
                                if (preview && preview[1]) {
                                    message.file = {
                                        type: 'image/jpeg',
                                        url: preview[1].replace(/\\\//g, '/').replace(/&amp;/g, '&'),
                                    }
                                    message.files.push(message.file)
                                }
                            } catch (e) {}
                        }
                        break
                    case 'xml':
                        message.code = m.data.data
                        const urlRegex = /url="([^"]+)"/
                        const md5ImageRegex = /image [^<>]*md5="([A-F\d]{32})"/
                        if (urlRegex.test(m.data.data)) appurl = m.data.data.match(urlRegex)[1].replace(/\\\//g, '/')
                        if (m.data.data.includes('action="viewMultiMsg"')) {
                            lastMessage.content += '[Forward multiple messages]'
                            message.content += '[Forward multiple messages]'
                            const resIdRegex = /m_resid="([\w+=/]+)"/
                            const fileNameRegex = /m_fileName="([\w+-=/]+)"/
                            if (resIdRegex.test(m.data.data)) {
                                const resId = m.data.data.match(resIdRegex)[1]
                                console.log(resId)
                                message.content = `[Forward: ${resId}]`
                            } else if (fileNameRegex.test(m.data.data)) {
                                const fileName = m.data.data.match(fileNameRegex)[1]
                                console.log(fileName)
                                message.content = `[NestedForward: ${fileName}]`
                            }
                        } else if (appurl) {
                            appurl = appurl.replace(/&amp;/g, '&')
                            lastMessage.content = appurl
                            message.content = appurl
                        } else if (md5ImageRegex.test(m.data.data)) {
                            const imgMd5 = (appurl = m.data.data.match(md5ImageRegex)[1])
                            lastMessage.content += '[Image]'
                            url = getImageUrlByMd5(imgMd5)
                            message.file = {
                                type: 'image/jpeg',
                                url,
                            }
                            message.files.push(message.file)
                        } else {
                            const brief_reg = m.data.data.match(/brief="([^"]+)"/)
                            lastMessage.content += '[XML]'
                            message.content += '[XML]'
                            if (brief_reg && brief_reg[1]) {
                                lastMessage.content += brief_reg[1]
                                message.content += brief_reg[1]
                            }
                        }
                        break
                    case 'face':
                        message.content += `[Face: ${m.data.id}]`
                        lastMessage.content += `[${m.data.text ? m.data.text : '表情'}]`
                        if (m.data.qlottie && oicqMessage.length === 1) {
                            let qlottie = m.data.qlottie.replace(/\D/g, '')
                            if (!qlottie) qlottie = '0'
                            message.content = `[QLottie: ${qlottie},${m.data.id}]`
                            if (m.data.extra) {
                                try {
                                    const extra = JSON.parse(m.data.extra)
                                    if (extra.resultId && Number(extra.resultId)) {
                                        message.content = `[QLottie: ${qlottie},${m.data.id},${Number(extra.resultId)}]`
                                    }
                                } catch (e) {}
                            }
                        }
                        break
                    case 'video':
                        message.content = ''
                        lastMessage.content = `[Video]`
                        message.file = {
                            type: 'video/mp4',
                            url: m.data.url || m.data.file,
                            fid: m.data.file,
                        }
                        message.files.push(message.file)
                        break
                    case 'record': {
                        lastMessage.content = '[Audio]'
                        const recordUrl = m.data.url
                        const recordFid = typeof m.data.file === 'string' ? m.data.file : undefined
                        if (!recordUrl) {
                            message.content += '[无法处理的语音]undefined'
                            break
                        }

                        // 主消息（有 _id + roomId）异步解码；历史拉取/回复引用仍同步
                        const canAsyncDecode =
                            !isHistory &&
                            roomId != null &&
                            message._id !== undefined &&
                            message._id !== null &&
                            message._id !== ''

                        if (canAsyncDecode) {
                            message.file = buildAudioFile(AUDIO_DECODING_FILE, recordFid)
                            message.files.push(message.file)
                            scheduleAsyncSilkDecode(roomId, message, recordUrl, message.files.length - 1, recordFid)
                        } else {
                            try {
                                const fileName = await silkDecode(recordUrl)
                                message.file = buildAudioFile(fileName, recordFid)
                                message.files.push(message.file)
                            } catch (e) {
                                console.error(e)
                                message.content = '[语音转换失败]' + getErrorMessage(e) + '\n' + recordUrl
                            }
                        }
                        break
                    }
                    case 'mirai':
                        try {
                            message.mirai = JSON.parse(m.data.data)
                            if (!message.mirai.eqq) {
                                message.mirai = null
                                break
                            } else if (message.mirai.eqq.type === 'tg' && message.mirai.eqq.version === 2) {
                                if (message.mirai.eqq.noSplitSender) break
                                const index = message.content.indexOf(': \n')
                                let sender = ''
                                if (index > -1) {
                                    sender = message.content.substring(0, index)
                                    message.content = message.content.substring(index + 3)
                                    shiftMediaOrders(message, index + 3)
                                } else {
                                    //是图片之类没有真实文本内容的
                                    //去除尾部：
                                    sender = message.content.substring(0, message.content.length - 2)
                                    message.content = ''
                                    shiftMediaOrders(message, Number.MAX_SAFE_INTEGER)
                                }
                                message.username = lastMessage.username = sender
                                lastMessage.content = lastMessage.content.substring(sender.length + 3)
                            } else if (message.mirai.eqq.type === 'tg') {
                                const index = message.content.indexOf('：\n')
                                let sender = ''
                                if (index > -1) {
                                    sender = message.content.slice(0, index)
                                    message.content = message.content.slice(index + 2)
                                    shiftMediaOrders(message, index + 2)
                                } else {
                                    //是图片之类没有真实文本内容的
                                    //去除尾部：
                                    sender = message.content.slice(0, message.content.length - 1)
                                    message.content = ''
                                    shiftMediaOrders(message, Number.MAX_SAFE_INTEGER)
                                }
                                message.username = lastMessage.username = sender
                                lastMessage.content = lastMessage.content.slice(sender.length + 1)
                            }
                        } catch (e) {}
                        break
                    case 'rps':
                        const rps = ['石头', '剪刀', '布']
                        lastMessage.content += '[猜拳]'
                        message.content += '[猜拳]' + rps[m.data.id - 1]
                        break
                    case 'dice':
                        lastMessage.content += '[随机骰子]'
                        message.content += '[随机骰子]点数' + m.data.id
                        break
                    case 'shake':
                        lastMessage.content += '[窗口抖动]'
                        message.content += '[窗口抖动]'
                        break
                    case 'poke':
                        const pokemap = {
                            0: '回戳',
                            1: '戳一戳',
                            2: '比心',
                            3: '点赞',
                            4: '心碎',
                            5: '666',
                            6: '放大招',
                            2000: '敲门',
                            2001: '抓一下',
                            2002: '碎屏',
                            2003: '勾引',
                            2004: '手雷',
                            2005: '结印',
                            2006: '召唤术',
                            2007: '玫瑰花',
                            2009: '让你皮',
                            2011: '宝贝球',
                        }
                        lastMessage.content += '[' + (pokemap[m.data.type] || pokemap[m.data.id]) + ']'
                        message.content += '[' + (pokemap[m.data.type] || pokemap[m.data.id]) + ']'
                        break
                    case 'sface':
                        lastMessage.content += '[sFace: ' + m.data.text + '(' + m.data.id + ')]'
                        message.content += '[sFace: ' + m.data.text + '(' + m.data.id + ')]'
                        break
                    case 'markdown':
                        markdown += m.data.markdown
                        break
                    case 'button':
                        try {
                            if (m.data.rows && Array.isArray(m.data.rows)) {
                                for (const row of m.data.rows) {
                                    const rowButtons = []
                                    if (row.buttons && Array.isArray(row.buttons)) {
                                        for (const button of row.buttons) {
                                            let url = ''
                                            if (button.action.type === 0) {
                                                // URL
                                                url = button.action.data || ''
                                            } else if (button.action.type === 1) {
                                                // callback
                                                url = `icalingua://button/callback?command=${encodeURIComponent(button.action.data || '')}&id=${button.id}&appid=${m.data.appid}`
                                            } else if (button.action.type === 2) {
                                                // command
                                                url = `mqqapi://aio/inlinecmd?command=${encodeURIComponent(button.action.data || '')}&enter=${button.action.enter}&reply=${button.action.reply}`
                                            }
                                            rowButtons.push({
                                                label: button.render_data.label,
                                                visited_label: button.render_data.visited_label,
                                                url,
                                            })
                                        }
                                    }
                                    button_rows.push(rowButtons)
                                }
                            }
                        } catch (e) {
                            console.error(e)
                        }
                        break
                    // @ts-ignore
                    case 'forward':
                        lastMessage.content += '[Forward multiple messages]'
                        message.content = `[Forward: ${(m as any).data.id}]`
                        if (Array.isArray((m as any).data.content)) {
                            try {
                                const messages = []
                                for (let i = 0; i < (m as any).data.content.length; i++) {
                                    const data = (m as any).data.content[i]
                                    const message: Message = {
                                        senderId: data.sender.user_id,
                                        username: data.sender.nickname,
                                        content: '',
                                        timestamp: formatDate('hh:mm:ss', new Date(data.time * 1000)),
                                        date: formatDate('yyyy/MM/dd', new Date(data.time * 1000)),
                                        _id: i.toString(),
                                        time: data.time * 1000,
                                        files: [],
                                        bubble_id: 0,
                                    }
                                    await processMessage(data.content || (data as any).message, message, {})
                                    messages.push(message)
                                }
                                message.code = JSON.stringify(messages)
                            } catch (e) {
                                message.content += `\n[内层消息解析失败: ${e.message}]`
                            }
                        }
                        break
                    default:
                        console.log('[无法解析的消息]', m)
                        break
                }
                lastType = m.type
            }
            if (markdown) {
                try {
                    const imageRegex = /!\[.*?\]\((.*?)\)/g
                    const imageUrl = markdown.match(imageRegex)
                    if (imageUrl) {
                        for (const url of imageUrl) {
                            const imgUrl = url.match(/\((.*?)\)/)[1]
                            message.file = {
                                type: 'image/jpeg',
                                url: imgUrl,
                            }
                            message.files.push(message.file)
                        }
                    }
                } catch (e) {}
                message.markdown = true
                message.content = markdown
            }
            if (button_rows.length) message.button_rows = button_rows
            return { message, lastMessage }
        } catch (e) {
            console.log('processMessage error', e)
            message.content = '[解析消息失败]' + e.message
            lastMessage.content = '[解析消息失败]' + e.message
            return { message, lastMessage }
        }
    }
    return processMessage
}

export default createProcessMessage
