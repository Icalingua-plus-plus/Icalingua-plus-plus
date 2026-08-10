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
                    :show-audio="true"
                    :show-reaction-emojis="false"
                    :show-new-messages-divider="!isInMiddle"
                    :unread-divider-count="unreadDividerCount"
                    :unread-divider-target-id="unreadDividerTargetId"
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
                    :window-drag-enabled="hideTitleBar"
                    :canLoadAfter="isInMiddle"
                    :pending-messages-count="deferredIncomingMessages.length"
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
                    @locate-message="locateMessage"
                    @fetch-messages-after="fetchMessageAfter"
                    @return-to-latest="returnToLatest"
                >
                    <template v-slot:menu-icon>
                        <i class="el-icon-more"></i>
                    </template>
                    <template v-slot:messages-top>
                        <div v-if="dbUpgrade.active" class="db-upgrade-banner">
                            <i class="el-icon-loading"></i>
                            <span class="db-upgrade-banner-message">{{ dbUpgrade.message }}</span>
                            <el-progress
                                :percentage="
                                    dbUpgrade.total > 0
                                        ? Math.min(100, Math.round((dbUpgrade.step / dbUpgrade.total) * 100))
                                        : 0
                                "
                                :indeterminate="dbUpgrade.total <= 0"
                                :show-text="false"
                                :stroke-width="4"
                            />
                        </div>
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
import { processFiles } from '../utils/processFiles'
import { createRendererLifecycleScope } from '../utils/rendererLifecycleScope'
import {
    compareMessageOrder,
    getMessageCursor,
    mergeMessageLists,
    messageIdKey,
    normalizeMessageList,
} from '../utils/messageOrder'
import '../utils/themes'

