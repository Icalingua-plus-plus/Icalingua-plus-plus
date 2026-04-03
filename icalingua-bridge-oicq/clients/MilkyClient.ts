/**
 * Milky 协议客户端封装
 * 基于 @saltify/milky-tea
 */

import { EventEmitter } from 'eventemitter3'
import { createMilkyClient, type MilkyClient as MilkyClientType } from '@saltify/milky-tea'
import type { IncomingSegment, OutgoingSegment } from '@saltify/milky-types'
import type { EventSource as RawEventSource } from 'eventsource'

// ============ 事件类型定义 ============

export interface IncomingMessage {
    message_scene: 'friend' | 'group' | 'temp'
    peer_id: number
    message_seq: number
    sender_id: number
    time: number
    segments: IncomingSegment[]
    // 好友消息
    friend?: {
        user_id: number
        nickname: string
        sex: 'male' | 'female' | 'unknown'
        qid: string
        remark: string
        category: { category_id: number; category_name: string }
    }
    // 群消息
    group?: {
        group_id: number
        group_name: string
        member_count: number
        max_member_count: number
    }
    group_member?: {
        user_id: number
        nickname: string
        sex: 'male' | 'female' | 'unknown'
        group_id: number
        card: string
        title: string
        level: number
        role: 'owner' | 'admin' | 'member'
        join_time: number
        last_sent_time: number
        shut_up_end_time?: number
    }
}

export interface MessageRecallEvent {
    message_scene: 'friend' | 'group' | 'temp'
    peer_id: number
    message_seq: number
    sender_id: number
    operator_id: number
    display_suffix: string
}

export interface GroupMemberIncreaseEvent {
    group_id: number
    user_id: number
    operator_id?: number
    invitor_id?: number
}

export interface GroupMemberDecreaseEvent {
    group_id: number
    user_id: number
    operator_id?: number
}

export interface GroupMuteEvent {
    group_id: number
    user_id: number
    operator_id: number
    duration: number
}

export interface GroupWholeMuteEvent {
    group_id: number
    operator_id: number
    is_mute: boolean
}

export interface GroupAdminChangeEvent {
    group_id: number
    user_id: number
    is_set: boolean
}

export interface FriendNudgeEvent {
    user_id: number
    is_self_send: boolean
    is_self_receive: boolean
    display_action: string
    display_suffix: string
    display_action_img_url: string
}

export interface GroupNudgeEvent {
    group_id: number
    sender_id: number
    receiver_id: number
    display_action: string
    display_suffix: string
    display_action_img_url: string
}

export interface FriendFileUploadEvent {
    user_id: number
    file_id: string
    file_name: string
    file_size: number
    file_hash: string
    is_self: boolean
}

export interface GroupFileUploadEvent {
    group_id: number
    user_id: number
    file_id: string
    file_name: string
    file_size: number
}

export interface FriendRequestEvent {
    initiator_id: number
    initiator_uid: string
    comment: string
    via: string
}

export interface GroupJoinRequestEvent {
    group_id: number
    notification_seq: number
    is_filtered: boolean
    initiator_id: number
    comment: string
}

export interface GroupInvitedJoinRequestEvent {
    group_id: number
    notification_seq: number
    initiator_id: number
    target_user_id: number
}

export interface GroupInvitationEvent {
    group_id: number
    invitation_seq: number
    initiator_id: number
}

export interface GroupNameChangeEvent {
    group_id: number
    new_group_name: string
    operator_id: number
}

export interface GroupMessageReactionEvent {
    group_id: number
    user_id: number
    message_seq: number
    face_id: string
    is_add: boolean
}

export interface GroupEssenceMessageChangeEvent {
    group_id: number
    message_seq: number
    operator_id: number
    is_set: boolean
}

// ============ 实体类型定义 ============

export interface FriendEntity {
    user_id: number
    nickname: string
    sex: 'male' | 'female' | 'unknown'
    qid: string
    remark: string
    category: { category_id: number; category_name: string }
}

export interface GroupEntity {
    group_id: number
    group_name: string
    member_count: number
    max_member_count: number
}

export interface GroupMemberEntity {
    user_id: number
    nickname: string
    sex: 'male' | 'female' | 'unknown'
    group_id: number
    card: string
    title: string
    level: number
    role: 'owner' | 'admin' | 'member'
    join_time: number
    last_sent_time: number
    shut_up_end_time?: number
}

// ============ 客户端类 ============

