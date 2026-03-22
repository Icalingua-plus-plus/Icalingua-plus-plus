/**
 * Milky 协议客户端封装
 * 基于 @saltify/milky-tea
 */

import { EventEmitter } from 'eventemitter3'
import { MilkyClient as SdkClient, createMilkyClient } from '@saltify/milky-tea'
import { IncomingSegment, OutgoingSegment } from '@saltify/milky-types'

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
    botOffline: [{ reason: string }]
}

export default class MilkyClient extends EventEmitter<MilkyClientEvents> {
    private client: SdkClient
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
        this.client = createMilkyClient({ baseURL: this.url, token: this.accessToken })

        // 注册事件处理器
        const eventSource = this.client.event('auto')
        eventSource.addEventListener('message_receive', (event) => {
            this.emit('message', event.data as unknown as IncomingMessage)
        })

        eventSource.addEventListener('message_recall', (event) => {
            this.emit('messageRecall', event.data as unknown as MessageRecallEvent)
        })

        eventSource.addEventListener('group_member_increase', (event) => {
            this.emit('groupMemberIncrease', event.data as unknown as GroupMemberIncreaseEvent)
        })

        eventSource.addEventListener('group_member_decrease', (event) => {
            this.emit('groupMemberDecrease', event.data as unknown as GroupMemberDecreaseEvent)
        })

        eventSource.addEventListener('group_mute', (event) => {
            this.emit('groupMute', event.data as unknown as GroupMuteEvent)
        })

        eventSource.addEventListener('group_whole_mute', (event) => {
            this.emit('groupWholeMute', event.data as unknown as GroupWholeMuteEvent)
        })

        eventSource.addEventListener('group_admin_change', (event) => {
            this.emit('groupAdminChange', event.data as unknown as GroupAdminChangeEvent)
        })

        eventSource.addEventListener('friend_nudge', (event) => {
            this.emit('friendNudge', event.data as unknown as FriendNudgeEvent)
        })

        eventSource.addEventListener('group_nudge', (event) => {
            this.emit('groupNudge', event.data as unknown as GroupNudgeEvent)
        })

        eventSource.addEventListener('friend_file_upload', (event) => {
            this.emit('friendFileUpload', event.data as unknown as FriendFileUploadEvent)
        })

        eventSource.addEventListener('group_file_upload', (event) => {
            this.emit('groupFileUpload', event.data as unknown as GroupFileUploadEvent)
        })

        eventSource.addEventListener('bot_offline', (event) => {
            this.emit('botOffline', event.data as unknown as { reason: string })
        })

        eventSource.close()