const NEARBY_MESSAGE_LOAD_LIMIT = 100

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
            deferredIncomingMessages: [],
            deferredIncomingIds: new Set(),
            messageLoadGeneration: 0,
            unreadDividerCount: 0,
            unreadDividerTargetId: null,
            messagesLoaded: false,
            dbUpgrade: { active: false, step: 0, total: 0, message: '' },
            loading: true,
            ready: false, // 数据是否准备好
            account: 0,
            username: '',
            linkify: true,
            isShutUp: false,
            removeGroupNameEmotes: false,
            usePanguJsRecv: false,
            hideTitleBar: false,
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
        this.lifecycleScope = createRendererLifecycleScope()
        // 从路由参数获取 roomId
        this.roomId = parseInt(this.$route.params.roomId)
        // 在首次 await 前注册，避免主进程的定位事件先于异步初始化到达。
        this.setupIpcListeners()
        this.dbUpgrade = await ipc.getDbUpgradeProgress()

        // 获取设置
        const settings = await ipc.getSettings()
        this.linkify = settings.linkify
        this.removeGroupNameEmotes = settings.removeGroupNameEmotes
        this.usePanguJsRecv = settings.usePanguJsRecv
        this.hideTitleBar = settings.hideTitleBar
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
            this.unreadDividerCount = Math.max(Number(roomInfo.unreadCount) || 0, 0)
            this.resolveUnreadDividerTarget()
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

        // 定位事件可能在初始消息请求期间到达；请求完成后立即补做一次。
        if (this.pendingGotoMessageId) {
            const messageId = this.pendingGotoMessageId
            this.pendingGotoMessageId = null
            await this.gotoMessage(messageId)
        }

        // 清除未读
        ipc.clearChatWindowUnread(this.roomId)
    },
    beforeDestroy() {
        this.lifecycleScope?.dispose()
    },
    methods: {
        async resolveUnreadDividerTarget() {
            if (this.unreadDividerCount <= 0) return null

            const roomId = this.roomId
            try {
                const targetMessageId = await ipc.resolveUnreadTargetMessageId(roomId, this.unreadDividerCount)
                if (roomId !== this.roomId || targetMessageId === null || targetMessageId === undefined) return null

                this.unreadDividerTargetId = messageIdKey(targetMessageId)
                return this.unreadDividerTargetId
            } catch (error) {
                console.error('Failed to resolve unread divider target:', error)
                return null
            }
        },
        getMessageIndex(messageId) {
            const key = messageIdKey(messageId)
            return this.messages.findIndex((message) => messageIdKey(message._id) === key)
        },
        setMessageList(messages) {
            const normalized = normalizeMessageList(messages || [])
            for (const message of normalized) message.__v_skip = true
            this.messages = normalized
        },
        mergeMessages(messages) {
            if (!messages.length) return
            const newMessages = normalizeMessageList(messages).filter(
                (message) => this.getMessageIndex(message._id) === -1,
            )
            if (!newMessages.length) return
            const lastMessage = this.messages[this.messages.length - 1]
            if (!lastMessage || compareMessageOrder(lastMessage, newMessages[0]) <= 0) {
                for (const message of newMessages) message.__v_skip = true
                this.messages = [...this.messages, ...newMessages]
                return
            }
            this.setMessageList(mergeMessageLists(this.messages, messages))
        },
        clearDeferredIncomingMessages() {
            this.deferredIncomingMessages = []
            this.deferredIncomingIds.clear()
        },
        deferIncomingMessage(message) {
            const key = messageIdKey(message._id)
            if (this.getMessageIndex(message._id) !== -1 || this.deferredIncomingIds.has(key)) return
            message.__v_skip = true
            this.deferredIncomingMessages.push(message)
            this.deferredIncomingIds.add(key)
        },
        consumeDeferredIncomingMessages(messages) {
            if (!this.deferredIncomingMessages.length || !messages.length) return
            const consumedIds = new Set(messages.map((message) => messageIdKey(message._id)))
            this.deferredIncomingMessages = this.deferredIncomingMessages.filter(
                (message) => !consumedIds.has(messageIdKey(message._id)),
            )
            for (const id of consumedIds) this.deferredIncomingIds.delete(id)
        },
        flushDeferredIncomingMessages() {
            if (!this.deferredIncomingMessages.length) return
            const messages = this.deferredIncomingMessages
            this.clearDeferredIncomingMessages()
            this.mergeMessages(messages)
        },
        updateDeferredIncomingMessage(messageId, update) {
            const key = messageIdKey(messageId)
            const index = this.deferredIncomingMessages.findIndex((message) => messageIdKey(message._id) === key)
            if (index !== -1) {
                this.$set(this.deferredIncomingMessages, index, update(this.deferredIncomingMessages[index]))
            }
        },
        setupIpcListeners() {
            // 阻止默认拖拽行为以支持文件拖入
            this.lifecycleScope.onEvent(document, 'dragover', (event) => {
                event.preventDefault()
                event.stopPropagation()
            })

            this.lifecycleScope.onIpc('dbUpgradeProgress', (_, progress) => {
                this.dbUpgrade = progress
            })

            // 接收新消息
            this.lifecycleScope.onIpc('addMessage', (_, { roomId, message }) => {
                if (roomId === this.roomId) {
                    const index = this.getMessageIndex(message._id)
                    if (index !== -1) {
                        console.warn(`[WARN] Duplicated message ID ${message._id}`, message, this.messages[index])
                        return
                    }
                    if (this.deferredIncomingIds.has(messageIdKey(message._id))) return
                    if (this.isInMiddle) this.deferIncomingMessage(message)
                    else this.mergeMessages([message])
                    if (this.unreadDividerCount > 0 && !message.system) this.unreadDividerCount++
                }
            })

            // 删除消息
            this.lifecycleScope.onIpc('deleteMessage', (_, messageId) => {
                const index = this.getMessageIndex(messageId)
                if (index !== -1) {
                    this.$set(this.messages, index, {
                        ...this.messages[index],
                        deleted: Date.now(),
                        reveal: false,
                    })
                } else
                    this.updateDeferredIncomingMessage(messageId, (message) => ({
                        ...message,
                        deleted: Date.now(),
                        reveal: false,
                    }))
            })

            // 隐藏消息
            this.lifecycleScope.onIpc('hideMessage', (_, messageId) => {
                const index = this.getMessageIndex(messageId)
                if (index !== -1) {
                    this.$set(this.messages, index, {
                        ...this.messages[index],
                        hide: true,
                        reveal: false,
                    })
                } else
                    this.updateDeferredIncomingMessage(messageId, (message) => ({
                        ...message,
                        hide: true,
                        reveal: false,
                    }))
            })

            // 显示消息
            this.lifecycleScope.onIpc('revealMessage', (_, messageId) => {
                const index = this.getMessageIndex(messageId)
                if (index !== -1) {
                    this.$set(this.messages, index, {
                        ...this.messages[index],
                        hide: false,
                        reveal: true,
                    })
                } else
                    this.updateDeferredIncomingMessage(messageId, (message) => ({
                        ...message,
                        hide: false,
                        reveal: true,
                    }))
            })

            // 更新消息
            this.lifecycleScope.onIpc('renewMessage', (_, { roomId, messageId, message }) => {
                if (roomId === this.roomId) {
                    const index = this.getMessageIndex(messageId)
                    if (index !== -1) {
                        this.$set(this.messages, index, { ...this.messages[index], ...message })
                    } else if (message) {
                        this.updateDeferredIncomingMessage(messageId, (current) => ({ ...current, ...message }))
                    }
                }
            })

            // 禁言状态
            this.lifecycleScope.onIpc('setShutUp', (_, isShutUp) => {
                this.isShutUp = isShutUp
            })

            // 窗口聚焦时清除未读
            this.lifecycleScope.onIpc('clearUnread', () => {
                ipc.clearChatWindowUnread(this.roomId)
            })

            // 定位到指定消息
            this.lifecycleScope.onIpc('gotoMessage', async (_, messageId) => {
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
            this.lifecycleScope.onIpc('sendDice', (_) => {
                this.sendDice(0)
            })

            // 发送猜拳（菜单操作）
            this.lifecycleScope.onIpc('sendRps', (_) => {
                this.sendRps(0)
            })

            // 关闭表情面板
            this.lifecycleScope.onIpc('closePanel', () => {
                this.panel = ''
            })
        },

        async fetchMessage(reset, number) {
            let generation = this.messageLoadGeneration
            if (reset) {
                generation = ++this.messageLoadGeneration
                this.loading = false
                this.clearDeferredIncomingMessages()
                this.isInMiddle = false
                this.setMessageList([])
                this.messagesLoaded = false
            }
            let cursor = !reset && this.messages.length ? getMessageCursor(this.messages[0]) : null
            const messagePages = []
            let lastPage = []
            let nonSystemMessageCount = 0
            this.loading = true
            try {
                do {
                    const page = await ipc.fetchMessage(this.roomId, cursor ? { before: cursor } : {})
                    lastPage = page || []
                    if (lastPage.length) cursor = getMessageCursor(lastPage[0])
                    messagePages.unshift(lastPage)
                    nonSystemMessageCount += lastPage.filter((message) => !message.system).length
                    if (!number || nonSystemMessageCount >= number || !lastPage.length) break
                    if (generation !== this.messageLoadGeneration) return
                } while (true)
                if (generation !== this.messageLoadGeneration) return

                const messages = messagePages.flat()
                if (reset) this.setMessageList(messages)
                else this.mergeMessages(messages)
                this.messagesLoaded = !lastPage.length || lastPage.length < 20
            } catch (e) {
                console.error('Failed to fetch messages:', e)
            } finally {
                if (generation === this.messageLoadGeneration) this.loading = false
            }
        },

        async sendMessage(data) {
            let { content, files, replyMessage, media: extraMedia, sticker, messageType, resend } = data

            if (this.isInMiddle) await this.returnToLatest()

            const hasImages = (files || []).some((file) => file.type.includes('image'))
            const compressImages = hasImages ? (await ipc.getSettings()).compressImages : false
            const processed = await processFiles(files || [], (msg) => this.$message.warning(msg), compressImages)
            const media = [...(extraMedia || []), ...processed.media]

            if (resend) ipc.deleteMessage(this.roomId, resend)
            ipc.sendMessage({
                content,
                roomId: this.roomId,
                file: processed.file,
                replyMessage,
                room: this.room,
                media,
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
            ipc.openForward(e.resId, e.fileName, e.fallbackResId)
        },

        async sendSticker(url) {
            const messageType = await ipc.getMessgeTypeSetting()
            const roomRef = this.$refs.room
            const content = roomRef?.getMessageText() || ''
            const replyMessage = roomRef?.messageReply || null
            this.sendMessage({
                content,
                room: this.room,
                replyMessage,
                media: [{ url }],
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

        async locateMessage(messageId) {
            const roomId = this.roomId
            const generation = ++this.messageLoadGeneration
            this.loading = true
            try {
                await this.fetchMessage(false, NEARBY_MESSAGE_LOAD_LIMIT)
                if (generation !== this.messageLoadGeneration || roomId !== this.roomId) return
                await this.$nextTick()
                if (this.$refs.room?.scrollToMessage(messageId, false, true)) return
            } finally {
                if (generation === this.messageLoadGeneration) this.loading = false
            }

            if (generation === this.messageLoadGeneration && roomId === this.roomId) {
                await this.gotoMessage(messageId)
            }
        },

        async gotoMessage(messageId) {
            // 先尝试在当前消息列表中查找
            const existingIndex = this.getMessageIndex(messageId)
            if (existingIndex !== -1) {
                // 消息已存在，直接滚动并高亮
                this.$nextTick(() => {
                    if (this.$refs.room) {
                        this.$refs.room.scrollToMessage(messageId, false, true)
                    }
                })
                return
            }

            // 消息不在当前列表中，需要加载指定消息前后的消息
            const generation = ++this.messageLoadGeneration
            const previousMiddleState = this.isInMiddle
            this.isInMiddle = true
            this.loading = true
            try {
                const msgs = await ipc.fetchMessagesAround(this.roomId, messageId, 20, 20)
                if (generation !== this.messageLoadGeneration) return
                if (msgs && msgs.length > 0) {
                    this.setMessageList(msgs)
                    this.consumeDeferredIncomingMessages(msgs)
                    const targetIndex = this.getMessageIndex(messageId)
                    if (targetIndex === -1) {
                        this.$message.error('找不到该消息')
                        this.isInMiddle = previousMiddleState
                        if (!this.isInMiddle) this.flushDeferredIncomingMessages()
                        return
                    }
                    this.messagesLoaded = targetIndex < 20
                    // Keep the window detached from the live tail until an explicit
                    // after-cursor request proves that no gap remains.
                    this.isInMiddle = true
                    this.targetMessageId = messageId
                    this.$nextTick(() => {
                        if (this.$refs.room) {
                            this.$refs.room.scrollToMessage(messageId, false, true)
                        }
                    })
                } else {
                    this.$message.error('找不到该消息')
                    this.isInMiddle = previousMiddleState
                    if (!this.isInMiddle) this.flushDeferredIncomingMessages()
                }
            } catch (e) {
                console.error('Failed to goto message:', e)
                this.$message.error('定位消息失败')
                if (generation === this.messageLoadGeneration) {
                    this.isInMiddle = previousMiddleState
                    if (!this.isInMiddle) this.flushDeferredIncomingMessages()
                }
            } finally {
                if (generation === this.messageLoadGeneration) this.loading = false
            }
        },

        async fetchMessageAfter() {
            if (!this.isInMiddle || this.loading) return
            const lastMessage = this.messages[this.messages.length - 1]
            if (!lastMessage) return

            const generation = this.messageLoadGeneration
            this.loading = true
            try {
                const msgs = await ipc.fetchMessage(this.roomId, { after: getMessageCursor(lastMessage) })
                if (generation !== this.messageLoadGeneration) return
                if (msgs?.length) {
                    this.consumeDeferredIncomingMessages(msgs)
                    this.mergeMessages(msgs)
                }
                if (!msgs || msgs.length < 20) {
                    this.isInMiddle = false
                    this.flushDeferredIncomingMessages()
                }
            } catch (e) {
                console.error('Failed to fetch messages after:', e)
            } finally {
                if (generation === this.messageLoadGeneration) this.loading = false
            }
        },
        async returnToLatest() {
            const generation = ++this.messageLoadGeneration
            this.loading = true
            try {
                const messages = (await ipc.fetchMessage(this.roomId, {})) || []
                if (generation !== this.messageLoadGeneration) return false

                this.setMessageList(messages)
                this.isInMiddle = false
                this.messagesLoaded = messages.length < 20
                this.flushDeferredIncomingMessages()
                this.$nextTick(() => this.$refs.room?.queueScrollToBottom(true))
                return true
            } catch (error) {
                console.error('Failed to return to latest messages:', error)
                this.$message.error('返回最新消息失败')
                return false
            } finally {
                if (generation === this.messageLoadGeneration) this.loading = false
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
            let removeMoveListener
            let removeUpListener
            const onUp = () => {
                removeMoveListener()
                removeUpListener()
                ipc.setStickerPanelHeight(this.stickerPanelHeight)
            }
            removeMoveListener = this.lifecycleScope.onEvent(window, 'mousemove', onMove)
            removeUpListener = this.lifecycleScope.onEvent(window, 'mouseup', onUp)
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