type MilkyClientEvents = {
    message: [IncomingMessage]
    messageRecall: [MessageRecallEvent]
    groupMemberIncrease: [GroupMemberIncreaseEvent]
    groupMemberDecrease: [GroupMemberDecreaseEvent]
    groupMute: [GroupMuteEvent]
    groupWholeMute: [GroupWholeMuteEvent]
    groupAdminChange: [GroupAdminChangeEvent]
    friendNudge: [FriendNudgeEvent]
    groupNudge: [GroupNudgeEvent]
    friendFileUpload: [FriendFileUploadEvent]
    groupFileUpload: [GroupFileUploadEvent]
    friendRequest: [FriendRequestEvent]
    groupJoinRequest: [GroupJoinRequestEvent]
    groupInvitedJoinRequest: [GroupInvitedJoinRequestEvent]
    groupInvitation: [GroupInvitationEvent]
    groupNameChange: [GroupNameChangeEvent]
    groupMessageReaction: [GroupMessageReactionEvent]
    groupEssenceMessageChange: [GroupEssenceMessageChangeEvent]
    botOffline: [{ reason: string }]
}

export default class MilkyClient extends EventEmitter<MilkyClientEvents> {
    private client: MilkyClientType
    private eventSource: RawEventSource
    private _uin: number = 0
    private _nickname: string = ''

    constructor(
        private readonly url: string,
        private readonly accessToken?: string,
    ) {
        super()
    }

    get uin() {
        return this._uin
    }

    get nickname() {
        return this._nickname
    }

    async connect(): Promise<void> {
        // 如果已有连接，先清理
        if (this.eventSource) {
            this.eventSource.close()
        }

        this.client = createMilkyClient({
            baseURL: this.url,
            token: this.accessToken,
            strict: false,
        })

        // 直接使用 eventsource 包创建 SSE 连接
        // milky-tea 内部硬编码监听 "milky_event" 事件类型，但部分 milky 服务端
        // 可能使用默认的 "message" 类型，这里同时监听两者以确保兼容
        const { EventSource } = await import('eventsource')
        const eventUrl = new URL(this.url)
        if (!eventUrl.pathname.endsWith('/')) eventUrl.pathname += '/'
        eventUrl.pathname += 'event'
        if (this.accessToken) eventUrl.searchParams.set('token', this.accessToken)

        this.eventSource = new EventSource(eventUrl.toString())

        this.eventSource.addEventListener('open', () => {
            console.log('[MilkyClient] 事件源已连接')
        })

        this.eventSource.addEventListener('error', (event: any) => {
            console.error('[MilkyClient] 事件源错误', event.message || event)
        })

        // SSE 事件处理
        const handleEvent = (event: MessageEvent) => {
            try {
                const ev = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
                this.dispatchMilkyEvent(ev)
            } catch (err) {
                console.error('[MilkyClient] 事件解析失败', err)
            }
        }

        // 兼容不同版本的 milky 服务端：同时监听 "message" 和 "milky_event"
        this.eventSource.addEventListener('message', handleEvent)
        this.eventSource.addEventListener('milky_event', handleEvent as any)

        // 获取登录信息
        const loginInfo = await this.getLoginInfo()
        this._uin = loginInfo.uin
        this._nickname = loginInfo.nickname
    }

    // ============ 事件分发 ============

