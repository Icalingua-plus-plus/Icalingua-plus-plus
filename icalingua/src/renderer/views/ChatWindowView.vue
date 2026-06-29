<template>
    <div class="vac-card-window icalingua-theme-holder chat-window-root" ondragstart="return false">
        <div class="loading-container" v-if="!ready">
            <div class="pace-activity" />
        </div>
        <div v-else class="chat-window-body" :class="{ 'chat-window-body-bottom': stickerPanelBottom }">
            <div class="chat-window-main">
                <Room
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
                    :canLoadAfter="isInMiddle"
                    :standalone="true"
                    @send-message="sendMessage"
                    @open-file="openImage"
                    @pokefriend="pokeFriend"
                    @stickers-panel="panel = panel === 'stickers' ? '' : 'stickers'"
                    @close-stickers-panel="panel = ''"
                    @download-image="downloadImage"
                    @pokegroup="pokeGroup"
                    @open-forward="openForward"
                    @open-choose-file-type="openChooseFileType"
                    @fetch-messages="fetchMessage"
                    @fetch-messages-after="fetchMessageAfter"
                >
                    <template v-slot:menu-icon>
                        <i class="el-icon-more"></i>
                    </template>
                </Room>
            </div>
            <template v-if="stickerPanelBottom">
                <div class="sticker-bottom-resizer" v-show="panel" @mousedown="startStickerHeightResize"></div>
                <transition name="vac-fade-stickers">
                    <div
                        v-show="panel"
                        class="panel-bottom"
                        :style="{ height: stickerPanelHeight + 'px' }"
                        ref="stickerPanel"
                    >
                        <transition name="vac-fade-stickers">
                            <Stickers
                                v-show="panel === 'stickers'"
                                :open="panel === 'stickers'"
                                :bottomMode="true"
                                @send="sendSticker"
                                @close="panel = ''"
                                @selectEmoji="
                                    $refs.room.useMessageContent($event.data)
                                    $refs.room.focusTextarea()
                                "
                                @selectFace="
                                    $refs.room.useMessageContent(`[Face: ${$event}]`)
                                    $refs.room.focusTextarea()
                                "
                                @sendLottie="sendLottie"
                            />
                        </transition>
                    </div>
                </transition>
            </template>
            <transition name="vac-fade-stickers" v-else>
                <div
                    :style="{ minWidth: '300px', width: '320px', maxWidth: '500px' }"
                    v-show="panel"
                    class="panel-right"
                    ref="stickerPanel"
                >
                    <transition name="vac-fade-stickers">
                        <Stickers
                            v-show="panel === 'stickers'"
                            :open="panel === 'stickers'"
                            @send="sendSticker"
                            @close="panel = ''"
                            @selectEmoji="
                                $refs.room.useMessageContent($event.data)
                                $refs.room.focusTextarea()
                            "
                            @selectFace="
                                $refs.room.useMessageContent(`[Face: ${$event}]`)
                                $refs.room.focusTextarea()
                            "
                            @sendLottie="sendLottie"
                        />
                    </transition>
                </div>
            </transition>
        </div>
        <el-dialog
            :title="tempFileName"
            :visible.sync="chooseFileTypeShown"
            :close-on-click-modal="false"
            @close="tempFile = null"
        >
            <div class="random-select">
                <el-button @click="chooseFileType('file')" icon="el-icon-paperclip">普通文件</el-button>
                <el-button @click="chooseFileType('media')" icon="el-icon-picture-outline">识别媒体</el-button>
            </div>
        </el-dialog>
    </div>
</template>

<script>
import Room from '../components/vac-mod/ChatWindow/Room/Room.vue'
import Stickers from '../components/Stickers.vue'
import { ipcRenderer } from 'electron'
import ipc from '../utils/ipc'
import '../utils/themes'

