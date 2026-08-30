<template>
    <div class="vac-card-window icalingua-theme-holder chat-window-root" ondragstart="return false">
        <div class="loading-container" v-if="!ready">
            <div class="pace-activity" />
        </div>
        <Room
            v-else
            ref="room"
            :current-user-id="0"
            :rooms="[room]"
            :messages="messages"
            height="100vh"
            :rooms-loaded="true"
            :messages-loaded="messagesLoaded"
            :show-audio="false"
            :show-reaction-emojis="false"
            :show-new-messages-divider="false"
            :load-first-room="true"
            accepted-files="image/*"
            :message-actions="[]"
            :single-room="true"
            :room-id="room.roomId"
            :show-footer="false"
            :show-header="false"
            :show-rooms-list="false"
            :is-mobile="false"
            :menu-actions="[]"
            :show-send-icon="true"
            :show-files="true"
            :show-emojis="true"
            :loading-rooms="false"
            :text-formatting="true"
            :linkify="linkify"
            :account="account"
            :username="username"
            :usePanguJsRecv="usePanguJsRecv"
            @fetch-messages="loadMoreMessages"
            @download-image="downloadImage"
            @open-file="openImage"
            @open-forward="openForward"
        />
    </div>
</template>

<script>
import Room from '../components/vac-mod/ChatWindow/Room/Room'
import ipc from '../utils/ipc'
import { createRendererLifecycleScope } from '../utils/rendererLifecycleScope'
import { messageIdKey } from '../utils/messageOrder'
import '../utils/themes'

const MEMBER_HISTORY_PAGE_SIZE = 20