    private dispatchMilkyEvent(ev: { type?: string; event_type?: string; data: any }) {
        console.log('dispatchMilkyEvent', ev)
        switch (ev.event_type || ev.type) {
            case 'message_receive':
                this.emit('message', ev.data as IncomingMessage)
                break
            case 'message_recall':
                this.emit('messageRecall', ev.data as MessageRecallEvent)
                break
            case 'group_member_increase':
                this.emit('groupMemberIncrease', ev.data as GroupMemberIncreaseEvent)
                break
            case 'group_member_decrease':
                this.emit('groupMemberDecrease', ev.data as GroupMemberDecreaseEvent)
                break
            case 'group_mute':
                this.emit('groupMute', ev.data as GroupMuteEvent)
                break
            case 'group_whole_mute':
                this.emit('groupWholeMute', ev.data as GroupWholeMuteEvent)
                break
            case 'group_admin_change':
                this.emit('groupAdminChange', ev.data as GroupAdminChangeEvent)
                break
            case 'friend_nudge':
                this.emit('friendNudge', ev.data as FriendNudgeEvent)
                break
            case 'group_nudge':
                this.emit('groupNudge', ev.data as GroupNudgeEvent)
                break
            case 'friend_file_upload':
                this.emit('friendFileUpload', ev.data as FriendFileUploadEvent)
                break
            case 'group_file_upload':
                this.emit('groupFileUpload', ev.data as GroupFileUploadEvent)
                break
            case 'friend_request':
                this.emit('friendRequest', ev.data as FriendRequestEvent)
                break
            case 'group_join_request':
                this.emit('groupJoinRequest', ev.data as GroupJoinRequestEvent)
                break
            case 'group_invited_join_request':
                this.emit('groupInvitedJoinRequest', ev.data as GroupInvitedJoinRequestEvent)
                break
            case 'group_invitation':
                this.emit('groupInvitation', ev.data as GroupInvitationEvent)
                break
            case 'group_name_change':
                this.emit('groupNameChange', ev.data as GroupNameChangeEvent)
                break
            case 'group_message_reaction':
                this.emit('groupMessageReaction', ev.data as GroupMessageReactionEvent)
                break
            case 'group_essence_message_change':
                this.emit('groupEssenceMessageChange', ev.data as GroupEssenceMessageChangeEvent)
                break
            case 'bot_offline':
                this.emit('botOffline', ev.data as { reason: string })
                break
        }
    }

    // ============ API 方法 ============

    async getLoginInfo() {
        return this.client.fetch('get_login_info', undefined) as Promise<{ uin: number; nickname: string }>
    }

    async getImplInfo() {
        return this.client.fetch('get_impl_info', undefined) as Promise<{
            impl_name: string
            impl_version: string
            qq_protocol_version: string
            qq_protocol_type: string
            milky_version: string
        }>
    }

    async getFriendList(noCache = false) {
        return this.client.fetch('get_friend_list', { no_cache: noCache }) as Promise<{ friends: FriendEntity[] }>
    }

    async getFriendInfo(userId: number, noCache = false) {
        return this.client.fetch('get_friend_info', { user_id: Math.abs(userId), no_cache: noCache }) as Promise<{
            friend: FriendEntity
        }>
    }

    async getGroupList(noCache = false) {
        return this.client.fetch('get_group_list', { no_cache: noCache }) as Promise<{ groups: GroupEntity[] }>
    }

    async getGroupInfo(groupId: number, noCache = false) {
        return this.client.fetch('get_group_info', { group_id: Math.abs(groupId), no_cache: noCache }) as Promise<{
            group: GroupEntity
        }>
    }

    async getGroupMemberList(groupId: number, noCache = false) {
        return this.client.fetch('get_group_member_list', {
            group_id: Math.abs(groupId),
            no_cache: noCache,
        }) as Promise<{
            members: GroupMemberEntity[]
        }>
    }

    async getGroupMemberInfo(groupId: number, userId: number, noCache = false) {
        return this.client.fetch('get_group_member_info', {
            group_id: Math.abs(groupId),
            user_id: Math.abs(userId),
            no_cache: noCache,
        }) as Promise<{ member: GroupMemberEntity }>
    }

    async getUserProfile(userId: number) {
        return this.client.fetch('get_user_profile', { user_id: userId }) as Promise<{
            nickname: string
            qid: string
            age: number
            sex: 'male' | 'female' | 'unknown'
            remark: string
            bio: string
            level: number
            country: string
            city: string
            school: string
        }>
    }

    async sendPrivateMessage(userId: number, message: OutgoingSegment[]) {
        return this.client.fetch('send_private_message', { user_id: Math.abs(userId), message }) as Promise<{
            message_seq: number
            time: number
        }>
    }

    async sendGroupMessage(groupId: number, message: OutgoingSegment[]) {
        return this.client.fetch('send_group_message', { group_id: Math.abs(groupId), message }) as Promise<{
            message_seq: number
            time: number
        }>
    }

    async recallPrivateMessage(userId: number, messageSeq: number) {
        return this.client.fetch('recall_private_message', { user_id: Math.abs(userId), message_seq: messageSeq })
    }

    async recallGroupMessage(groupId: number, messageSeq: number) {
        return this.client.fetch('recall_group_message', { group_id: Math.abs(groupId), message_seq: messageSeq })
    }

    async getMessage(messageScene: 'friend' | 'group' | 'temp', peerId: number, messageSeq: number) {
        return this.client.fetch('get_message', {
            message_scene: messageScene,
            peer_id: Math.abs(peerId),
            message_seq: messageSeq,
        }) as Promise<{ message: IncomingMessage }>
    }

