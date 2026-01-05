<template>
    <div class="vac-card-window icalingua-theme-holder chat-window-root" ondragstart="return false;">
        <div class="loading-container" v-if="!ready">
            <div class="pace-activity" />
        </div>
        <Room
            v-else
            ref="room"
            :current-user-id="account"
            :rooms="[room]"
            :messages="messages"
            height="100vh"
            :rooms-loaded="true"
            :messages-loaded="messagesLoaded"
            :show-audio="false"
            :show-reaction-emojis="false"
            :show-new-messages-divider="false"
            :load-first-room="true"
            :accepted-files="'*'"
            :message-actions="[]"
            :single-room="true"
            :room-id="roomId"
            :show-rooms-list="false"
            :is-mobile="false"
            :menu-actions="[]"
            :show-send-icon="true"
            :show-files="true"
            :show-emojis="true"
            :show-footer="!isShutUp"
            :loading-rooms="false"
            :text-formatting="true"
            :linkify="linkify"
            :account="account"
            :username="username"
            :last-unread-count="0"
            :last-unread-at="false"
            :showSinglePanel="false"
            :removeHeaderEmotes="roomId < 0 && removeGroupNameEmotes"
            :usePanguJsRecv="usePanguJsRecv"
            :isSteamVrRunning="false"
            @send-message="sendMessage"
            @open-file="openImage"
            @pokefriend="pokeFriend"
            @download-image="downloadImage"
            @pokegroup="pokeGroup"
            @open-forward="openForward"
            @fetch-messages="fetchMessage"
        >
            <template v-slot:menu-icon>
                <i class="el-icon-more"></i>
            </template>
        </Room>
    </div>
</template>

<script>
import Room from '../components/vac-mod/ChatWindow/Room/Room.vue'
import { ipcRenderer } from 'electron'
import ipc from '../utils/ipc'
import '../utils/themes'

export default {
    name: 'ChatWindowView',
    components: {
        Room,
    },
    data() {
        return {
            roomId: 0,
            room: {
                roomId: 0,
                roomName: 'Loading...',
                users: [],
                unreadCount: 0,
                lastMessage: {},
            },
            messages: [],
            messagesLoaded: false,
            loading: true,
            ready: false, // 数据是否准备好
            account: 0,
            username: '',
            linkify: true,
            isShutUp: false,
            removeGroupNameEmotes: false,
            usePanguJsRecv: false,
        }
    },
    async created() {
        // 从路由参数获取 roomId
        this.roomId = parseInt(this.$route.params.roomId)

        // 获取设置
        const settings = await ipc.getSettings()
        this.linkify = settings.linkify
        this.removeGroupNameEmotes = settings.removeGroupNameEmotes
        this.usePanguJsRecv = settings.usePanguJsRecv

        // 获取账号信息 - 通过 getUin 获取
        this.account = await ipc.getUin()
        // 获取昵称
        const nick = await ipcRenderer.invoke('getNick')
        this.username = String(nick || this.account)

        // 获取房间信息
        const roomInfo = await ipc.getRoomInfo(this.roomId)
        if (roomInfo) {
            this.room = {
                ...roomInfo,
                users: roomInfo.users || [],
            }
            document.title =
                this.removeGroupNameEmotes && this.roomId < 0
                    ? this.removeGroupNameEmotesFunc(roomInfo.roomName)
                    : roomInfo.roomName
        }

        // 标记数据准备好了
        this.ready = true

        // 加载历史消息
        await this.fetchMessage(true)

        // 清除未读
        ipc.clearChatWindowUnread(this.roomId)

        // 监听 IPC 事件
        this.setupIpcListeners()
    },
    beforeDestroy() {
        // 移除 IPC 监听器
        ipcRenderer.removeAllListeners('addMessage')
        ipcRenderer.removeAllListeners('deleteMessage')
        ipcRenderer.removeAllListeners('hideMessage')
        ipcRenderer.removeAllListeners('revealMessage')
        ipcRenderer.removeAllListeners('renewMessage')
        ipcRenderer.removeAllListeners('setShutUp')
        ipcRenderer.removeAllListeners('clearUnread')
    },
    methods: {
        setupIpcListeners() {
            // 接收新消息
            ipcRenderer.on('addMessage', (_, { roomId, message }) => {
                if (roomId === this.roomId) {
                    this.messages = [...this.messages, message]
                }
            })

            // 删除消息
            ipcRenderer.on('deleteMessage', (_, messageId) => {
                const index = this.messages.findIndex((e) => e._id === messageId)
                if (index !== -1) {
                    this.messages[index].deleted = true
                    this.messages = [...this.messages]
                }
            })

            // 隐藏消息
            ipcRenderer.on('hideMessage', (_, messageId) => {
                const index = this.messages.findIndex((e) => e._id === messageId)
                if (index !== -1) {
                    this.messages[index].hide = true
                    this.messages = [...this.messages]
                }
            })

            // 显示消息
            ipcRenderer.on('revealMessage', (_, messageId) => {
                const index = this.messages.findIndex((e) => e._id === messageId)
                if (index !== -1) {
                    this.messages[index].reveal = true
                    this.messages = [...this.messages]
                }
            })

            // 更新消息
            ipcRenderer.on('renewMessage', (_, { roomId, messageId, message }) => {
                if (roomId === this.roomId) {
                    const index = this.messages.findIndex((e) => e._id === messageId)
                    if (index !== -1) {
                        this.messages[index] = { ...this.messages[index], ...message }
                        this.messages = [...this.messages]
                    }
                }
            })

            // 禁言状态
            ipcRenderer.on('setShutUp', (_, isShutUp) => {
                this.isShutUp = isShutUp
            })

            // 窗口聚焦时清除未读
            ipcRenderer.on('clearUnread', () => {
                ipc.clearChatWindowUnread(this.roomId)
            })
        },

        async fetchMessage(reset, number) {
            if (reset) {
                this.messages = []
                this.messagesLoaded = false
            }
            this.loading = true
            try {
                const offset = reset ? 0 : this.messages.length
                const msgs = await ipc.fetchMessage(this.roomId, offset)
                if (reset) {
                    this.messages = msgs || []
                } else {
                    this.messages = [...(msgs || []), ...this.messages]
                }
                this.messagesLoaded = true
            } catch (e) {
                console.error('Failed to fetch messages:', e)
            } finally {
                this.loading = false
            }
        },

        sendMessage(data) {
            ipc.sendMessage({
                ...data,
                roomId: this.roomId,
                room: this.room,
            })
        },

        openImage: ipc.downloadFileByMessageData,
        downloadImage: ipc.downloadImage,

        pokeGroup(uin) {
            const group = -this.roomId
            ipc.sendGroupPoke(group, uin)
            if (this.$refs.room) {
                this.$refs.room.focusTextarea()
            }
        },

        pokeFriend() {
            if (this.roomId > 0) {
                ipc.sendGroupPoke(this.roomId, this.roomId)
            }
            if (this.$refs.room) {
                this.$refs.room.focusTextarea()
            }
        },

        openForward(e) {
            ipc.openForward(e.resId, e.fileName)
        },

        removeGroupNameEmotesFunc(name) {
            if (!name) return name
            return name.replace(/\[.*?\]/g, '').trim() || name
        },
    },
}
</script>

<style scoped>
.chat-window-root {
    height: 100vh;
    width: 100%;
}

.loading-container {
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
}

::v-deep .vac-col-messages {
    height: 100vh;
}
</style>

<style lang="scss">
@import '../components/vac-mod/styles/index.scss';

.chat-window-root {
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