export default {
    name: 'MemberHistoryView',
    data() {
        return {
            room: {
                roomId: 1,
                roomName: 'Loading...',
                users: [
                    { _id: 3, username: '3' },
                    { _id: 31, username: '3' },
                    { _id: 32, username: '3' },
                ],
            },
            messages: [],
            messagesLoaded: false,
            ready: false,
            linkify: true,
            usePanguJsRecv: false,
            senderId: 0,
            roomId: 0,
            senderName: '',
            loading: false,
            account: 0,
            username: '',
            historyRequestId: 0,
            snapshotTime: null,
            memberHistorySetupReady: false,
            pendingMemberHistory: null,
        }
    },
    async created() {
        this.lifecycleScope = createRendererLifecycleScope()
        document.title = '查看发言记录'
        // 主进程在 did-finish-load 后只发送一次初始化事件，必须先注册监听器，避免被前面的 await 丢弃。
        this.lifecycleScope.onIpc('initMemberHistory', (event, payload) => {
            if (!this.memberHistorySetupReady) {
                this.pendingMemberHistory = payload
                return
            }
            this.startMemberHistoryInitialization(payload)
        })
        try {
            const settings = await ipc.getSettings()
            this.linkify = settings.linkify
            this.usePanguJsRecv = settings.usePanguJsRecv
            this.account = await ipc.getUin()
            this.username = await ipc.getNick()
        } catch (e) {
            console.error('Failed to initialize member history view:', e)
        } finally {
            this.memberHistorySetupReady = true
            if (this.pendingMemberHistory !== null && !this._isBeingDestroyed && !this._isDestroyed) {
                const payload = this.pendingMemberHistory
                this.pendingMemberHistory = null
                this.startMemberHistoryInitialization(payload)
            }
        }
    },
    beforeDestroy() {
        this.historyRequestId++
        this.lifecycleScope?.dispose()
    },
    components: {
        Room,
    },
    methods: {
        startMemberHistoryInitialization(payload) {
            if (this._isBeingDestroyed || this._isDestroyed) return
            this.initializeMemberHistory(payload).catch((error) => {
                console.error('Failed to initialize member history:', error)
                if (this._isBeingDestroyed || this._isDestroyed) return
                this.loading = false
                this.ready = true
            })
        },
        async initializeMemberHistory({ senderId, roomId, senderName }) {
            const requestId = ++this.historyRequestId
            this.senderId = senderId
            this.roomId = roomId
            this.senderName = senderName
            this.snapshotTime = Date.now()
            this.room.roomId = senderId
            this.messages = []
            this.messagesLoaded = false
            this.ready = false

            if (roomId === 0) {
                document.title = `${senderName} 在所有群的发言记录`
                this.room.roomName = `${senderName} 在所有群的发言记录`
            } else {
                let groupName = ''
                let groupNumber = ''
                try {
                    const roomInfo = await ipc.getRoomInfo(roomId)
                    if (roomInfo && roomInfo.roomName) {
                        groupName = roomInfo.roomName
                        if (roomId < 0) {
                            groupNumber = String(-roomId)
                        }
                    }
                } catch (e) {}
                if (requestId !== this.historyRequestId) return
                const titleSuffix =
                    groupName && groupNumber ? `在 ${groupName}（${groupNumber}）` : groupName ? `在 ${groupName}` : ''
                document.title = `${senderName} ${titleSuffix}的发言记录`
                this.room.roomName = `${senderName} ${titleSuffix}的发言记录`
            }
            // 加载第一页消息
            await this.fetchInitialMessages(requestId)
        },
        getScrollContainer() {
            return this.$refs.room?.$refs?.scrollContainer || null
        },
        isCurrentHistoryRequest(requestId) {
            return requestId === this.historyRequestId && !this._isBeingDestroyed && !this._isDestroyed
        },
        scheduleScrollToBottom(requestId) {
            this.$nextTick(() => {
                if (!this.isCurrentHistoryRequest(requestId)) return
                this.lifecycleScope.animationFrame(() => {
                    if (!this.isCurrentHistoryRequest(requestId)) return
                    const element = this.getScrollContainer()
                    if (element) element.scrollTo({ top: element.scrollHeight })
                })
            })
        },
        captureScrollAnchor() {
            const element = this.getScrollContainer()
            if (!element) return null

            const containerRect = element.getBoundingClientRect()
            const messageElements = element.querySelectorAll('.vac-message-box[id]')
            for (const messageElement of messageElements) {
                const messageRect = messageElement.getBoundingClientRect()
                if (messageRect.bottom > containerRect.top && messageRect.top < containerRect.bottom) {
                    return {
                        element,
                        messageId: messageElement.id,
                        top: messageRect.top,
                        scrollTop: element.scrollTop,
                        scrollHeight: element.scrollHeight,
                    }
                }
            }

            return {
                element,
                messageId: null,
                top: 0,
                scrollTop: element.scrollTop,
                scrollHeight: element.scrollHeight,
            }
        },
        restoreScrollAnchor(anchor, requestId, attempt = 0) {
            if (!anchor) return
            this.lifecycleScope.animationFrame(() => {
                if (!this.isCurrentHistoryRequest(requestId)) return
                const element = this.getScrollContainer()
                if (!element) return

                const messageElement = anchor.messageId ? document.getElementById(anchor.messageId) : null
                if (messageElement) {
                    element.scrollTop += messageElement.getBoundingClientRect().top - anchor.top
                } else if (attempt === 0) {
                    element.scrollTop = anchor.scrollTop + element.scrollHeight - anchor.scrollHeight
                }

                // 图片或富文本的尺寸可能在首帧后才稳定，再校正两帧避免滚动缓慢漂移。
                if (attempt < 2) this.restoreScrollAnchor(anchor, requestId, attempt + 1)
            })
        },
        async fetchInitialMessages(requestId = this.historyRequestId) {
            this.loading = true
            let msgs = []
            try {
                const result = await ipc.fetchMessagesBySender(this.roomId, this.senderId, 0, this.snapshotTime)
                msgs = Array.isArray(result) ? result : []
            } catch (e) {
                console.error('Failed to fetch initial messages:', e)
            }

            if (!this.isCurrentHistoryRequest(requestId)) return
            this.messagesLoaded = msgs.length < MEMBER_HISTORY_PAGE_SIZE
            this.loading = false
            // 先显示 Room 组件（messages 为空），让 watcher 以空数组初始化
            this.ready = true
            // 等待 Room 组件挂载完成
            await this.$nextTick()
            if (!this.isCurrentHistoryRequest(requestId)) return
            this.messages = this.processMessages(msgs)
            // 等消息渲染完成后滚动到底部
            this.scheduleScrollToBottom(requestId)
        },
        async loadMoreMessages() {
            if (this.loading) return
            this.loading = true
            const requestId = this.historyRequestId
            try {
                const result = await ipc.fetchMessagesBySender(
                    this.roomId,
                    this.senderId,
                    this.messages.length,
                    this.snapshotTime,
                )
                const msgs = Array.isArray(result) ? result : []
                if (!this.isCurrentHistoryRequest(requestId)) return

                const existingMessageIds = new Set(this.messages.map((message) => messageIdKey(message._id)))
                const olderMessages = this.processMessages(msgs).filter((message) => {
                    const key = messageIdKey(message._id)
                    if (existingMessageIds.has(key)) return false
                    existingMessageIds.add(key)
                    return true
                })

                if (olderMessages.length) {
                    const anchor = this.captureScrollAnchor()
                    this.messages = [...olderMessages, ...this.messages]
                    await this.$nextTick()
                    this.restoreScrollAnchor(anchor, requestId)
                }
                if (msgs.length < MEMBER_HISTORY_PAGE_SIZE || !olderMessages.length) this.messagesLoaded = true
            } catch (e) {
                console.error('Failed to fetch more messages:', e)
                if (this.isCurrentHistoryRequest(requestId)) this.messagesLoaded = true
            } finally {
                if (this.isCurrentHistoryRequest(requestId)) this.loading = false
            }
        },
        processMessages(msgs) {
            // 所有群模式：修改头像和用户名以显示群信息
            if (this.roomId === 0) {
                return msgs.map((msg) => {
                    const processed = { ...msg }
                    if (msg._roomAvatar) {
                        processed.head_img = msg._roomAvatar
                    }
                    if (msg._roomName) {
                        processed.username = `[${msg._roomName}] ${msg.username}`
                    }
                    return processed
                })
            }
            return msgs
        },
        openForward(e) {
            ipc.openForward(e.resId, e.fileName, e.fallbackResId)
        },
        openImage: ipc.downloadFileByMessageData,
        downloadImage: ipc.downloadImage,
    },
}
</script>

<style scoped>
::v-deep .vac-col-messages {
    height: 100vh;
}
.chat-window-root {
    height: 100vh;
}
.loading-container {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
}
</style>

<style lang="scss">
@import '../components/vac-mod/styles/index.scss';

.vac-card-window {
    min-height: 100vh;
    display: block;
    background: var(--chat-content-bg-color);
    color: var(--chat-color);
    overflow-wrap: break-word;
    position: relative;
    white-space: normal;
    border: var(--chat-container-border);
    border-radius: var(--chat-container-border-radius);
    box-shadow: var(--chat-container-box-shadow);
    -webkit-tap-highlight-color: transparent;

    * {
        font-family: inherit;
    }

    a {
        color: #0d579c;
        font-weight: 500;
    }

    .vac-chat-container {
        height: 100%;
        display: flex;

        input {
            min-width: 10px;
        }

        textarea,
        input[type='text'],
        input[type='search'] {
            -webkit-appearance: none;
        }
    }
}
</style>
