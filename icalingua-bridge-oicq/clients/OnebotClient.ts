import { random } from 'lodash'
import { EventEmitter } from 'eventemitter3'
import { Gender, MessageElem, Sendable } from 'oicq-icalingua-plus-plus'
import WebSocket from 'ws'

type BaseEvent = {
    self_id: number
    time: number
}

type BaseMessage = BaseEvent & {
    message_id: number
    user_id: number
    message: MessageElem[]
    raw_message: string
    font: number
    sender: {
        user_id: number
        nickname: string
        sex: Gender
        age: number
    }
    post_type: 'message' | 'message_sent'
}

export type PrivateMessage = BaseMessage & {
    message_type: 'private'
    sub_type: 'friend' | 'group' | 'group_self' | 'other'
    temp_source?: number
}

export type GroupMessage = BaseMessage & {
    message_type: 'group'
    sub_type: 'normal' | 'anonymous' | 'notice'
    group_id: number
    anonymous?: {
        id: number
        name: string
        flag: string
    }
}

export default class extends EventEmitter<{
    message: [GroupMessage | PrivateMessage]
    friendRecall: [
        BaseEvent & {
            post_type: 'notice'
            notice_type: 'friend_recall'
            user_id: number
            message_id: number
        },
    ]
    groupRecall: [
        BaseEvent & {
            post_type: 'notice'
            notice_type: 'group_recall'
            group_id: number
            user_id: number
            operator_id: number
            message_id: number
        },
    ]
    friendPoke: [
        BaseEvent & {
            post_type: 'notice'
            notice_type: 'notify'
            sub_type: 'poke'
            sender_id: number
            user_id: number
            target_id: number
        },
    ]
    groupPoke: [
        BaseEvent & {
            post_type: 'notice'
            notice_type: 'notify'
            sub_type: 'poke'
            group_id: number
            user_id: number
            target_id: number
        },
    ]
    groupIncrease: [
        BaseEvent & {
            post_type: 'notice'
            notice_type: 'group_increase'
            sub_type: 'approve' | 'invite'
            group_id: number
            operator_id: number
            user_id: number
        },
    ]
    groupDecrease: [
        BaseEvent & {
            post_type: 'notice'
            notice_type: 'group_decrease'
            sub_type: 'leave' | 'kick' | 'kick_me'
            group_id: number
            operator_id: number
            user_id: number
        },
    ]
    groupBan: [
        BaseEvent & {
            post_type: 'notice'
            notice_type: 'group_ban'
            sub_type: 'ban' | 'lift_ban'
            group_id: number
            operator_id: number
            user_id: number
            duration: number
        },
    ]
    groupAdmin: [
        BaseEvent & {
            post_type: 'notice'
            notice_type: 'group_admin'
            sub_type: 'set' | 'unset'
            group_id: number
            user_id: number
        },
    ]
    groupTitle: [
        BaseEvent & {
            post_type: 'notice'
            notice_type: 'notify'
            sub_type: 'title'
            group_id: number
            user_id: number
            title: string
        },
    ]
    friendAdd: [
        BaseEvent & {
            post_type: 'notice'
            notice_type: 'friend_add'
            user_id: number
        },
    ]
}> {
    private socket: WebSocket
    private readonly echoMap: { [key: string]: { resolve: (result: any) => void; reject: (result: any) => void } } = {}

    public constructor(private readonly url: string) {
        super()
    }

    public connect() {
        return new Promise((resolve) => {
            this.socket = new WebSocket(this.url)
            this.socket.on('open', resolve)
            this.socket.on('message', (event) => this.handleWebSocketMessage(event.toString()))
        })
    }

    private async handleWebSocketMessage(message: string) {
        console.log('receive', message)
        const data = JSON.parse(message)
        if (data.echo) {
            const promise = this.echoMap[data.echo]
            if (!promise) return
            if (data.status === 'ok') {
                promise.resolve(data.data)
            } else {
                promise.reject(data.msg + '\n' + data.wording)
            }
            return
        } else if (data.post_type === 'message' || data.post_type === 'message_sent') {
            this.emit('message', data)
        } else if (data.post_type === 'notice' && data.notice_type === 'friend_recall') {
            this.emit('friendRecall', data)
        } else if (data.post_type === 'notice' && data.notice_type === 'group_recall') {
            this.emit('groupRecall', data)
        } else if (data.post_type === 'notice' && data.sub_type === 'poke') {
            if ('group_id' in data) this.emit('groupPoke', data)
            else this.emit('friendPoke', data)
        } else if (data.post_type === 'notice' && data.notice_type === 'group_increase') {
            this.emit('groupIncrease', data)
        } else if (data.post_type === 'notice' && data.notice_type === 'group_decrease') {
            this.emit('groupDecrease', data)
        } else if (data.post_type === 'notice' && data.notice_type === 'group_ban') {
            this.emit('groupBan', data)
        } else if (data.post_type === 'notice' && data.notice_type === 'group_admin') {
            this.emit('groupAdmin', data)
        } else if (data.post_type === 'notice' && data.sub_type === 'title') {
            this.emit('groupTitle', data)
        } else if (data.post_type === 'notice' && data.notice_type === 'friend_add') {
            this.emit('friendAdd', data)
        }
    }

    private async callApi<T>(action: string, params: { [key: string]: any } = {}) {
        return new Promise<T>((resolve, reject) => {
            const echo = `${new Date().getTime()}${random(100000, 999999)}`
            this.echoMap[echo] = { resolve, reject }
            this.socket.send(JSON.stringify({ action, params, echo }))
            console.log('send', JSON.stringify({ action, params, echo }))
        })
    }

    public getGroupInfo = (group_id: number, no_cache = false) =>
        this.callApi<{
            //群号
            group_id: number
            //群名称
            group_name: string
            //群备注
            group_memo: string
            //群创建时间
            group_create_time: number
            //群等级
            group_level: number
            //成员数
            member_count: number
            //最大成员数（群容量）
            max_member_count: number
        }>('get_group_info', { group_id, no_cache })

    public sendGroupMessage = (group_id: number, message: Sendable) =>
        this.callApi<{
            message_id: number
        }>('send_group_msg', { group_id, message })
    public sendPrivateMessage = (user_id: number, message: Sendable) =>
        this.callApi<{
            message_id: number
        }>('send_private_msg', { user_id, message })
    public getLoginInfo = () =>
        this.callApi<{
            user_id: number
            nickname: string
        }>('get_login_info')
    public getVersionInfo = () =>
        this.callApi<{
            app_name: 'go-cqhttp'
            app_version: string
            app_full_name: string
            protocol_version: string
            coolq_edition: 'pro'
            coolq_directory: string
            'go-cqhttp': true
            plugin_version: '4.15.0'
            plugin_build_number: 99
            plugin_build_configuration: 'release'
            runtime_version: string
            runtime_os: string
            version: string
            //当前登陆使用协议类型
            protocol: number
        }>('get_version_info')
    public getStatus = () =>
        this.callApi<{
            online: boolean
        }>('get_status')
    public getMessage = (message_id: number) =>
        this.callApi<{
            group: boolean
            group_id: number
            message_id: number
            real_id: number
            message_type: string
            sender: { nickname: string; user_id: number }
            time: number
            message: MessageElem[]
            raw_message: string
        }>('get_msg', { message_id })
    public setFriendAddRequest = (flag: string, approve = true, remark = '') =>
        this.callApi('set_friend_add_request', { flag, approve, remark })
    public setGroupAddRequest = (flag: string, approve = true, sub_type: 'add' | 'invite' = 'add', reason = '') =>
        this.callApi('set_group_add_request', { flag, approve, sub_type, reason })
    public deleteMessage = (message_id: number) => this.callApi('delete_msg', { message_id })
    public getGroupFileUrl = (group_id: number, file_id: string, busid: number) =>
        this.callApi<{
            url: string
        }>('get_group_file_url', { group_id, file_id, busid })
    public getForwardMessage = (message_id: string) =>
        this.callApi<{
            messages: [
                {
                    content: MessageElem[]
                    sender: {
                        nickname: '发送者A'
                        user_id: 10086
                    }
                    time: 1595694374
                },
                {
                    content: MessageElem[]
                    sender: {
                        nickname: '发送者B'
                        user_id: 10087
                    }
                    time: 1595694393
                },
            ]
        }>('get_forward_msg', { message_id })
    public sendGroupSign = (group_id: number) => this.callApi('send_group_sign', { group_id })
    public getGroupList = (no_cache = false) =>
        this.callApi<Awaited<ReturnType<typeof this.getGroupInfo>>[]>('get_group_list', { no_cache })
    public getStrangerInfo = (user_id: number, no_cache = false) =>
        this.callApi<{
            user_id: number
            nickname: string
            sex: string
            age: number
            qid: string
            level: number
            login_days: number
        }>('get_stranger_info', { no_cache, user_id })
    public getFriendList = () =>
        this.callApi<
            {
                user_id: number
                nickname: string
                remark: string
            }[]
        >('get_friend_list')
    public getGroupMemberInfo = (group_id: number, user_id: number, no_cache = false) =>
        this.callApi<{
            group_id: number
            user_id: number
            nickname: string
            card: string
            sex: string
            age: number
            area: string
            join_time: number
            last_sent_time: number
            level: string
            role: string
            unfriendly: boolean
            title: string
            title_expire_time: number
            card_changeable: boolean
            shut_up_timestamp: number
        }>('get_group_member_info', { group_id, user_id, no_cache })
    public setGroupCard = (group_id: number, user_id: number, card: string) =>
        this.callApi('set_group_card', { group_id, user_id, card })
    public getGroupMemberList = (group_id: number, no_cache = false) =>
        this.callApi<Awaited<ReturnType<typeof this.getGroupMemberInfo>>[]>('get_group_member_list', {
            group_id,
            no_cache,
        })
    public markMessageAsRead = (message_id: number) => this.callApi('mark_msg_as_read', { message_id })
    public sendGroupForwardMessage = (group_id: number, messages: { type: 'node'; data: any }[]) =>
        this.callApi<{
            message_id: number
            forward_id: string
        }>('send_group_forward_msg', { group_id, messages })
    public sendPrivateForwardMessage = (user_id: number, messages: { type: 'node'; data: any }[]) =>
        this.callApi<{
            message_id: number
            forward_id: string
        }>('send_private_forward_msg', { user_id, messages })
    public setGroupBan = (group_id: number, user_id: number, duration: number) =>
        this.callApi('set_group_ban', { group_id, user_id, duration })
    public setGroupWholeBan = (group_id: number, enable: boolean) =>
        this.callApi('set_group_whole_ban', { group_id, enable })
    public setGroupAnonymousBan = (group_id: number, anonymous_flag: string, duration: number) =>
        this.callApi('set_group_anonymous_ban', { group_id, anonymous_flag, duration })
    public setGroupKick = (group_id: number, user_id: number, reject_add_request = false) =>
        this.callApi('set_group_kick', { group_id, user_id, reject_add_request })
    public setGroupLeave = (group_id: number, is_dismiss = true) =>
        this.callApi('set_group_leave', { group_id, is_dismiss })
    public getGroupMessageHistory = (group_id: number, message_seq?: number) =>
        this.callApi<{
            messages: GroupMessage[]
        }>('get_group_msg_history', { group_id, message_seq })
}
