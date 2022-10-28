<template>
    <div ondragstart="return false;" class="icalingua-theme-holder">
        <Multipane class="el-main" @paneResize="roomPanelResize" @paneResizeStop="roomPanelResizeStop">
            <!-- main chat view -->
            <div
                class="panel rooms-panel"
                :class="{ 'avatar-only': roomPanelAvatarOnly }"
                :style="{ width: roomPanelWidth + 'px' }"
            >
                <TheRoomsPanel
                    ref="roomsPanel"
                    :rooms="rooms"
                    :selected="selectedRoom"
                    :priority="priority"
                    :account="account"
                    :username="username"
                    @chroom="chroom"
                    @show-contacts="contactsShown = true"
                />
            </div>
            <MultipaneResizer />
            <div style="flex: 1" class="vac-card-window">
                <div class="pace-activity" v-show="loading" />
                <Room
                    ref="room"
                    :current-user-id="account"
                    :rooms="rooms"
                    :messages="messages"
                    height="100vh"
                    :rooms-loaded="true"
                    :messages-loaded="messagesLoaded"
                    :show-audio="false"
                    :show-reaction-emojis="false"
                    :show-new-messages-divider="false"
                    :load-first-room="false"
                    :accepted-files="selectedRoom.roomId > 0 ? 'image/*' : '*'"
                    :message-actions="[]"
                    :single-room="true"
                    :room-id="selectedRoom.roomId"
                    :show-rooms-list="false"
                    :is-mobile="false"
                    :menu-actions="[]"
                    :show-send-icon="true"
                    :show-files="true"
                    :show-emojis="true"
                    :show-footer="!isShutUp"
                    :loading-rooms="false"
                    :text-formatting="true"
                    :members-count="membersCount"
                    :linkify="linkify"
                    :account="account"
                    :username="username"
                    :last-unread-count="lastUnreadCount"
                    @clear-last-unread-count="clearLastUnreadCount"
                    @send-message="sendMessage"
                    @open-file="openImage"
                    @pokefriend="pokeFriend"
                    @stickers-panel="panel = panel === 'stickers' ? '' : 'stickers'"
                    @download-image="downloadImage"
                    @pokegroup="pokeGroup"
                    @open-forward="openForward"
                    @fetch-messages="fetchMessage"
                    @open-group-member-panel="groupmemberShown = true"
                    @choose-forward-target="chooseForwardTarget"
                    @start-chat="startChat"
                >
                    <template v-slot:menu-icon>
                        <i class="el-icon-more"></i>
                    </template>
                </Room>
                <pre
                    v-show="selectedRoomId === 0 && sysInfo"
                    style="position: absolute; right: 13px; top: 0; font-family: monospace; color: rgb(156, 166, 175)"
                >
 {{ sysInfo }} </pre
                >
                <div class="getting-history" v-if="historyCount">
                    <div class="pace-activity" />
                    <span> 正在获取历史消息... {{ historyCount }} </span>
                    <el-button @click="stopFetchingHistory" size="mini">就要这么多</el-button>
                </div>
            </div>
            <MultipaneResizer class="resize-next" v-show="panel" />
            <transition name="vac-fade-stickers">
                <div
                    :style="{ minWidth: '300px', width: '320px', maxWidth: '500px' }"
                    v-show="panel"
                    class="panel panel-right"
                >
                    <transition name="vac-fade-stickers">
                        <Stickers
                            v-show="panel === 'stickers'"
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
                        />
                    </transition>
                </div>
            </transition>
        </Multipane>
        <el-dialog
            title="You are offline"
            :visible.sync="offline"
            width="30%"
            :close-on-click-modal="false"
            :close-on-press-escape="false"
            :show-close="false"
        >
            <span>{{ offlineReason }}</span>
            <span slot="footer" class="dialog-footer">
                <el-button type="primary" @click="reconnect" :loading="reconnecting"> Reconnect now </el-button>
            </span>
        </el-dialog>
        <el-dialog title="联系人" :visible.sync="contactsShown" top="5vh" class="dialog">
            <TheContactsPanel @dblclick="startChat" />
        </el-dialog>
        <el-dialog title="转发到..." :visible.sync="forwardShown" top="5vh" class="dialog">
            <TheContactsPanel @click="sendForward" />
        </el-dialog>
        <el-dialog title="群成员" :visible.sync="groupmemberShown" top="5vh" class="dialog">
            <TheGroupMemberPanel
                @dblclick="startChat"
                :groupmemberShown="groupmemberShown"
                :gin="-selectedRoom.roomId"
                v-if="groupmemberShown"
            />
        </el-dialog>
        <DialogAskCheckUpdate :show.sync="dialogAskCheckUpdateVisible" />
    </div>