        // 获取登录信息
        const loginInfo = await this.getLoginInfo()
        this._uin = loginInfo.uin
        this._nickname = loginInfo.nickname
    }

    // ============ API 方法 ============

    async getLoginInfo() {
        return this.client.system.getLoginInfo() as Promise<{ uin: number; nickname: string }>
    }

    async getImplInfo() {
        return this.client.system.getImplInfo() as Promise<{
            impl_name: string
            impl_version: string
            qq_protocol_version: string
            qq_protocol_type: string
            milky_version: string
        }>
    }

    async getFriendList(noCache = false) {
        return this.client.system.getFriendList({ no_cache: noCache }) as Promise<{ friends: FriendEntity[] }>
    }

    async getFriendInfo(userId: number, noCache = false) {
        return this.client.system.getFriendInfo({ user_id: Math.abs(userId), no_cache: noCache }) as Promise<{
            friend: FriendEntity
        }>
    }

    async getGroupList(noCache = false) {
        return this.client.system.getGroupList({ no_cache: noCache }) as Promise<{ groups: GroupEntity[] }>
    }

    async getGroupInfo(groupId: number, noCache = false) {
        return this.client.system.getGroupInfo({ group_id: Math.abs(groupId), no_cache: noCache }) as Promise<{
            group: GroupEntity
        }>
    }

    async getGroupMemberList(groupId: number, noCache = false) {
        return this.client.system.getGroupMemberList({
            group_id: Math.abs(groupId),
            no_cache: noCache,
        }) as Promise<{
            members: GroupMemberEntity[]
        }>
    }

    async getGroupMemberInfo(groupId: number, userId: number, noCache = false) {
        return this.client.system.getGroupMemberInfo({
            group_id: Math.abs(groupId),
            user_id: Math.abs(userId),
            no_cache: noCache,
        }) as Promise<{ member: GroupMemberEntity }>
    }

    async getUserProfile(userId: number) {
        return this.client.system.getUserProfile({ user_id: userId }) as Promise<{
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
        return this.client.message.sendPrivateMessage({ user_id: Math.abs(userId), message }) as Promise<{
            message_seq: number
            time: number
        }>
    }

    async sendGroupMessage(groupId: number, message: OutgoingSegment[]) {
        return this.client.message.sendGroupMessage({ group_id: Math.abs(groupId), message }) as Promise<{
            message_seq: number
            time: number
        }>
    }

    async recallPrivateMessage(userId: number, messageSeq: number) {
        return this.client.message.recallPrivateMessage({ user_id: Math.abs(userId), message_seq: messageSeq })
    }

    async recallGroupMessage(groupId: number, messageSeq: number) {
        return this.client.message.recallGroupMessage({ group_id: Math.abs(groupId), message_seq: messageSeq })
    }

    async getMessage(messageScene: 'friend' | 'group' | 'temp', peerId: number, messageSeq: number) {
        return this.client.message.getMessage({
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
        return this.client.message.getHistoryMessages({
            message_scene: messageScene,
            peer_id: Math.abs(peerId),
            start_message_seq: startMessageSeq,
            limit,
        }) as Promise<{ messages: IncomingMessage[]; next_message_seq?: number }>
    }

    async getForwardedMessages(forwardId: string) {
        return this.client.message.getForwardedMessages({ forward_id: forwardId }) as Promise<{
            messages: Array<{
                sender_name: string
                avatar_url: string
                time: number
                segments: IncomingSegment[]
            }>
        }>
    }

    async markMessageAsRead(messageScene: 'friend' | 'group' | 'temp', peerId: number, messageSeq: number) {
        return this.client.message.markMessageAsRead({
            message_scene: messageScene,
            peer_id: Math.abs(peerId),
            message_seq: messageSeq,
        })
    }

    async setGroupMemberCard(groupId: number, userId: number, card: string) {
        return this.client.group.setGroupMemberCard({
            group_id: Math.abs(groupId),
            user_id: Math.abs(userId),
            card,
        })
    }

    async setGroupMemberMute(groupId: number, userId: number, duration: number) {
        return this.client.group.setGroupMemberMute({
            group_id: Math.abs(groupId),
            user_id: Math.abs(userId),
            duration,
        })
    }

    async setGroupWholeMute(groupId: number, isMute: boolean) {
        return this.client.group.setGroupWholeMute({ group_id: Math.abs(groupId), is_mute: isMute })
    }

    async kickGroupMember(groupId: number, userId: number, rejectAddRequest = false) {
        return this.client.group.kickGroupMember({
            group_id: Math.abs(groupId),
            user_id: userId,
            reject_add_request: rejectAddRequest,
        })
    }

    async quitGroup(groupId: number) {
        return this.client.group.quitGroup({ group_id: Math.abs(groupId) })
    }

    async sendFriendNudge(userId: number, isSelf = false) {
        return this.client.friend.sendFriendNudge({ user_id: Math.abs(userId), is_self: isSelf })
    }

    async sendGroupNudge(groupId: number, userId: number) {
        return this.client.group.sendGroupNudge({ group_id: Math.abs(groupId), user_id: Math.abs(userId) })
    }

    async getCookies(domain: string) {
        return this.client.system.getCookies({ domain }) as Promise<{ cookies: string }>
    }

    async getCSRFToken() {
        return this.client.system.getCsrfToken() as Promise<{ csrf_token: string }>
    }

    async getGroupFiles(groupId: number, parentFolderId = '/') {
        return this.client.file.getGroupFiles({
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
        return this.client.file.getGroupFileDownloadUrl({
            group_id: Math.abs(groupId),
            file_id: fileId,
        }) as Promise<{
            download_url: string
        }>
    }

    async getPrivateFileDownloadUrl(userId: number, fileId: string, fileHash: string) {
        return this.client.file.getPrivateFileDownloadUrl({
            user_id: Math.abs(userId),
            file_id: fileId,
            file_hash: fileHash,
        }) as Promise<{ download_url: string }>
    }

    async uploadGroupFile(groupId: number, fileUri: string, fileName: string, parentFolderId = '/') {
        return this.client.file.uploadGroupFile({
            group_id: Math.abs(groupId),
            file_uri: fileUri,
            file_name: fileName,
            parent_folder_id: parentFolderId,
        }) as Promise<{ file_id: string }>
    }

    async uploadPrivateFile(userId: number, fileUri: string, fileName: string) {
        return this.client.file.uploadPrivateFile({
            user_id: Math.abs(userId),
            file_uri: fileUri,
            file_name: fileName,
        }) as Promise<{ file_id: string }>
    }

    async createGroupFolder(groupId: number, folderName: string) {
        return this.client.file.createGroupFolder({
            group_id: Math.abs(groupId),
            folder_name: folderName,
        }) as Promise<{
            folder_id: string
        }>
    }

    async deleteGroupFile(groupId: number, fileId: string) {
        return this.client.file.deleteGroupFile({ group_id: Math.abs(groupId), file_id: fileId })
    }

    async deleteGroupFolder(groupId: number, folderId: string) {
        return this.client.file.deleteGroupFolder({ group_id: Math.abs(groupId), folder_id: folderId })
    }

    async moveGroupFile(groupId: number, fileId: string, parentFolderId: string, targetFolderId: string) {
        return this.client.file.moveGroupFile({
            group_id: Math.abs(groupId),
            file_id: fileId,
            parent_folder_id: parentFolderId,
            target_folder_id: targetFolderId,
        })
    }

    async renameGroupFile(groupId: number, fileId: string, parentFolderId: string, newFileName: string) {
        return this.client.file.renameGroupFile({
            group_id: Math.abs(groupId),
            file_id: fileId,
            parent_folder_id: parentFolderId,
            new_file_name: newFileName,
        })
    }

    async getResourceTempUrl(resourceId: string) {
        return this.client.message.getResourceTempUrl({ resource_id: resourceId }) as Promise<{ url: string }>
    }

    dispose() {}
}