export default {
    name: 'ChatWindowView',
    components: {
        Room,
        Stickers,
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
            isInMiddle: false, // 是否从中间加载（用于支持向下翻页）
            targetMessageId: null, // 定位的目标消息 ID
            pendingGotoMessageId: null, // 等待定位的消息 ID（窗口初始化时使用）
            panel: '', // 表情面板状态
            stickerPanelWidth: 0, // 记录面板宽度，关闭时缩回
            stickerPanelBottom: false, // 是否启用底部表情面板模式
            stickerPanelHeight: 320, // 底部模式时的面板高度（px）
            chooseFileTypeShown: false, // 选择文件类型对话框
            tempFile: null, // 临时文件
            tempFileName: '', // 临时文件名
        }
    },
    watch: {
        panel(val, oldVal) {
            // 底部模式下面板嵌入窗口内部，不再扩展窗口宽度
            if (this.stickerPanelBottom) return
            if (val && !oldVal) {
                // 面板打开：等渲染完成后测量实际宽度再扩展窗口
                this.$nextTick(() => {
                    const el = this.$refs.stickerPanel
                    if (el) {
                        this.stickerPanelWidth = el.offsetWidth
                        ipcRenderer.send('resizeChatWindow', this.stickerPanelWidth)
                    }
                })
            } else if (!val && oldVal) {
                // 面板关闭：缩回窗口
                if (this.stickerPanelWidth > 0) {
                    ipcRenderer.send('resizeChatWindow', -this.stickerPanelWidth)
                    this.stickerPanelWidth = 0
                }
            }
        },
    },
    async created() {
        // 从路由参数获取 roomId
        this.roomId = parseInt(this.$route.params.roomId)

        // 获取设置
        const settings = await ipc.getSettings()
        this.linkify = settings.linkify
        this.removeGroupNameEmotes = settings.removeGroupNameEmotes
        this.usePanguJsRecv = settings.usePanguJsRecv
        this.stickerPanelBottom = settings.stickerPanelBottom
        this.stickerPanelHeight = settings.stickerPanelHeight || 320

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

        // 先设置 IPC 监听器，确保能接收到 gotoMessage 事件
        this.setupIpcListeners()

        console.log('ChatWindowView created, pendingGotoMessageId:', this.pendingGotoMessageId)

        // 如果有待定位的消息，直接用 gotoMessage 加载，否则加载最新消息
        if (this.pendingGotoMessageId) {
            const messageId = this.pendingGotoMessageId
            this.pendingGotoMessageId = null
            console.log('Using gotoMessage to load:', messageId)
            await this.gotoMessage(messageId)
        } else {
            // 加载历史消息
            console.log('Loading latest messages')
            await this.fetchMessage(true)
        }

        // 清除未读
        ipc.clearChatWindowUnread(this.roomId)
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
        ipcRenderer.removeAllListeners('gotoMessage')
        ipcRenderer.removeAllListeners('sendDice')
        ipcRenderer.removeAllListeners('sendRps')
        ipcRenderer.removeAllListeners('closePanel')
    },
    methods: {
        setupIpcListeners() {
            // 阻止默认拖拽行为以支持文件拖入
            document.addEventListener('dragover', (event) => {
                event.preventDefault()
                event.stopPropagation()
            })

            // 接收新消息
            ipcRenderer.on('addMessage', (_, { roomId, message }) => {
                if (roomId === this.roomId) {
                    const index = this.messages.findIndex((e) => e._id === message._id)
                    if (index !== -1) {
                        console.warning(`[WARN] Duplicated message ID ${message._id}`, message, this.messages[index])
                        return
                    }
                    this.messages = [...this.messages, message]
                }
            })

            // 删除消息
            ipcRenderer.on('deleteMessage', (_, messageId) => {
                const index = this.messages.findIndex((e) => e._id === messageId)
                if (index !== -1) {
                    this.messages[index].deleted = Date.now()
                    this.messages[index].reveal = false
                    this.messages = [...this.messages]
                }
            })

            // 隐藏消息
            ipcRenderer.on('hideMessage', (_, messageId) => {
                const index = this.messages.findIndex((e) => e._id === messageId)
                if (index !== -1) {
                    this.messages[index].hide = true
                    this.messages[index].reveal = false
                    this.messages = [...this.messages]
                }
            })

            // 显示消息
            ipcRenderer.on('revealMessage', (_, messageId) => {
                const index = this.messages.findIndex((e) => e._id === messageId)
                if (index !== -1) {
                    this.messages[index].hide = false
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

            // 定位到指定消息
            ipcRenderer.on('gotoMessage', async (_, messageId) => {
                console.log('gotoMessage event received:', messageId, 'ready:', this.ready, 'loading:', this.loading)
                // 如果消息还没加载完，保存待定位的 ID
                if (!this.ready || this.loading) {
                    console.log('Saving pendingGotoMessageId:', messageId)
                    this.pendingGotoMessageId = messageId
                } else {
                    console.log('Calling gotoMessage directly')
                    await this.gotoMessage(messageId)
                }
            })

            // 发送骰子（菜单操作）
            ipcRenderer.on('sendDice', (_) => {
                this.sendDice(0)
            })

            // 发送猜拳（菜单操作）
            ipcRenderer.on('sendRps', (_) => {
                this.sendRps(0)
            })

            // 关闭表情面板
            ipcRenderer.on('closePanel', () => {
                this.panel = ''
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

        async sendMessage(data) {
            let { content, file, replyMessage, b64img, imgpath, sticker, messageType, resend } = data
            if (file) {
                if (file.type.includes('image')) {
                    if (file.size >= 10485760) {
                        this.$message.warning('图片较大，发送可能失败，软件可能卡死')
                    }
                    const crypto = require('crypto')
                    const buffer = Buffer.from(await file.blob.arrayBuffer())
                    const imgHashStr = crypto.createHash('md5').update(buffer).digest('hex').toUpperCase()
                    const b64 = buffer.toString('base64')
                    b64img = `data:${file.type};base64,${b64}`
                    imgpath = imgpath || `send_https://gchat.qpic.cn/gchatpic_new/0/0-0-${imgHashStr}/0`
                    file = null
                } else if (file.type.startsWith('audio')) {
                    if (file.size >= 10485760) {
                        this.$message.warning('语音较大，发送可能失败，软件可能卡死')
                    }
                    const buffer = Buffer.from(await file.blob.arrayBuffer())
                    b64img = `data:audio;base64,${buffer.toString('base64')}`
                    file = {
                        type: file.type,
                        size: file.size,
                        path: file.path,
                    }
                } else
                    file = {
                        type: file.type,
                        size: file.size,
                        path: file.path,
                    }
            }
            if (resend) ipc.deleteMessage(this.roomId, resend)
            ipc.sendMessage({
                content,
                roomId: this.roomId,
                file,
                replyMessage,
                room: this.room,
                b64img,
                imgpath,
                sticker,
                messageType,
            })
        },

        openImage: ipc.downloadFileByMessageData,
        downloadImage: ipc.downloadImage,

        async openChooseFileType(file) {
            if (!file) return
            if ((await ipc.getSettings()).disableChooseFileType) return this.$refs.room.onFileChange(file)
            this.chooseFileTypeShown = true
            this.tempFile = file
            this.tempFileName = '选择文件 ' + file[0].name + ' 的发送方式'
        },

        chooseFileType(type) {
            this.chooseFileTypeShown = false
            this.$refs.room.onFileChange(this.tempFile, type === 'file')
        },

        async sendDice(value) {
            if (!value) {
                value = Math.floor(Math.random() * 6) + 1
            }
            const messageType = await ipc.getMessgeTypeSetting()
            // 使用新版本 QLottie 骰子
            this.sendMessage({
                content: `[QLottie: 33,358,${value}]`,
                room: this.room,
                messageType: messageType === 'anonymous' ? 'anonymous' : 'text',
            })
        },

        async sendRps(value) {
            if (!value) {
                value = Math.floor(Math.random() * 3) + 1
            }
            // 新版本猜拳值映射
            if (value === 1) value = 3
            else if (value === 3) value = 1
            const messageType = await ipc.getMessgeTypeSetting()
            this.sendMessage({
                content: `[QLottie: 34,359,${value}]`,
                room: this.room,
                messageType: messageType === 'anonymous' ? 'anonymous' : 'text',
            })
        },

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

        async sendSticker(url) {
            const messageType = await ipc.getMessgeTypeSetting()
            const roomRef = this.$refs.room
            const content = roomRef?.$refs?.roomTextarea?.message || ''
            const replyMessage = roomRef?.messageReply || null
            this.sendMessage({
                content,
                room: this.room,
                replyMessage,
                imgpath: url,
                sticker: true,
                messageType: messageType === 'anonymous' ? 'anonymous' : undefined,
            })

            if (roomRef) {
                roomRef.resetMessage(true)
            }
            this.$refs.room.focusTextarea()
            if (!this.stickerPanelBottom && window.innerWidth < 1200) {
                this.panel = ''
            }
        },

        async sendLottie(lottie) {
            const messageType = await ipc.getMessgeTypeSetting()
            let lottieCode = `[QLottie: ${lottie.qlottie},${lottie.id}]`
            const randomList = {
                114: 5,
                358: 6,
                359: 3,
                394: 6,
                417: 6,
                421: 6,
                431: 6,
            }
            const getRandomInt = (max) => {
                return Math.floor(Math.random() * Math.floor(max)) + 1
            }
            if (Object.keys(randomList).includes(String(lottie.id)))
                lottieCode = `[QLottie: ${lottie.qlottie},${lottie.id},${getRandomInt(randomList[lottie.id])}]`
            this.sendMessage({
                content: lottieCode,
                room: this.room,
                messageType: messageType === 'anonymous' ? 'anonymous' : 'text',
            })
            if (!this.stickerPanelBottom && window.innerWidth < 1200) {
                this.panel = ''
            }
        },

        removeGroupNameEmotesFunc(name) {
            if (!name) return name
            return name.replace(/\[.*?\]/g, '').trim() || name
        },

        async gotoMessage(messageId) {
            // 先尝试在当前消息列表中查找
            const existingIndex = this.messages.findIndex((m) => m._id === messageId)
            if (existingIndex !== -1) {
                // 消息已存在，直接滚动并高亮
                this.$nextTick(() => {
                    if (this.$refs.room) {
                        this.$refs.room.scrollToMessage(messageId)
                    }
                })
                return
            }

            // 消息不在当前列表中，需要加载指定消息前后的消息
            this.loading = true
            try {
                const msgs = await ipc.fetchMessagesAround(this.roomId, messageId, 20, 20)
                if (msgs && msgs.length > 0) {
                    this.messages = msgs
                    this.messagesLoaded = false // 允许继续向上加载
                    this.isInMiddle = true // 标记从中间加载
                    this.targetMessageId = messageId
                    this.$nextTick(() => {
                        if (this.$refs.room) {
                            this.$refs.room.scrollToMessage(messageId)
                        }
                    })
                } else {
                    this.$message.error('找不到该消息')
                }
            } catch (e) {
                console.error('Failed to goto message:', e)
                this.$message.error('定位消息失败')
            } finally {
                this.loading = false
            }
        },

        async fetchMessageAfter() {
            console.log('fetchMessageAfter called, isInMiddle:', this.isInMiddle, 'loading:', this.loading)
            if (!this.isInMiddle || this.loading) return
            const lastMessage = this.messages[this.messages.length - 1]
            if (!lastMessage) return

            this.loading = true
            try {
                // 使用 fetchMessagesAround，before=0 表示只获取之后的消息
                console.log('Fetching messages after:', lastMessage._id)
                const msgs = await ipc.fetchMessagesAround(this.roomId, lastMessage._id, 0, 20)
                console.log('Got messages:', msgs?.length)
                if (msgs && msgs.length > 1) {
                    // 去掉第一条（就是 lastMessage 本身）
                    const newMsgs = msgs.slice(1)
                    if (newMsgs.length > 0) {
                        this.messages = [...this.messages, ...newMsgs]
                    } else {
                        // 没有更多新消息了，退出中间模式
                        this.isInMiddle = false
                    }
                } else {
                    // 没有更多新消息了，退出中间模式
                    this.isInMiddle = false
                }
            } catch (e) {
                console.error('Failed to fetch messages after:', e)
            } finally {
                this.loading = false
            }
        },

        startStickerHeightResize(e) {
            e.preventDefault()
            const startY = e.pageY
            const startHeight = this.stickerPanelHeight
            const onMove = (ev) => {
                const delta = startY - ev.pageY
                let next = startHeight + delta
                const min = 150
                const max = Math.max(min, Math.floor(window.innerHeight * 0.85))
                if (next < min) next = min
                if (next > max) next = max
                this.stickerPanelHeight = next
            }
            const onUp = () => {
                window.removeEventListener('mousemove', onMove)
                window.removeEventListener('mouseup', onUp)
                ipc.setStickerPanelHeight(this.stickerPanelHeight)
            }
            window.addEventListener('mousemove', onMove)
            window.addEventListener('mouseup', onUp)
        },
    },
}
</script>

<style scoped>
.chat-window-root {
    height: 100vh;
    width: 100%;
}

.chat-window-body {
    display: flex;
    height: 100vh;
    width: 100%;
}

.chat-window-body-bottom {
    flex-direction: column;
}

.chat-window-main {
    flex: 1;
    min-width: 0;
    min-height: 0;
    height: 100vh;
}

.chat-window-body-bottom .chat-window-main {
    height: auto;
}

.panel-right {
    height: 100vh;
    border-left: var(--chat-border-style);
    flex-shrink: 0;
}

.panel-bottom {
    width: 100%;
    flex-shrink: 0;
    border-top: var(--chat-border-style);
    background-color: var(--panel-background);
    overflow: hidden;
}

.sticker-bottom-resizer {
    /* 视觉上不占空间：3px hit area 通过负 margin 重叠到下方面板的 border-top 上 */
    height: 3px;
    margin-bottom: -3px;
    width: 100%;
    cursor: row-resize;
    background-color: transparent;
    flex-shrink: 0;
    position: relative;
    z-index: 3;
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

.chat-window-body-bottom ::v-deep .vac-col-messages {
    height: 100%;
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