</template>

<script lang="js">
import Room from '../components/vac-mod/ChatWindow/Room/Room'
import Stickers from '../components/Stickers'
import {Multipane, MultipaneResizer} from '../components/multipane'
import path from 'path'
import {ipcRenderer} from 'electron'
import SideBarIcon from '../components/SideBarIcon.vue'
import TheRoomsPanel from '../components/TheRoomsPanel.vue'
import TheContactsPanel from '../components/TheContactsPanel.vue'
import TheGroupMemberPanel from '../components/TheGroupMemberPanel.vue'
import ipc from '../utils/ipc'
import getAvatarUrl from '../../utils/getAvatarUrl'
import createRoom from '../../utils/createRoom'
import fs from 'fs'
import * as themes from '../utils/themes'
import DialogAskCheckUpdate from '../components/DialogAskCheckUpdate'

export default {
    components: {
        DialogAskCheckUpdate,
        Room,
        Stickers,
        SideBarIcon,
        TheRoomsPanel,
        TheContactsPanel,
        TheGroupMemberPanel,
        Multipane,
        MultipaneResizer,
    },
    data() {
        return {
            rooms: [],
            messages: [],
            selectedRoomId: 0,
            account: 0,
            messagesLoaded: false,
            panel: '',
            offline: false,
            offlineReason: '',
            reconnecting: false,
            username: '',
            priority: 3,
            theme: 'default',
            loading: false,
            isShutUp: false,
            sysInfo: '',
            historyCount: 0,
            dialogAskCheckUpdateVisible: false,
            membersCount: 0,
            contactsShown: false,
            groupmemberShown: false,
            linkify: true,
            roomPanelAvatarOnly: false,
            roomPanelWidth: undefined,
            forwardShown: false,
            lastUnreadCount: 0,
            lastUnreadCheck: 0,
        }
    },
    async created() {
        //region set status
        const STORE_PATH = await ipc.getStorePath()
        const ver = await ipc.getVersion()
        this.linkify = await ipc.getlinkifySetting()
        const roomPanelLastSetting = await ipc.getRoomPanelSetting()
        this.roomPanelAvatarOnly = roomPanelLastSetting.roomPanelAvatarOnly
        this.roomPanelWidth = roomPanelLastSetting.roomPanelWidth
        //endregion
        //region listener
        document.addEventListener('dragover', (e) => {
            e.preventDefault()
            e.stopPropagation()
        })
        document.addEventListener('click', (e) => {
            const stickers_panel = document.getElementsByClassName('panel panel-right')
            const vac_room_footer = document.getElementsByClassName('vac-room-footer')
            if (stickers_panel.length > 0 && !stickers_panel[0].contains(e.target) && !vac_room_footer[0].contains(e.target) && getComputedStyle(stickers_panel[0]).right === '15px') {
                this.panel = ''
            }
        })
        //keyboard
        document.addEventListener('keydown', (e) => {
            if (e.repeat) {
                return
            }
            else if (e.key === 'F1') {
                if (this.selectedRoomId)
                    this.panel = this.panel === 'stickers' ? '' : 'stickers'
            }
            else if (e.key === 'Escape') {
                if (document.webkitIsFullScreen)
                    return
                if (this.$refs.room.messageReply || this.$refs.room.editAndResend || this.$refs.room.message)
                    this.$refs.room.resetMessage()
                else if (this.$refs.room.file)
                    this.$refs.room.resetMediaFile()
                else {
                    this.closeRoom()
                }
            }
            else if (e.key === 'Tab') {
                let unreadRoom
                for (let i = 5; i > 0; i--) {
                    unreadRoom = this.rooms.find((e) => e.unreadCount && e.priority === i)
                    if (unreadRoom) break
                }
                if (unreadRoom) this.chroom(unreadRoom)
            }
        })
        //endregion

        if (fs.existsSync(path.join(STORE_PATH, 'font.ttf'))) {
            const myFonts = new FontFace(
                'font',
                `url(${path.join(STORE_PATH, 'font.ttf')})`,
                {},
            )
            myFonts.load().then(function (loadFace) {
                document.fonts.add(loadFace)
            })
        }

        themes.$$DON_CALL$$fetchThemes(STORE_PATH)

        ipcRenderer.on('openGroupMemberPanel', (_, p) => this.groupmemberShown = p)
        ipcRenderer.on('closeLoading', () => this.loading = false)
        ipcRenderer.on('notify', (_, p) => this.$notify(p))
        ipcRenderer.on('addHistoryCount', (_, p) => this.historyCount += p)
        ipcRenderer.on('clearHistoryCount', () => this.historyCount = 0)
        ipcRenderer.on('notifyError', (_, p) => this.$notify.error(p))
        ipcRenderer.on('notifySuccess', (_, p) => this.$notify.success(p))
        ipcRenderer.on('message', (_, p) => this.$message(p))
        ipcRenderer.on('messageError', (_, p) => this.$message.error(p))
        ipcRenderer.on('messageSuccess', (_, p) => this.$message.success(p))
        ipcRenderer.on('setShutUp', (_, p) => this.isShutUp = p)
        ipcRenderer.on('chroom', (_, p) => this.chroom(p))
        ipcRenderer.on('confirmIgnoreChat', (_, data) => {
            const message = ['屏蔽群聊将不再接受该群的消息。', '屏蔽个人将不再接受此人发送的私聊消息，且会自动隐藏其发送的群消息。']
            this.$confirm(message[data.id > 0 ? 1 : 0], `确定屏蔽 ${ data.name }(${ Math.abs(data.id) }) 的消息?`, {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning',
            }).then(() => {
                ipc.ignoreChat(data)
            })
        })
        ipcRenderer.on('confirmDeleteMessage', (_, {roomId, messageId}) => {
            this.$confirm('确定撤回群成员消息?', '提示', {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning',
            }).then(() => {
                ipc.deleteMessage(roomId, messageId)
            })
        })
        ipcRenderer.on('confirmDeleteSticker', (_, filename) => {
            this.$confirm('确定删除本 Sticker?', '提示', {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning',
            }).then(() => {
                fs.unlink(path.join(filename), () => this.$message('删除成功'))
            })
        })
        ipcRenderer.on('confirmDeleteStickerDir', (_, dirname) => {
            this.$confirm('确定删除 Sticker 分类 ' + dirname + '?', '提示', {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning',
            }).then(() => {
                fs.rmdir(path.join(STORE_PATH, 'stickers', dirname), { recursive: true }, () => this.$message('删除成功'))
            })
        })
        ipcRenderer.on('moveSticker', (_, filename) => {
            this.$prompt('请输入 Sticker 分类目录名称，若目录不存在则会自动创建', '提示', {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
            }).then(({ value }) => {
                if (!value) {
                    this.$message.error('请输入目录名称')
                    return
                }
                if (value !== 'Default'){
                    const newPath = path.join(STORE_PATH, 'stickers', value)
                    if (!fs.existsSync(newPath)) {
                        fs.mkdirSync(newPath)
                    }
                    fs.rename(filename, path.join(newPath, path.basename(filename)), () => this.$message('移动成功'))
                } else {
                    fs.rename(filename, path.join(STORE_PATH, 'stickers', path.basename(filename)), () => this.$message('移动成功'))
                }
            });
        })
        ipcRenderer.on('sendDice', (_) => {
            this.$prompt('请输入骰子点数，留空随机', '提示', {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                inputType: 'number',
                inputPattern: /^[1-6]$|^$/,
            }).then(({ value }) => {
                if (!value) {
                    value = (Math.floor(Math.random() * 6) + 1).toString()
                }
                this.sendMessage({
                    content: value,
                    room: this.selectedRoom,
                    messageType: 'dice',
                })
            });
        })
        ipcRenderer.on('sendRps', (_) => {
            this.$prompt('请输入对应数字，1石头、2剪刀、3布、留空随机', '提示', {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                inputType: 'number',
                inputPattern: /^[1-3]$|^$/,
            }).then(({ value }) => {
                if (!value) {
                    value = (Math.floor(Math.random() * 3) + 1).toString()
                }
                this.sendMessage({
                    content: value,
                    room: this.selectedRoom,
                    messageType: 'rps',
                })
            });
        })
        ipcRenderer.on('updateRoom', (_, room) => {
            const oldRooms = this.rooms.filter(item => item.roomId !== room.roomId)
            let left = 0, right = oldRooms.length - 1, mid = 0
            while (left <= right) {
                mid = Math.floor((left + right) / 2)
                if (room.utime > oldRooms[mid].utime) {
                    right = mid - 1
                } else {
                    left = mid + 1
                }
            }
            this.rooms = [...oldRooms.slice(0, left), room, ...oldRooms.slice(left)]
        })
        ipcRenderer.on('addMessage', (_, {roomId, message}) => {
            if (roomId !== this.selectedRoomId) return
            this.messages = [...this.messages, message]
        })
        ipcRenderer.on('deleteMessage', (_, messageId) => {
            const message = this.messages.find((e) => e._id === messageId)
            if (message) {
                message.deleted = new Date()
                message.reveal = false
                this.messages = [...this.messages]
            }
        })
        ipcRenderer.on('hideMessage', (_, messageId) => {
            const message = this.messages.find((e) => e._id === messageId)
            if (message) {
                message.hide = true
                message.reveal = false
                this.messages = [...this.messages]
            }
        })
        ipcRenderer.on('revealMessage', (_, messageId) => {
            const message = this.messages.find((e) => e._id === messageId)
            if (message) {
                message.hide = false
                message.reveal = true
                this.messages = [...this.messages]
            }
        })
        ipcRenderer.on('renewMessage', (_, {messageId, message}) => {
            const oldMessageIndex = this.messages.findIndex((e) => e._id === messageId)
            if (oldMessageIndex !== -1 && message) {
                this.messages[oldMessageIndex] = message
                this.messages = [...this.messages]
            }
        })
        ipcRenderer.on('renewMessageURL', (_, {messageId, URL}) => {
            const message = this.messages.find((e) => e._id === messageId)
            if (message && URL !== 'error') {
                message.file.url = URL
                this.messages = [...this.messages]
            }
        })
        ipcRenderer.on('setOnline', () => this.reconnecting = this.offline = false)
        ipcRenderer.on('setOffline', (_, msg) => {
            this.offlineReason = msg
            this.offline = true
        })
        ipcRenderer.on('clearCurrentRoomUnread', () => this.selectedRoom.unreadCount = 0)
        ipcRenderer.on('clearRoomUnread', (_, roomId) => {
            const room = this.rooms.find(e => e.roomId === roomId)
            if (room) {
                room.unreadCount = 0
                room.at = false
            }
        })
        ipcRenderer.on('updatePriority', (_, p) => this.priority = p)
        ipcRenderer.on('setAllRooms', (_, p) => this.rooms = p)
        ipcRenderer.on('setMessages', (_, p) => {
            this.messages = p
            this.messagesLoaded = false
        })
        ipcRenderer.on('startChat', (_, {id, name}) => this.startChat(id, name))
        ipcRenderer.on('closePanel', () => this.panel = '')
        ipcRenderer.on('gotOnlineData', (_, {online, nick, uin, priority, sysInfo, updateCheck}) => {
            this.offline = !online
            this.account = uin
            this.priority = priority
            this.username = nick
            this.sysInfo = sysInfo ? sysInfo + `\n\nClient ${ver}
Electron ${process.versions.electron}
Node ${process.versions.node}
Chromium ${process.versions.chrome}` : ''
            if (updateCheck === 'ask')
                this.dialogAskCheckUpdateVisible = true
        })
        console.log('加载完成')
    },
    methods: {
        async sendMessage({content, roomId, file, replyMessage, room, b64img, imgpath, resend, sticker, messageType}) {
            this.loading = true
            if (!room && !roomId) {
                room = this.selectedRoom
                roomId = room.roomId
            }
            if (!room) room = this.rooms.find((e) => e.roomId === roomId)
            if (!roomId) roomId = room.roomId
            if (file) {
                if (file.type.includes('image')) {
                    const crypto = require('crypto');
                    const buffer = Buffer.from(await file.blob.arrayBuffer())
                    const imgHashStr = crypto.createHash('md5').update(buffer).digest('hex').toUpperCase()
                    const b64 = buffer.toString('base64')
                    b64img = `data:${file.type};base64,${b64}`
                    imgpath = imgpath || `send_https://gchat.qpic.cn/gchatpic_new/0/0-0-${imgHashStr}/0`
                    file = null
                }
                else
                    file = {
                        type: file.type,
                        size: file.size,
                        path: file.path,
                    }

            }
            if (resend)
                ipc.deleteMessage(roomId, resend)
            ipc.sendMessage({content, roomId, file, replyMessage, room, b64img, imgpath, sticker, messageType})
        },
        clearLastUnreadCount() {
            this.lastUnreadCount = 0
        },
        async fetchMessage(reset, number) {
            if (reset) {
                this.messagesLoaded = false
                this.messages = []
            }
            const _roomId = this.selectedRoom.roomId
            const msgs2add = await ipc.fetchMessage(_roomId, this.messages.length)
            if (number) {
                while (msgs2add.filter((e) => !e.system).length < number) {
                    const msgs = await ipc.fetchMessage(_roomId, this.messages.length + msgs2add.length)
                    msgs2add.unshift(...msgs)
                }
            }
            setTimeout(() => {
                if (_roomId !== this.selectedRoom.roomId) return

                if (msgs2add.some(e => this.messages.find(e2 => e2._id === e._id))) return
                if (msgs2add.length) {
                    this.messages = [...msgs2add, ...this.messages]
                }
                else this.messagesLoaded = true
            }, 0)

            return msgs2add[msgs2add.length - 1]
        },
        openImage: ipc.downloadFileByMessageData,
        async sendSticker(url) {
            const messageType = await ipc.getMessgeTypeSetting()
            if (this.selectedRoom)
                this.sendMessage({
                    content: '',
                    room: this.selectedRoom,
                    imgpath: url,
                    sticker: true,
                    messageType: messageType === 'anonymous' ? 'anonymous' : undefined,
                })
            this.$refs.room.focusTextarea()
            if (window.innerWidth < 1200) {
                this.panel = ''
            }
        },
        reconnect() {
            this.reconnecting = true
            ipc.reLogin()
        },
        startChat(id, name) {
            let room = this.rooms.find((e) => e.roomId === id)
            const avatar = getAvatarUrl(id)

            if (room === undefined) {
                // create room
                room = createRoom(id, name, avatar)
                this.rooms = [room, ...this.rooms]
                ipc.addRoom(room)
            }
            this.chroom(room)
            this.contactsShown = false
            this.groupmemberShown = false
        },
        async chroom(room) {
            if (room === 0) {
                this.lastUnreadCount = 0
                this.closeRoom()
                return
            }
            if (room === this.account)
                return this.startChat(this.account, this.username)
            if ((typeof room) === 'number')
                room = this.rooms.find(e => e.roomId === room)
            if (!room) return
            this.lastUnreadCount = room.unreadCount
            this.selectedRoom.at = false
            ipc.updateRoom(this.selectedRoom.roomId, { at: false })
            if (this.selectedRoom.roomId === room.roomId) return
            this.selectedRoomId = room.roomId
            ipc.setSelectedRoom(room.roomId, room.roomName)
            this.fetchMessage(true)
            if (this.selectedRoomId < 0)
                ipc.getGroup(-this.selectedRoomId).then(e =>
                    this.membersCount = e.member_count)
            else
                this.membersCount = 0
        },
        downloadImage: ipc.downloadImage,
        pokeGroup(uin) {
            const group = -this.selectedRoom.roomId
            ipc.sendGroupPoke(group, uin)
            this.$refs.room.focusTextarea()
        },
        pokeFriend() {
            if (this.selectedRoom.roomId > 0)
                ipc.sendGroupPoke(this.selectedRoom.roomId, this.selectedRoom.roomId)
            this.$refs.room.focusTextarea()
        },
        openForward(e) {
            ipc.openForward(e.resId, e.fileName)
        },
        stopFetchingHistory() {
            ipc.stopFetchMessage()
        },
        closeRoom() {
            this.selectedRoomId = 0
            this.messages = []
            this.panel = ''
            ipc.setSelectedRoom(0, '')
            document.title = 'Icalingua++'
        },
        roomPanelResize(pane, resizer, size) {
            size = + size.slice(0, -2)
            // 140px: Min width with avatars
            // 80px: Width without avatars
            if (!this.roomPanelAvatarOnly && size <= 140) {
                this.roomPanelAvatarOnly = true
                this.roomPanelWidth = 80
            }
            if (this.roomPanelAvatarOnly && size > 80) {
                this.roomPanelAvatarOnly = false
                this.roomPanelWidth = 140
            }
        },
        roomPanelResizeStop(pane, resizer, size) {
            const width = document.getElementsByClassName('panel rooms-panel')[0].offsetWidth
            ipc.setRoomPanelSetting(this.roomPanelAvatarOnly, width)
        },
        sendForward(id, name) {
            this.$refs.room.sendForward(id, name)
            this.forwardShown = false
        },
        chooseForwardTarget() {
            this.forwardShown = true
        },
    },
    computed: {
        cssVars() {
            return themes.recalcTheme()
        },
        selectedRoom() {
            return this.rooms.find(e => e.roomId === this.selectedRoomId) || {roomId: 0}
        },
    },
    watch: {
        lastUnreadCount(n, o) {
            console.log('lastUnreadCount', n)
            if (n !== 0) {
                if (this.lastUnreadCheck) {
                    clearTimeout(this.lastUnreadCheck)
                }
                this.lastUnreadCheck = setTimeout(() => {
                    console.log('Timeout')
                    this.lastUnreadCount = 0
                }, 30000)
            }
        }
    }
}
</script>

