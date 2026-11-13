import { FlashTransfer, type FlashTransferMetadata } from 'oicq-icalingua-plus-plus'
import crypto from 'crypto'
import type {
    FlashTransferRequest,
    FlashTransferResponse,
    FlashTransferUploadTicket,
} from '@icalingua/types/FlashTransfer'
import Message from '@icalingua/types/Message'
import MessagePageOptions from '@icalingua/types/MessagePage'
import { FavoriteRequest, FavoriteResponse } from '@icalingua/types/Favorites'
import { Server, Socket } from 'socket.io'
import type oicqAdapter from '../adapters/oicqAdapter'
import gfsTokenManager from '../utils/gfsTokenManager'
import sendImgTokenManager from '../utils/sendImgTokenManager'
import { deleteUploadedFile, getUploadedFilePath, requestUpload, uploadFile } from '../utils/uploadFileManager'

export default (io: Server, socket: Socket, adapter: typeof oicqAdapter) => {
    socket.on('validateMessageSearchIndex', async (resolve?: (value: { ok: boolean; error?: string }) => void) => {
        try {
            await adapter.validateMessageSearchIndex?.()
            resolve?.({ ok: true })
        } catch (error) {
            resolve?.({ ok: false, error: error instanceof Error ? error.message : String(error) })
        }
    })
    socket.on('migrateLegacyAtMessages', async (resolve?: (value: { ok: boolean; error?: string }) => void) => {
        try {
            await adapter.migrateLegacyAtMessages?.()
            resolve?.({ ok: true })
        } catch (error) {
            resolve?.({ ok: false, error: error instanceof Error ? error.message : String(error) })
        }
    })
    socket.on('addRoom', adapter.addRoom)
    socket.on('addChatGroup', adapter.addChatGroup)
    socket.on('updateChatGroup', adapter.updateChatGroup)
    socket.on('removeChatGroup', adapter.removeChatGroup)
    socket.on('deleteMessage', adapter.deleteMessage)
    socket.on('hideMessage', adapter.hideMessage)
    socket.on('fetchHistory', adapter.fetchHistory)
    socket.on('fetch7DaysHistory', adapter.fetch7DaysHistory)
    socket.on(
        'fetchMessages',
        (roomId: number, options: MessagePageOptions, resolve: (value: Message[] | PromiseLike<Message[]>) => void) =>
            adapter.fetchMessages(roomId, options || {}, socket, resolve),
    )
    socket.on(
        'fetchImageMessages',
        (
            roomId: number,
            offset: number,
            endTime: number | undefined,
            resolve: (value: Message[] | PromiseLike<Message[]>) => void,
        ) => adapter.fetchImageMessages(roomId, offset, endTime, socket, resolve),
    )
    socket.on(
        'fetchMessagesAround',
        (
            roomId: number,
            messageId: string,
            before: number,
            after: number,
            resolve: (value: Message[] | PromiseLike<Message[]>) => void,
        ) => adapter.fetchMessagesAround(roomId, messageId, before, after, socket, resolve),
    )
    socket.on(
        'resolveUnreadTargetMessageId',
        (roomId: number, unreadCount: number, resolve: (messageId: string | null) => void) =>
            adapter.resolveUnreadTargetMessageId(roomId, unreadCount, resolve),
    )
    socket.on('markMessageUnread', (roomId: number, messageId: string, resolve: (unreadCount: number) => void) =>
        adapter.markMessageUnread(roomId, messageId, resolve),
    )
    socket.on(
        'fetchMessagesBySender',
        (
            roomId: number,
            senderId: number,
            offset: number,
            snapshotTime: number | undefined,
            resolve: (value: Message[] | PromiseLike<Message[]>) => void,
        ) => adapter.fetchMessagesBySender(roomId, senderId, offset, snapshotTime, socket, resolve),
    )
    socket.on(
        'searchMessages',
        (
            roomId: number,
            keyword: string,
            offset: number,
            senderId: number | undefined,
            startTime: number | undefined,
            endTime: number | undefined,
            resolve: (value: Message[] | PromiseLike<Message[]>) => void,
        ) => {
            adapter.searchMessages(
                roomId,
                keyword,
                offset,
                senderId ?? undefined,
                startTime ?? undefined,
                endTime ?? undefined,
                socket,
                resolve,
            )
        },
    )
    socket.on('getFirstUnreadRoom', adapter.getFirstUnreadRoom)
    socket.on('getForwardMsg', adapter.getForwardMsg)
    socket.on('getGroups', adapter.getGroups)
    socket.on('getGroupFileMeta', adapter.getGroupFileMeta)
    socket.on('getRoom', adapter.getRoom)
    socket.on('getUnreadCount', adapter.getUnreadCount)
    socket.on('ignoreChat', adapter.ignoreChat)
    socket.on('pinRoom', adapter.pinRoom)
    socket.on('reLogin', adapter.reLogin)
    socket.on('removeChat', adapter.removeChat)
    socket.on('revealMessage', adapter.revealMessage)
    socket.on('renewMessage', adapter.renewMessage)
    socket.on('renewMessageURL', adapter.renewMessageURL)
    socket.on('sendGroupPoke', adapter.sendGroupPoke)
    socket.on('sendGroupSign', adapter.sendGroupSign)
    socket.on('sendMessage', adapter.sendMessage)
    socket.on('setOnlineStatus', adapter.setOnlineStatus)
    socket.on('setRoomAutoDownload', adapter.setRoomAutoDownload)
    socket.on('setRoomAutoDownloadPath', adapter.setRoomAutoDownloadPath)
    socket.on('setRoomPriority', adapter.setRoomPriority)
    socket.on('updateMessage', adapter.updateMessage)
    socket.on('updateRoom', adapter.updateRoom)
    socket.on('getCookies', adapter.getCookies)
    socket.on('getIgnoredChats', adapter.getIgnoredChats)
    socket.on('removeIgnoredChat', adapter.removeIgnoredChat)
    socket.on('getRoamingStamp', adapter.getRoamingStamp)
    socket.on('getFriendsFallback', adapter.getFriendsFallback)
    socket.on('getGroupMemberInfo', adapter.getGroupMemberInfo)
    socket.on('setGroupNick', adapter.setGroupNick)
    socket.on('getGroupMembers', adapter.getGroupMembers)
    socket.on('getSystemMsg', adapter.getSystemMsg)
    socket.on('handleRequest', adapter.handleRequest)
    socket.on('setGroupLeave', adapter.setGroupLeave)
    socket.on('setGroupKick', adapter.setGroupKick)
    socket.on('setGroupBan', adapter.setGroupBan)
    socket.on('setGroupAnonymousBan', adapter.setGroupAnonymousBan)
    socket.on('sendButtonCallback', adapter.sendButtonCallback)
    socket.on('setGroupRemark', adapter.setGroupRemark)
    socket.on('setFriendRemark', adapter.setFriendRemark)
    socket.on('makeForward', adapter.makeForward)
    socket.on('login', adapter.createBot)
    socket.on('submitSmsCode', adapter.submitSmsCode)
    socket.on('randomDevice', adapter.randomDevice)
    socket.on('requestToken', (cb) => cb(sendImgTokenManager.create()))
    socket.on('requestGfsToken', (gin: number, cb) => cb(gfsTokenManager.create(gin)))
    socket.on('login-verify-reLogin', adapter.reLogin)
    socket.on('login-slider-ticket', adapter.sliderLogin)
    socket.on('getFriend', adapter.getFriend)
    socket.on('getGroup', adapter.getGroup)
    socket.on('getMsgNewURL', adapter.getMsgNewURL)
    socket.on('sendPacket', adapter.sendPacket)
    socket.on('getDisabledFeatures', (cb) => cb(adapter.disabledFeatures))
    socket.on('requestUpload', requestUpload)
    socket.on('uploadFile', uploadFile)
    socket.on(
        'uploadGroupFile',
        async (
            fileHash: string,
            gid: number,
            pid: string,
            fileName: string,
            cb: (result: { ok: boolean; error?: string }) => void,
        ) => {
            const filePath = getUploadedFilePath(fileHash)
            if (!filePath) {
                cb({ ok: false, error: '文件上传失败：找不到已上传的文件' })
                return
            }
            try {
                await adapter.acquireGfs(gid).upload(filePath, pid || '/', fileName)
                cb({ ok: true })
            } catch (error) {
                console.error('group file upload error:', error)
                cb({ ok: false, error: error instanceof Error ? error.message : String(error) })
            } finally {
                deleteUploadedFile(fileHash)
            }
        },
    )
    const flashUploadTasks = new Map<
        string,
        { metadata: FlashTransferMetadata[]; total: number; registered: boolean }
    >()
    const flashUploadTickets = new Map<string, { task_id: string; ticket: FlashTransferUploadTicket }>()
    let flashUploadsClosed = false
    const releaseFlashUpload = (task_id: string) => {
        flashUploadTasks.delete(task_id)
        for (const [id, item] of flashUploadTickets) if (item.task_id === task_id) flashUploadTickets.delete(id)
    }
    socket.on('disconnect', () => {
        flashUploadsClosed = true
        flashUploadTasks.clear()
        flashUploadTickets.clear()
    })
    socket.on(
        'flashTransferRequest',
        async (request: FlashTransferRequest, resolve?: (value: FlashTransferResponse) => void) => {
            if (typeof resolve !== 'function') return
            try {
                if (flashUploadsClosed) throw new Error('Bridge 连接已关闭，请重新上传')
                if (request?.action === 'upload') throw new Error('请更新客户端，闪传文件应由客户端直接上传至 QQ')
                if (request?.action === 'release_upload') {
                    releaseFlashUpload(request.task_id)
                    resolve({ ok: true })
                    return
                }
                let task_id = request.task?.task_id || request.task_id
                let state = flashUploadTasks.get(task_id)
                let payload = request
                if (request.action === 'add_files') {
                    const { metadata, metadata_offset: offset, metadata_total: total } = request
                    if (
                        !request.task?.task_id ||
                        !request.task.fileset_id ||
                        !Array.isArray(metadata) ||
                        !metadata.length ||
                        metadata.length > 100 ||
                        !Number.isSafeInteger(offset) ||
                        offset < 0 ||
                        !Number.isSafeInteger(total) ||
                        total < 1 ||
                        total > 10000 ||
                        offset + metadata.length > total
                    )
                        throw new Error('上传元数据批次无效，请更新客户端')
                    if (!state) {
                        if (offset !== 0) throw new Error('上传元数据批次不连续，请重新上传')
                        state = { metadata: [], total, registered: false }
                        flashUploadTasks.set(task_id, state)
                    }
                    if (state.registered || state.total !== total || state.metadata.length !== offset)
                        throw new Error('上传元数据批次不连续，请重新上传')
                    state.metadata.push(...metadata)
                    if (state.metadata.length < total) {
                        resolve({ ok: true, data: [] })
                        return
                    }
                    payload = { action: 'add_files', task: request.task, metadata: state.metadata }
                }
                if (request.action === 'apply_upload' || request.action === 'submit') {
                    if (!state?.registered) throw new Error('上传任务已释放或文件尚未登记完成，请重新上传')
                }
                if (request.action === 'complete_file') {
                    const item = flashUploadTickets.get(request.upload_id)
                    if (!item) throw new Error('上传凭证已失效，请重新上传')
                    task_id = item.task_id
                    state = flashUploadTasks.get(task_id)
                    if (!state?.registered) throw new Error('上传任务已释放，请重新上传')
                    payload = { action: 'complete_file', ticket: item.ticket }
                }
                const result = await adapter.flashTransferRequest(payload)
                if (flashUploadsClosed || (state && flashUploadTasks.get(task_id) !== state))
                    throw new Error('上传任务已释放或连接已断开，请重新上传')
                if (result.ok && request.action === 'capabilities')
                    result.data = {
                        ...result.data,
                        client_upload_version: typeof FlashTransfer?.upload === 'function' ? 2 : 0,
                    }
                if (result.ok && request.action === 'add_files') {
                    state.registered = true
                    state.metadata = []
                }
                if (result.ok && request.action === 'apply_upload') {
                    const ticket = result.data as FlashTransferUploadTicket
                    const upload_id = crypto.randomBytes(16).toString('hex')
                    flashUploadTickets.set(upload_id, { task_id, ticket })
                    result.data = { upload_id, ukey: ticket.ukey, appid: ticket.appid, file_id: ticket.file_id }
                }
                if (result.ok && request.action === 'complete_file') flashUploadTickets.delete(request.upload_id)
                if (result.ok && request.action === 'submit') releaseFlashUpload(task_id)
                resolve(result)
            } catch (error) {
                resolve({ ok: false, error: error instanceof Error ? error.message : String(error) })
            }
        },
    )

    socket.on('favoritesRequest', async (request: FavoriteRequest, resolve?: (value: FavoriteResponse) => void) => {
        if (typeof resolve !== 'function') return
        try {
            resolve(await adapter.favoritesRequest(request))
        } catch (error) {
            resolve({ ok: false, error: error instanceof Error ? error.message : '收藏操作失败' })
        }
    })
    socket.on('getLoginDevices', adapter.getLoginDevices)
    socket.on('deleteLoginDevice', adapter.deleteLoginDevice)
    socket.on('getPrivateFileUrl', adapter.getPrivateFileUrl)
    socket.on('getNTPicURLbyFileid', adapter.getNTPicURLbyFileid)
}