    async getHistoryMessages(
        messageScene: 'friend' | 'group' | 'temp',
        peerId: number,
        startMessageSeq?: number,
        limit?: number,
    ) {
        return this.client.fetch('get_history_messages', {
            message_scene: messageScene,
            peer_id: Math.abs(peerId),
            start_message_seq: startMessageSeq,
            limit,
        }) as Promise<{ messages: IncomingMessage[]; next_message_seq?: number }>
    }

    async getForwardedMessages(forwardId: string) {
        return this.client.fetch('get_forwarded_messages', { forward_id: forwardId }) as Promise<{
            messages: Array<{
                sender_name: string
                avatar_url: string
                time: number
                segments: IncomingSegment[]
            }>
        }>
    }

    async markMessageAsRead(messageScene: 'friend' | 'group' | 'temp', peerId: number, messageSeq: number) {
        return this.client.fetch('mark_message_as_read', {
            message_scene: messageScene,
            peer_id: Math.abs(peerId),
            message_seq: messageSeq,
        })
    }

    async setGroupMemberCard(groupId: number, userId: number, card: string) {
        return this.client.fetch('set_group_member_card', {
            group_id: Math.abs(groupId),
            user_id: Math.abs(userId),
            card,
        })
    }

    async setGroupMemberMute(groupId: number, userId: number, duration: number) {
        return this.client.fetch('set_group_member_mute', {
            group_id: Math.abs(groupId),
            user_id: Math.abs(userId),
            duration,
        })
    }

    async setGroupWholeMute(groupId: number, isMute: boolean) {
        return this.client.fetch('set_group_whole_mute', { group_id: Math.abs(groupId), is_mute: isMute })
    }

    async kickGroupMember(groupId: number, userId: number, rejectAddRequest = false) {
        return this.client.fetch('kick_group_member', {
            group_id: Math.abs(groupId),
            user_id: userId,
            reject_add_request: rejectAddRequest,
        })
    }

    async quitGroup(groupId: number) {
        return this.client.fetch('quit_group', { group_id: Math.abs(groupId) })
    }

    async sendFriendNudge(userId: number, isSelf = false) {
        return this.client.fetch('send_friend_nudge', { user_id: Math.abs(userId), is_self: isSelf })
    }

    async sendGroupNudge(groupId: number, userId: number) {
        return this.client.fetch('send_group_nudge', { group_id: Math.abs(groupId), user_id: Math.abs(userId) })
    }

    async getCookies(domain: string) {
        return this.client.fetch('get_cookies', { domain }) as Promise<{ cookies: string }>
    }

    async getCSRFToken() {
        return this.client.fetch('get_csrf_token', undefined) as Promise<{ csrf_token: string }>
    }

    async getGroupFiles(groupId: number, parentFolderId = '/') {
        return this.client.fetch('get_group_files', {
            group_id: Math.abs(groupId),
            parent_folder_id: parentFolderId,
        }) as Promise<{
            files: Array<{
                group_id: number
                file_id: string
                file_name: string
                parent_folder_id: string
                file_size: number
                uploaded_time: number
                expire_time?: number
                uploader_id: number
                downloaded_times: number
            }>
            folders: Array<{
                group_id: number
                folder_id: string
                parent_folder_id: string
                folder_name: string
                created_time: number
                last_modified_time: number
                creator_id: number
                file_count: number
            }>
        }>
    }

    async getGroupFileDownloadUrl(groupId: number, fileId: string) {
        return this.client.fetch('get_group_file_download_url', {
            group_id: Math.abs(groupId),
            file_id: fileId,
        }) as Promise<{
            download_url: string
        }>
    }

    async getPrivateFileDownloadUrl(userId: number, fileId: string, fileHash: string) {
        return this.client.fetch('get_private_file_download_url', {
            user_id: Math.abs(userId),
            file_id: fileId,
            file_hash: fileHash,
        }) as Promise<{ download_url: string }>
    }

    async uploadGroupFile(groupId: number, fileUri: string, fileName: string, parentFolderId = '/') {
        return this.client.fetch('upload_group_file', {
            group_id: Math.abs(groupId),
            file_uri: fileUri,
            file_name: fileName,
            parent_folder_id: parentFolderId,
        }) as Promise<{ file_id: string }>
    }

