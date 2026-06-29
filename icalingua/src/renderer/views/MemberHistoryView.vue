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
import { ipcRenderer } from 'electron'
import ipc from '../utils/ipc'
import '../utils/themes'

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
        }
    },
    async created() {
        document.title = '查看发言记录'
        const settings = await ipc.getSettings()
        this.linkify = settings.linkify
        this.usePanguJsRecv = settings.usePanguJsRecv
        this.account = await ipc.getUin()
        this.username = await ipc.getNick()
        ipcRenderer.on('initMemberHistory', async (event, { senderId, roomId, senderName }) => {
            this.senderId = senderId
            this.roomId = roomId
            this.senderName = senderName
            this.room.roomId = senderId
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
                const titleSuffix =
                    groupName && groupNumber ? `在 ${groupName}（${groupNumber}）` : groupName ? `在 ${groupName}` : ''
                document.title = `${senderName} ${titleSuffix}的发言记录`
                this.room.roomName = `${senderName} ${titleSuffix}的发言记录`
            }
            // 加载第一页消息
            await this.fetchInitialMessages()
        })
    },
    components: {
        Room,
    },
    methods: {
        async fetchInitialMessages() {
            this.loading = true
            let msgs
            try {
                msgs = await ipc.fetchMessagesBySender(this.roomId, this.senderId, 0)
                console.log('Fetched initial messages:', msgs)
                if (!msgs || msgs.length < 20) {
                    this.messagesLoaded = true
                }
            } catch (e) {
                console.error('Failed to fetch initial messages:', e)
                this.messagesLoaded = true
            }
            this.loading = false
            // 先显示 Room 组件（messages 为空），让 watcher 以空数组初始化
            this.ready = true
            // 等待 Room 组件挂载完成
            await this.$nextTick()
            if (msgs && msgs.length) {
                this.messages = this.processMessages(msgs)
            }
            // 等消息渲染完成后滚动到底部
            this.$nextTick(() => {
                setTimeout(() => {
                    if (this.$refs.room && this.$refs.room.$refs.scrollContainer) {
                        const el = this.$refs.room.$refs.scrollContainer
                        el.scrollTo({ top: el.scrollHeight })
                    }
                }, 100)
            })
        },
        async loadMoreMessages() {
            if (this.loading) return
            this.loading = true
            try {
                const msgs = await ipc.fetchMessagesBySender(this.roomId, this.senderId, this.messages.length)
                if (msgs && msgs.length) {
                    this.messages = [...this.processMessages(msgs), ...this.messages]
                }
                if (!msgs || msgs.length < 20) {
                    this.messagesLoaded = true
                }
            } catch (e) {
                console.error('Failed to fetch more messages:', e)
                this.messagesLoaded = true
            }
            this.loading = false
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
            ipc.openForward(e.resId, e.fileName)
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