<style scoped lang="scss">
.getting-history {
    display: flex;
    padding: 5px;
    position: absolute;
    top: 75px;
    right: 10px;
    height: 30px;
    background-color: var(--panel-background);
    align-items: center;
    border-radius: 5px;

    .pace-activity {
        position: relative;
        bottom: unset;
        right: unset;
    }

    span {
        margin: 0 5px;
    }
}

.el-main {
    padding: 0;
    height: 100vh;
}

.el-aside {
    background-color: var(--panel-sidebar-bg);
    color: #eee;
    text-align: center;
    padding-top: 15px;
    -webkit-user-select: none;
}

main div {
    height: 100vh;
    overflow: hidden;
}

.panel {
    background-color: var(--panel-background);
}

@keyframes pace-spinner {
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
}

.pace-activity {
    display: block;
    position: absolute;
    z-index: 2000;
    bottom: 66px;
    right: 15px;
    width: 14px;
    height: 14px;
    border: solid 2px transparent;
    border-top-color: #29d;
    border-left-color: #29d;
    border-radius: 10px;
    animation: pace-spinner 400ms linear infinite;
}

@media screen and (max-width: 1200px) {
    .resize-next {
        display: none;
    }

    .panel-right {
        position: absolute;
        height: 60vh;
        bottom: 70px;
        right: 15px;
        border-radius: 10px;
        padding: 2px;
        border: var(--chat-border-style);
    }
}

::v-deep .el-input__inner {
    background-color: var(--chat-bg-color-input);
    border: var(--chat-border-style);
}

.rooms-panel {
    min-width: 140px;
    width: 300px;
    max-width: 500px;

    &.avatar-only {
        min-width: 80px;
    }

    @media (max-width: 900px) {
        width: 200px;
    }
    @media (min-width: 1500px) {
        width: 350px;
    }
    @media (min-width: 2000px) {
        width: 400px;
    }
}
</style>

<style lang="scss">
@import '../components/vac-mod/styles/index.scss';

.vac-card-window {
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

.dialog .el-dialog__body,
.el-dialog__header {
    background-color: var(--panel-background);
}

.dialog .el-dialog__title {
    color: var(--panel-color-name);
}
</style>