    async uploadPrivateFile(userId: number, fileUri: string, fileName: string) {
        return this.client.fetch('upload_private_file', {
            user_id: Math.abs(userId),
            file_uri: fileUri,
            file_name: fileName,
        }) as Promise<{ file_id: string }>
    }

    async createGroupFolder(groupId: number, folderName: string) {
        return this.client.fetch('create_group_folder', {
            group_id: Math.abs(groupId),
            folder_name: folderName,
        }) as Promise<{
            folder_id: string
        }>
    }

    async deleteGroupFile(groupId: number, fileId: string) {
        return this.client.fetch('delete_group_file', { group_id: Math.abs(groupId), file_id: fileId })
    }

    async deleteGroupFolder(groupId: number, folderId: string) {
        return this.client.fetch('delete_group_folder', { group_id: Math.abs(groupId), folder_id: folderId })
    }

    async moveGroupFile(groupId: number, fileId: string, parentFolderId: string, targetFolderId: string) {
        return this.client.fetch('move_group_file', {
            group_id: Math.abs(groupId),
            file_id: fileId,
            parent_folder_id: parentFolderId,
            target_folder_id: targetFolderId,
        })
    }

    async renameGroupFile(groupId: number, fileId: string, parentFolderId: string, newFileName: string) {
        return this.client.fetch('rename_group_file', {
            group_id: Math.abs(groupId),
            file_id: fileId,
            parent_folder_id: parentFolderId,
            new_file_name: newFileName,
        })
    }

    async getResourceTempUrl(resourceId: string) {
        return this.client.fetch('get_resource_temp_url', { resource_id: resourceId }) as Promise<{ url: string }>
    }

    // ============ 好友请求 API ============

    async getFriendRequests(limit = 20, isFiltered = false) {
        return this.client.fetch('get_friend_requests', { limit, is_filtered: isFiltered }) as unknown as Promise<{
            requests: Array<{
                initiator_id: number
                initiator_uid: string
                comment: string
                via: string
                is_filtered: boolean
            }>
        }>
    }

    async acceptFriendRequest(initiatorUid: string, isFiltered = false) {
        return this.client.fetch('accept_friend_request', { initiator_uid: initiatorUid, is_filtered: isFiltered })
    }

    async rejectFriendRequest(initiatorUid: string, isFiltered = false, reason?: string) {
        return this.client.fetch('reject_friend_request', {
            initiator_uid: initiatorUid,
            is_filtered: isFiltered,
            reason: reason || null,
        })
    }

    // ============ 群通知/请求 API ============

    async getGroupNotifications(limit = 20, isFiltered = false, startNotificationSeq?: number) {
        return this.client.fetch('get_group_notifications', {
            limit,
            is_filtered: isFiltered,
            start_notification_seq: startNotificationSeq || null,
        }) as Promise<{
            notifications: Array<{
                notification_seq: number
                notification_type: string
                group_id: number
                operator_id?: number
                initiator_id?: number
                target_user_id?: number
                comment?: string
                is_filtered: boolean
            }>
            next_notification_seq?: number
        }>
    }

    async acceptGroupRequest(
        notificationSeq: number,
        notificationType: 'join_request' | 'invited_join_request',
        groupId: number,
        isFiltered = false,
    ) {
        return this.client.fetch('accept_group_request', {
            notification_seq: notificationSeq,
            notification_type: notificationType,
            group_id: groupId,
            is_filtered: isFiltered,
        })
    }

    async rejectGroupRequest(
        notificationSeq: number,
        notificationType: 'join_request' | 'invited_join_request',
        groupId: number,
        isFiltered = false,
        reason?: string,
    ) {
        return this.client.fetch('reject_group_request', {
            notification_seq: notificationSeq,
            notification_type: notificationType,
            group_id: groupId,
            is_filtered: isFiltered,
            reason: reason || null,
        })
    }

    async acceptGroupInvitation(groupId: number, invitationSeq: number) {
        return this.client.fetch('accept_group_invitation', {
            group_id: groupId,
            invitation_seq: invitationSeq,
        })
    }

    async rejectGroupInvitation(groupId: number, invitationSeq: number) {
        return this.client.fetch('reject_group_invitation', {
            group_id: groupId,
            invitation_seq: invitationSeq,
        })
    }

    // ============ 收藏表情 API ============

    async getCustomFaceUrlList() {
        return this.client.fetch('get_custom_face_url_list', undefined) as Promise<{ urls: string[] }>
    }

    dispose() {
        this.eventSource?.close()
    }
}
