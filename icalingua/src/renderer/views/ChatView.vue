<template>
    <div ondragstart="return false">
        <Multipane class="el-main" @paneResize="roomPanelResize" @paneResizeStop="roomPanelResizeStop">
            <!-- main chat view -->
            <el-aside
                width="65px"
                class="chat-groups-container"
                v-if="!disableChatGroups"
                v-show="!useSinglePanel || !showSinglePanel || (showSinglePanel && showPanel === 'contact')"
            >
                <div class="head">
                    <el-popover placement="right-end" :title="username" trigger="hover" :content="`${account}`">
                        <a slot="reference" @click="chroom(account)" style="cursor: pointer">
                            <el-avatar :src="getAvatarUrl(account)" />
                        </a>
                    </el-popover>
                </div>
                <!-- chat groups -->
                <div class="chat-group-wrapper">
                    <div
                        class="chat-group"
                        ref="chatGroupContainer"
                        @scroll="onChatGroupScroll"
                        @mousedown="handleMouseDown"
                    >
                        <SideBarIcon
                            icon="el-icon-chat-square"
                            name="All Chats"
                            title="查看所有会话"
                            :selected="selectedChatGroup === 'chats'"
                            :redPoint="chatGroupsUnreadCount['chats']"
                            @click="selectChatGroup('chats')"
                        />
                        <SideBarIcon
                            name="Group"
                            title="查看所有群聊"
                            :selected="selectedChatGroup === 'group'"
                            :redPoint="chatGroupsUnreadCount['group']"
                            @click="selectChatGroup('group')"
                        >
                            <GroupChatIcon slot="icon" />
                        </SideBarIcon>
                        <SideBarIcon
                            icon="el-icon-user"
                            name="Private"
                            title="查看所有私聊"
                            :selected="selectedChatGroup === 'private'"
                            :redPoint="chatGroupsUnreadCount['private']"
                            @click="selectChatGroup('private')"
                        />
                        <SideBarIcon
                            v-for="chatGroup in chatGroups"
                            :key="chatGroup.name"
                            icon="el-icon-folder"
                            :name="chatGroup.name"
                            :selected="selectedChatGroup === chatGroup.name"
                            :redPoint="chatGroupsUnreadCount[chatGroup.name]"
                            @click="selectChatGroup(chatGroup.name)"
                            :title="`查看分组：${chatGroup.name}`"
                            @click-middle="removeChatGroup(chatGroup.name)"
                            @click-right="updateChatGroup(chatGroup.name)"
                        />
                        <SideBarIcon
                            icon="el-icon-edit-outline"
                            name="Edit"
                            title="编辑分组"
                            @click="chatGroupEditorVisible = true"
                        />
                        <SideBarIcon
                            icon="el-icon-s-unfold"
                            name="Next"
                            @click="switchUnreadRoom"
                            v-if="isSteamVrRunning"
                        />
                        <div style="height: 10px"></div>
                    </div>
                    <div
                        v-show="showChatGroupScrollbar"
                        class="custom-scrollbar-group"
                        :class="{ 'is-dragging': chatGroupIsDragging }"
                        @mousedown.prevent="onGroupTrackMouseDown"
                    >
                        <div
                            ref="chatGroupScrollbarThumb"
                            class="custom-scrollbar-group-thumb"
                            :style="{
                                height: groupThumbHeight + 'px',
                            }"
                            @mousedown.prevent.stop="onGroupThumbMouseDown"
                        />
                    </div>
                </div>
            </el-aside>
            <div
                class="panel rooms-panel"
                :class="{ 'avatar-only': roomPanelAvatarOnly, 'is-single': showSinglePanel }"
                :style="{ width: roomPanelWidth + 'px' }"
                v-show="!useSinglePanel || !showSinglePanel || (showSinglePanel && showPanel === 'contact')"
                ref="roomPanel"
            >
                <TheRoomsPanel
                    ref="roomsPanel"
                    :rooms="visibleRooms"
                    :selected="selectedRoom"
                    :priority="priority"
                    :account="account"
                    :username="username"
                    :selectedChatGroup="selectedChatGroup"
                    :allRooms="rooms"
                    :disableChatGroups="disableChatGroups"
                    :roomPanelAvatarOnly="roomPanelAvatarOnly"
                    :removeGroupNameEmotes="removeGroupNameEmotes"
                    :usePanguJs="usePanguJsRecv"
                    @chroom="chroom"
                    @show-contacts="contactsShown = true"
                    @update-sorted-rooms="(sortedRooms) => (this.sortedRooms = sortedRooms)"
                />
            </div>
            <MultipaneResizer style="z-index: 3" />
            <div
                class="chat-area"
                v-show="!useSinglePanel || !showSinglePanel || (showSinglePanel && showPanel === 'chat')"
            >
                <div style="flex: 1; min-width: 0; min-height: 0; position: relative" class="vac-card-window">
                    <div class="pace-activity" v-show="loading" />
                    <div class="upload-progress" v-show="loading && uploadProgress !== '0'">{{ uploadProgress }}%</div>
                    <Room
                        ref="room"
                        :current-user-id="account"
                        :rooms="rooms"
                        :messages="messages"
                        height="100vh"
                        :rooms-loaded="true"
                        :messages-loaded="messagesLoaded"
                        :show-audio="true"
                        :show-reaction-emojis="false"
                        :show-new-messages-divider="false"
                        :load-first-room="false"
                        :accepted-files="'*'"
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
                        :linkify="linkify"
                        :account="account"
                        :username="username"
                        :last-unread-count="lastUnreadCount"
                        :last-unread-at="lastUnreadAt"
                        :showSinglePanel="showSinglePanel"
                        :removeHeaderEmotes="selectedRoom.roomId < 0 && removeGroupNameEmotes"
                        :usePanguJsRecv="usePanguJsRecv"
                        :isSteamVrRunning="isSteamVrRunning"
                        :window-drag-enabled="hideTitleBar"
                        :canLoadAfter="isInMiddle"
                        @clear-last-unread-count="clearLastUnreadCount"
                        @clear-last-unread-at="clearLastUnreadAt"
                        @send-message="sendMessage"
                        @open-file="openImage"
                        @pokefriend="pokeFriend"
                        @stickers-panel="panel = panel === 'stickers' ? '' : 'stickers'"
                        @close-stickers-panel="panel = ''"
                        @download-image="downloadImage"
                        @pokegroup="pokeGroup"
                        @open-forward="openForward"
                        @fetch-messages="fetchMessage"
                        @fetch-messages-after="fetchMessageAfter"
                        @open-group-member-panel="
                            ;((groupmemberShown = true), (groupmemberPanelGin = -selectedRoom.roomId))
                        "
                        @choose-forward-target="chooseForwardTarget"
                        @start-chat="startChat"
                        @back-contact="closeRoom"
                        @open-choose-file-type="openChooseFileType"
                    >
                        <template v-slot:menu-icon>
                            <i class="el-icon-more"></i>
                        </template>
                    </Room>
                    <pre
                        v-show="selectedRoomId === 0 && sysInfo"
                        style="
                            position: absolute;
                            right: 13px;
                            top: 0;
                            font-family: monospace;
                            color: rgb(156, 166, 175);
                        "
                    >
 {{ sysInfo }} </pre>
                    <div class="getting-history" v-if="historyCount">
                        <div class="pace-activity" />
                        <span> {{ historyFetchingName }} 正在获取历史消息... {{ historyCount }} </span>
                        <el-button @click="stopFetchingHistory" size="mini">就要这么多</el-button>
                    </div>
                </div>
                <!-- 底部模式：横向分隔条 + 底部表情面板 -->
                <template v-if="stickerPanelBottom">
                    <div
                        class="sticker-bottom-resizer"
                        v-show="panel && selectedRoomId"
                        @mousedown="startStickerHeightResize"
                    ></div>
                    <transition name="vac-fade-stickers">
                        <div
                            v-show="panel && selectedRoomId"
                            class="panel sticker-bottom-container"
                            :style="{ height: stickerPanelHeight + 'px' }"
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
            </div>
            <!-- 侧边模式（默认）：分隔条 + 右侧表情面板 -->
            <template v-if="!stickerPanelBottom">
                <MultipaneResizer class="resize-next" v-show="panel && selectedRoomId" />
                <transition name="vac-fade-stickers">
                    <div
                        :style="{ minWidth: '300px', width: '320px', maxWidth: '500px' }"
                        v-show="panel && selectedRoomId"
                        class="panel panel-right"
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
            </template>
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
            <TheContactsPanel @dblclick="startChat" :removeGroupNameEmotes="removeGroupNameEmotes" />
        </el-dialog>
        <el-dialog :title="forwardTitle" :visible.sync="forwardShown" top="5vh" class="dialog">
            <TheContactsPanel
                @click="sendForward"
                :removeGroupNameEmotes="removeGroupNameEmotes"
                :chatGroups="chatGroups"
            />
        </el-dialog>
        <el-dialog title="群成员" :visible.sync="groupmemberShown" top="5vh" class="dialog">
            <TheGroupMemberPanel
                @dblclick="startChat"
                :groupmemberShown="groupmemberShown"
                :gin="groupmemberPanelGin"
                v-if="groupmemberShown"
            />
        </el-dialog>
        <CommonGroupsDialog @chroom="chroom" />
        <DialogAskCheckUpdate :show.sync="dialogAskCheckUpdateVisible" />
        <el-dialog title="发送骰子" :visible.sync="sendDiceShown">
            <div class="random-select">
                <el-button @click="sendDice(1)">1</el-button>
                <el-button @click="sendDice(2)">2</el-button>
                <el-button @click="sendDice(3)">3</el-button>
                <el-button @click="sendDice(4)">4</el-button>
                <el-button @click="sendDice(5)">5</el-button>
                <el-button @click="sendDice(6)">6</el-button>
            </div>
            <span slot="footer" class="random-dialog-footer">
                <el-checkbox v-model="sendDiceNew">新版</el-checkbox>
                <el-button @click="sendDiceShown = false">取消</el-button>
                <el-button type="primary" @click="sendDice(0)">随机</el-button>
            </span>
        </el-dialog>
        <el-dialog title="发送猜拳" :visible.sync="sendRpsShown">
            <div class="random-select">
                <el-button @click="sendRps(1)">石头</el-button>
                <el-button @click="sendRps(2)">剪刀</el-button>
                <el-button @click="sendRps(3)">布</el-button>
            </div>
            <span slot="footer" class="random-dialog-footer">
                <el-checkbox v-model="sendRpsNew">新版</el-checkbox>
                <el-button @click="sendRpsShown = false">取消</el-button>
                <el-button type="primary" @click="sendRps(0)">随机</el-button>
            </span>
        </el-dialog>
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
        <ChatGroupEditor :visible.sync="chatGroupEditorVisible" :chatGroups="chatGroups" @saved="onChatGroupsSaved" />
    </div>
</template>

<script lang="js">
import Room from '../components/vac-mod/ChatWindow/Room/Room.vue'
import Stickers from '../components/Stickers.vue'
import DialogAskCheckUpdate from '../components/DialogAskCheckUpdate.vue'
import CommonGroupsDialog from '../components/CommonGroupsDialog.vue'
import { Multipane, MultipaneResizer } from '../components/multipane'
import path from 'path'
import { ipcRenderer } from 'electron'
import SideBarIcon from '../components/SideBarIcon.vue'
import GroupChatIcon from '../components/GroupChatIcon.vue'
import TheRoomsPanel from '../components/TheRoomsPanel.vue'
import TheContactsPanel from '../components/TheContactsPanel.vue'
import TheGroupMemberPanel from '../components/TheGroupMemberPanel.vue'
import ProgressBar from '../components/ProgressBar.vue'
import ChatGroupEditor from '../components/ChatGroupEditor.vue'
import DownloadCompleteNotification from '../components/DownloadCompleteNotification.vue'
import ipc from '../utils/ipc'
import getAvatarUrl from '../../utils/getAvatarUrl'
import createRoom from '../../utils/createRoom'
import removeGroupNameEmotes from '../../utils/removeGroupNameEmotes'
import groupMemberCache from '../utils/groupMemberCache'
import { processFiles } from '../utils/processFiles'
import fs from 'fs'
import * as themes from '../utils/themes'

export default {
    components: {
        DialogAskCheckUpdate,
        CommonGroupsDialog,
        Room,
        Stickers,
        SideBarIcon,
        GroupChatIcon,
        TheRoomsPanel,
        TheContactsPanel,
        TheGroupMemberPanel,
        Multipane,
        MultipaneResizer,
        ProgressBar,
        ChatGroupEditor,
        DownloadCompleteNotification,
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
            isSteamVrRunning: false,
            theme: 'default',
            loading: false,
            isShutUp: false,
            sysInfo: '',
            historyCount: 0,
            historyFetchingName: '',
            dialogAskCheckUpdateVisible: false,
            contactsShown: false,
            groupmemberShown: false,
            groupmemberPanelGin: 0,
            linkify: true,
            roomPanelAvatarOnly: false,
            roomPanelWidth: undefined,
            forwardShown: false,
            forwardMulti: false,
            forwardAnonymous: false,
            lastUnreadCount: 0,
            lastUnreadCheck: 0,
            lastUnreadAt: false,
            lastUnreadCheck2: 0,
            selectedChatGroup: 'chats',
            chatGroups: [],
            sortedRooms: [],
            disableChatGroups: false,
            uploadProgress: '0',
            chatGroupsUnreadCount: {},
            disableChatGroupsRedPoint: false,
            useSinglePanel: false,
            showSinglePanel: false,
            removeGroupNameEmotes: false,
            usePanguJsRecv: false,
            hideTitleBar: false,
            showPanel: 'contact', // 'chat' or 'contact', 只有showSinglePanel为true有效
            notifyProgresses: new Map(),
            sendDiceShown: false,
            sendRpsShown: false,
            sendDiceNew: true,
            sendRpsNew: true,
            chooseFileTypeShown: false,
            tempFile: null,
            tempFileName: '',
            isInMiddle: false, // 是否从中间加载（用于支持向下翻页）
            chatGroupEditorVisible: false,
            navBackStack: [], // 后退导航栈，存储 roomId
            navForwardStack: [], // 前进导航栈，存储 roomId
            isNavigating: false, // 标记是否正在通过前进/后退导航，避免重复入栈
            stickerPanelBottom: false, // 是否启用底部表情面板模式
            stickerPanelHeight: 320, // 底部模式时的面板高度（px）
            // 聊天分组滚动条
            chatGroupContainerHeight: 0,
            chatGroupScrollHeight: 0,
            chatGroupIsDragging: false,
            chatGroupScrollbarPadding: 3,
            // roomId → groupNames Set 反向索引，避免 rooms×groups 双重循环
            _roomToGroupIndex: null,
            // 标记了 includeAllPersonal 的分组名列表
            _includeAllPersonalGroupNames: null,
        }
    },
    async created() {
        //region set status
        const STORE_PATH = await ipc.getStorePath()
        const ver = await ipc.getVersion()
        const settings = await ipc.getSettings()
        this.linkify = settings.linkify
        this.disableChatGroups = settings.disableChatGroups
        this.disableChatGroupsRedPoint = settings.disableChatGroupsRedPoint
        this.roomPanelAvatarOnly = settings.roomPanelAvatarOnly
        this.roomPanelWidth = settings.roomPanelWidth
        this.useSinglePanel = settings.useSinglePanel
        this.removeGroupNameEmotes = settings.removeGroupNameEmotes
        this.usePanguJsRecv = settings.usePanguJsRecv
        this.hideTitleBar = settings.hideTitleBar
        this.stickerPanelBottom = settings.stickerPanelBottom
        this.stickerPanelHeight = settings.stickerPanelHeight || 320
        //endregion
        //region listener
        document.addEventListener('dragover', (e) => {
            e.preventDefault()
            e.stopPropagation()
        })
        document.addEventListener('click', (e) => {
            const stickers_panel = document.getElementsByClassName('panel panel-right')
            const vac_room_footer = document.getElementsByClassName('vac-room-footer')
            if (
                stickers_panel.length > 0 &&
                !stickers_panel[0].contains(e.target) &&
                !vac_room_footer[0].contains(e.target) &&
                getComputedStyle(stickers_panel[0]).right === '15px'
            ) {
                this.panel = ''
            }
        })
        //mouse side buttons (back/forward)
        document.addEventListener('mouseup', (e) => {
            if (e.button === 3) {
                e.preventDefault()
                this.navBack()
            } else if (e.button === 4) {
                e.preventDefault()
                this.navForward()
            }
        })
        //keyboard
        document.addEventListener('keydown', (e) => {
            if (e.isComposing) return
            if (e.repeat) {
                return
            } else if (e.key === 'F1') {
                if (this.selectedRoomId) this.panel = this.panel === 'stickers' ? '' : 'stickers'
            } else if (e.key === 'Escape') {
                if (document.webkitIsFullScreen) return
                // 清除前进后退导航栈
                this.navBackStack = []
                this.navForwardStack = []
                if (this.$refs.room.messageReply || this.$refs.room.editAndResend || this.$refs.room.message)
                    this.$refs.room.resetMessage()
                else if (this.$refs.room.file) this.$refs.room.resetMediaFile()
                else if (this.$refs.room.showForwardPanel) this.$refs.room.closeForwardPanel()
                else {
                    this.closeRoom()
                }
            } else if (e.key === 'Tab') {
                if (e.ctrlKey) {
                    const rooms = this.sortedRooms
                    if (!rooms.length) return

                    const selectedRoomIndex = rooms.indexOf(this.selectedRoom)
                    let newIndex
                    if (!this.selectedRoom) newIndex = 0
                    else if (e.shiftKey) {
                        // prev room
                        newIndex = selectedRoomIndex - 1
                        if (newIndex === -1) newIndex = rooms.length - 1
                    } else {
                        // next room
                        newIndex = selectedRoomIndex + 1
                        if (newIndex === rooms.length) newIndex = 0
                    }

                    this.chroom(rooms[newIndex])
                } else {
                    let unreadRoom
                    for (let i = 5; i > 0; i--) {
                        unreadRoom = (this.visibleRooms.length ? this.visibleRooms : this.rooms).find(
                            (e) => e.unreadCount && e.priority === i,
                        )
                        if (unreadRoom) break
                    }
                    if (unreadRoom) this.chroom(unreadRoom)
                }
            } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                e.preventDefault()
                const rooms = this.sortedRooms
                if (!rooms.length) return

                const selectedRoomIndex = rooms.indexOf(this.selectedRoom)
                let newIndex
                if (!this.selectedRoom) newIndex = 0
                else if (e.key === 'ArrowUp') {
                    newIndex = selectedRoomIndex - 1
                    if (newIndex === -1) newIndex = rooms.length - 1
                } else {
                    newIndex = selectedRoomIndex + 1
                    if (newIndex === rooms.length) newIndex = 0
                }

                this.chroom(rooms[newIndex])
            } else if (e.ctrlKey) {
                switch (e.key) {
                    case '1':
                        this.selectChatGroup('chats')
                        break
                    case '2':
                        this.selectChatGroup('group')
                        break
                    case '3':
                        this.selectChatGroup('private')
                        break
                    case '4':
                    case '5':
                    case '6':
                    case '7':
                    case '8':
                    case '9':
                        const n = Number(e.key)
                        if (this.chatGroups[n - 4]) {
                            this.selectChatGroup(this.chatGroups[n - 4].name)
                        }
                        break
                    default:
                        break
                }
            }
        })
        //endregion

        if (fs.existsSync(path.join(STORE_PATH, 'font.ttf'))) {
            const myFonts = new FontFace('font', `url(${path.join(STORE_PATH, 'font.ttf')})`, {})
            myFonts.load().then(function (loadFace) {
                document.fonts.add(loadFace)
            })
        }

        themes.$$DON_CALL$$fetchThemes(STORE_PATH)

        ipcRenderer.on('setDisableChatGroupsSeeting', (_, p) => {
            this.disableChatGroups = p
            this.selectedChatGroup = 'chats'
            if (p) {
                this.chatGroupsUnreadCount = {}
            } else {
                this._rebuildRoomToGroupIndex()
                this._recomputeChatGroupsUnreadCount()
            }
        })
        ipcRenderer.on('setDisableChatGroupsRedPointSeeting', (_, p) => {
            this.disableChatGroupsRedPoint = p
            if (!p) {
                this._rebuildRoomToGroupIndex()
                this._recomputeChatGroupsUnreadCount()
            } else {
                this.chatGroupsUnreadCount = {}
            }
        })
        ipcRenderer.on('openGroupMemberPanel', (_, p) => {
            this.groupmemberShown = p.shown
            this.groupmemberPanelGin = p.gin
        })
        ipcRenderer.on('closeLoading', () => {
            this.loading = false
            this.uploadProgress = '0'
        })
        ipcRenderer.on('notify', (_, p) => this.$notify(p))
        ipcRenderer.on('addHistoryCount', (_, p) => {
            this.historyCount += p.count
            this.historyFetchingName = (p.roomId < 0 ? '群聊' : '私聊') + Math.abs(p.roomId)
        })
        ipcRenderer.on('clearHistoryCount', () => (this.historyCount = 0))
        ipcRenderer.on('notifyError', (_, p) => this.$notify.error(p))
        ipcRenderer.on('notifySuccess', (_, p) => this.$notify.success(p))
        ipcRenderer.on('notifyProgress', (_, { id, string }) => {
            const progressBar = this.$createElement('ProgressBar')
            const notification = this.$notify({
                message: this.$createElement('div', [string, progressBar]),
                customClass: 'el-notification-progress',
                duration: 0,
                showClose: !String(id).startsWith('uploadFile-'),
                onClose: () => {
                    ipc.cancelDownload(id)
                    this.notifyProgresses.delete(id)
                },
            })
            this.notifyProgresses.set(id, { progressBar, notification })
        })
        ipcRenderer.on('notifyProgressValue', (_, { id, value }) => {
            const instance = this.notifyProgresses.get(id)
            if (instance) {
                instance.progressBar.componentInstance.setValue(value)
            }
        })
        ipcRenderer.on('notifyProgressClose', (_, id) => {
            const instance = this.notifyProgresses.get(id)
            if (instance) {
                instance.notification.close()
            }
        })
        ipcRenderer.on('notifyDownloadComplete', (_, { fileName, filePath }) => {
            const message = this.$createElement(DownloadCompleteNotification, {
                props: { fileName },
                on: { open: () => ipc.openDownloadedFile(filePath) },
            })
            this.$notify.success({
                title: '下载完成',
                message,
                customClass: 'el-notification-download-complete',
                offset: 80,
                duration: 10000,
            })
        })
        ipcRenderer.on('message', (_, p) => this.$message(p))
        ipcRenderer.on('messageError', (_, p) => this.$message.error(p))
        ipcRenderer.on('messageSuccess', (_, p) => this.$message.success(p))
        ipcRenderer.on('setShutUp', (_, p) => (this.isShutUp = p))
        ipcRenderer.on('chroom', (_, p) => this.chroom(p))
        ipcRenderer.on('confirmIgnoreChat', (_, data) => {
            const message = [
                '屏蔽群聊将不再接受该群的消息。',
                '屏蔽个人将不再接受此人发送的私聊消息，且会自动隐藏其发送的群消息。',
            ]
            this.$confirm(message[data.id > 0 ? 1 : 0], `确定屏蔽 ${data.name}(${Math.abs(data.id)}) 的消息?`, {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning',
            }).then(() => {
                ipc.ignoreChat(data)
            })
        })
        ipcRenderer.on('confirmDeleteMessage', (_, { roomId, messageId }) => {
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
                fs.rmdir(path.join(STORE_PATH, 'stickers', dirname), { recursive: true }, () =>
                    this.$message('删除成功'),
                )
            })
        })
        ipcRenderer.on('moveSticker', async (_, filename) => {
            /** @type {string} */
            let value
            try {
                ;({ value } = await this.$prompt(
                    '若目录不存在则会自动创建，留空则移动到默认分类',
                    '输入 Sticker 分类目录名称',
                    {
                        confirmButtonText: '确定',
                        cancelButtonText: '取消',
                    },
                ))
                value = value ? value.trim() : 'Default'
            } catch (action) {
                return
            }
            if (value == 'Recent') {
                this.$message.error('请勿使用这个分类名称')
                return
            }
            const defaultDir = path.join(STORE_PATH, 'stickers')
            const newDir = value == 'Default' ? defaultDir : path.join(defaultDir, value)
            try {
                if (!fs.existsSync(newDir)) {
                    await fs.promises.mkdir(newDir)
                }
                await fs.promises.rename(filename, path.join(newDir, path.basename(filename)))
            } catch (err) {
                console.error('Failed to move sticker', filename, 'to', newDir)
                console.error(err)
                this.$message.error('移动失败')
                return
            }
            this.$message.success('移动成功')
        })
        ipcRenderer.on('sendDice', (_) => {
            this.sendDiceShown = true
        })
        ipcRenderer.on('sendRps', (_) => {
            this.sendRpsShown = true
        })
        ipcRenderer.on('updateRoom', (_, room) => {
            const oldRooms = this.rooms.filter((item) => item.roomId !== room.roomId)
            let left = 0,
                right = oldRooms.length - 1,
                mid = 0
            while (left <= right) {
                mid = Math.floor((left + right) / 2)
                if (room.utime > oldRooms[mid].utime) {
                    right = mid - 1
                } else {
                    left = mid + 1
                }
            }
            this.rooms = [...oldRooms.slice(0, left), room, ...oldRooms.slice(left)]
            this._recomputeChatGroupsUnreadCount()
        })
        ipcRenderer.on('addMessage', (_, { roomId, message }) => {
            message.__v_skip = true
            if (roomId !== this.selectedRoomId) return
            const index = this.messages.findIndex((e) => e._id === message._id)
            if (index !== -1) {
                console.warning(`[WARN] Duplicated message ID ${message._id}`, message, this.messages[index])
                return
            }
            this.messages = [...this.messages, message]
            if (this.lastUnreadCount >= 10 && !message.system) this.lastUnreadCount++
            if (message.at && message.senderId != this.account) this.lastUnreadAt = true
            if (message.system) {
                const memberChangeText = ['加入了本群', '离开了本群', '踢了']
                for (const text of memberChangeText) {
                    if (message.content.includes(text)) {
                        this.$refs.room.updateGroupMembers()
                        break
                    }
                }
            }
        })
        ipcRenderer.on('deleteMessage', (_, messageId) => {
            const message = this.messages.find((e) => e._id === messageId)
            if (message) {
                message.deleted = Date.now()
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
        ipcRenderer.on('renewMessage', (_, { messageId, message }) => {
            const oldMessageIndex = this.messages.findIndex((e) => e._id === messageId)
            if (oldMessageIndex !== -1 && message) {
                this.messages[oldMessageIndex] = {
                    ...this.messages[oldMessageIndex],
                    ...message,
                }
                this.messages = [...this.messages]
            }
        })
        ipcRenderer.on('renewMessageURL', (_, { messageId, URL }) => {
            const message = this.messages.find((e) => e._id === messageId)
            if (message && URL !== 'error') {
                message.file.url = URL
                this.messages = [...this.messages]
            }
        })
        ipcRenderer.on('setOnline', () => (this.reconnecting = this.offline = false))
        ipcRenderer.on('setOffline', (_, msg) => {
            this.offlineReason = msg
            this.offline = true
        })
        ipcRenderer.on('clearCurrentRoomUnread', () => {
            this.selectedRoom.unreadCount = 0
            this._recomputeChatGroupsUnreadCount()
        })
        ipcRenderer.on('clearRoomUnread', (_, roomId) => {
            const room = this.rooms.find((e) => e.roomId === roomId)
            if (room) {
                room.unreadCount = 0
                room.at = false
                this._recomputeChatGroupsUnreadCount()
            }
        })
        ipcRenderer.on('updatePriority', (_, p) => (this.priority = p))
        ipcRenderer.on('setAllRooms', (_, p) => (this.rooms = p))
        ipcRenderer.on('setAllChatGroups', (_, p) => (this.chatGroups = p || []))
        ipcRenderer.on('setMessages', (_, p) => {
            for (const message of p) {
                message.__v_skip = true
            }
            this.messages = p
            this.messagesLoaded = false
        })
        ipcRenderer.on('startChat', (_, { id, name }) => this.startChat(id, name))
        ipcRenderer.on('closePanel', () => (this.panel = ''))
        ipcRenderer.on(
            'gotOnlineData',
            (_, { online, nick, uin, priority, sysInfo, updateCheck, isSteamVrRunning }) => {
                this.offline = !online
                this.account = uin
                this.priority = priority
                this.username = nick
                this.sysInfo = sysInfo
                    ? sysInfo +
                      `\n\nClient ${ver}
Electron ${process.versions.electron}
Node ${process.versions.node}
Chromium ${process.versions.chrome}`
                    : ''
                this.isSteamVrRunning = isSteamVrRunning
                if (updateCheck === 'ask') this.dialogAskCheckUpdateVisible = true

                // 预加载所有群的成员列表（用于查找共同群聊功能）
                setTimeout(() => {
                    groupMemberCache.preloadAllGroups().catch((err) => {
                        console.error('Failed to preload group members:', err)
                    })
                }, 3000) // 延迟3秒后开始预加载，避免影响启动速度
            },
        )
        ipcRenderer.on('uploadProgress', (_, p) => {
            if (p > this.uploadProgress) {
                this.uploadProgress = p
            }
        })
        ipcRenderer.on('useSinglePanel', (_, b) => {
            if (this.useSinglePanel && window.innerWidth > 720) {
                this.$refs.roomPanel.style.width = '360px'
            }
            this.useSinglePanel = b
            this.handleResize({ target: { innerWidth: window.innerWidth } })
        })
        ipcRenderer.on('setRemoveGroupNameEmotes', (_, b) => {
            this.removeGroupNameEmotes = b
        })
        ipcRenderer.on('setUsePanguJsRecv', (_, b) => {
            this.usePanguJsRecv = b
        })
        ipcRenderer.on('setStickerPanelBottom', (_, b) => {
            this.stickerPanelBottom = b
        })
        ipcRenderer.on('forwardSingleMessage', (_, message_id) => {
            this.chooseForwardTarget(false, false)
        })
        ipcRenderer.on('gotoMessage', async (_, { roomId, messageId }) => {
            await this.gotoMessage(roomId, messageId)
        })
        ipc.setSelectedRoom(0, '')
        ipc.requestOnlineData()

        window.addEventListener('resize', this.handleResize)
        this.handleResize({ target: { innerWidth: window.innerWidth } })
        console.log('加载完成')
    },
    methods: {
        async sendMessage({
            content,
            roomId,
            files,
            replyMessage,
            room,
            media: extraMedia,
            resend,
            sticker,
            messageType,
        }) {
            this.loading = true
            if (!room && !roomId) {
                room = this.selectedRoom
                roomId = room.roomId
            }
            if (!room) room = this.rooms.find((e) => e.roomId === roomId)
            if (!roomId) roomId = room.roomId

            const hasImages = (files || []).some((file) => file.type.includes('image'))
            const compressImages = hasImages ? (await ipc.getSettings()).compressImages : false
            const processed = await processFiles(files || [], (msg) => this.$message.warning(msg), compressImages)
            const media = [...(extraMedia || []), ...processed.media]

            if (resend) ipc.deleteMessage(roomId, resend)
            ipc.sendMessage({
                content,
                roomId,
                file: processed.file,
                replyMessage,
                room,
                media,
                sticker,
                messageType,
            })
        },
        clearLastUnreadCount() {
            this.lastUnreadCount = 0
        },
        async clearLastUnreadAt() {
            this.lastUnreadAt = false
            await this.fetchMessage(false, this.lastUnreadCount, true)
        },
        async fetchMessage(reset, number, at = false) {
            if (reset) {
                this.messagesLoaded = false
                this.messages = []
            }
            const _roomId = this.selectedRoom.roomId
            let msgs2add
            try {
                msgs2add = await ipc.fetchMessage(_roomId, this.messages.length)
            } catch (e) {
                console.error('fetchMessage failed:', e)
                return
            }
            let nonSystemMessageCount = 0
            if (number) {
                while (nonSystemMessageCount < number) {
                    if (_roomId !== this.selectedRoom.roomId) return
                    let msgs
                    try {
                        msgs = await ipc.fetchMessage(_roomId, this.messages.length + msgs2add.length)
                    } catch (e) {
                        console.error('fetchMessage loop failed:', e)
                        break
                    }
                    nonSystemMessageCount += msgs.filter((e) => !e.system).length
                    msgs2add.unshift(...msgs)
                    if (!msgs.length) {
                        this.$message.error('Message not found')
                        break
                    }
                }
            }
            setTimeout(() => {
                if (_roomId !== this.selectedRoom.roomId) return

                const existingIds = new Set(this.messages.map((e) => e._id))
                // 过滤掉已经存在的消息，而不是全部丢弃
                // 旧逻辑 some+return 会导致 messagesLoaded 永远不被设为 true，
                // 进而 Room.vue 的 loadingMessages 一直是 true，消息完全空白
                const newMsgs = msgs2add.filter((e) => !existingIds.has(e._id))
                if (newMsgs.length) {
                    for (const msg of newMsgs) {
                        msg.__v_skip = true
                    }
                    this.messages = [...newMsgs, ...this.messages]
                } else {
                    this.messagesLoaded = true
                }

                if (at) {
                    const atMessages = this.messages.filter((e) => e.at)
                    if (atMessages.length) {
                        setTimeout(() => {
                            const _id = atMessages[atMessages.length - 1]._id
                            if (!_id) {
                                this.$message.error('Message not found')
                                return
                            }
                            console.log('last unread at message ID', _id)
                            setTimeout(() => {
                                this.$refs.room.scrollToMessage(_id)
                            }, 0)
                        }, 0)
                    } else {
                        this.$message.error('Message not found')
                    }
                }
            }, 0)

            return msgs2add[msgs2add.length - 1]
        },
        openImage: ipc.downloadFileByMessageData,
        async sendSticker(url) {
            const messageType = await ipc.getMessgeTypeSetting()
            if (this.selectedRoom) {
                const roomRef = this.$refs.room
                const content = roomRef?.getMessageText() || ''
                const replyMessage = roomRef?.messageReply || null
                this.sendMessage({
                    content,
                    room: this.selectedRoom,
                    replyMessage,
                    media: [{ url }],
                    sticker: true,
                    messageType: messageType === 'anonymous' ? 'anonymous' : undefined,
                })

                if (roomRef) {
                    roomRef.resetMessage(true)
                }
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
                room: this.selectedRoom,
                messageType: messageType === 'anonymous' ? 'anonymous' : 'text',
            })
            if (!this.stickerPanelBottom && window.innerWidth < 1200) {
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
                this.closeRoom()
                return
            }
            this.showPanel = 'chat'
            if (room === this.account) return this.startChat(this.account, this.username)
            if (typeof room === 'number') room = this.rooms.find((e) => e.roomId === room)
            if (!room) {
                this.$message.error('该对话不存在，可能未曾对话过或未加好友')
                return
            }
            // 检查是否已在独立窗口打开，如果是则聚焦到独立窗口
            if (await ipc.isRoomInChatWindow(room.roomId)) {
                ipc.focusChatWindow(room.roomId)
                return
            }
            this.lastUnreadCount = room.unreadCount
            this.lastUnreadAt = !!room.at
            if (this.selectedRoom.roomId != 0) {
                this.selectedRoom.at = false
                ipc.updateRoom(this.selectedRoom.roomId, { at: false })
            }
            if (this.selectedRoom.roomId === room.roomId) return
            // 记录导航历史
            if (!this.isNavigating) {
                this.navBackStack.push(this.selectedRoom.roomId)
                this.navForwardStack = []
            }
            this.selectedRoomId = room.roomId
            this.isInMiddle = false // 切换房间时重置中间加载状态
            ipc.setSelectedRoom(room.roomId, room.roomName)
            this.fetchMessage(true)

            // 如果是群聊，更新群成员缓存
            if (room.roomId < 0) {
                groupMemberCache.updateGroupCache(-room.roomId).catch((err) => {
                    console.error('Failed to update group member cache:', err)
                })
            }
        },
        downloadImage: ipc.downloadImage,
        async gotoMessage(roomId, messageId) {
            // 如果不是当前房间，先切换房间
            if (this.selectedRoom.roomId !== roomId) {
                const room = this.rooms.find((e) => e.roomId === roomId)
                if (!room) {
                    this.$message.error('该对话不存在')
                    return
                }
                await this.chroom(room)
            }

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
                const msgs = await ipc.fetchMessagesAround(roomId, messageId, 20, 20)
                if (msgs && msgs.length > 0) {
                    this.messages = msgs
                    this.messagesLoaded = false // 允许继续向上加载
                    this.isInMiddle = true // 标记从中间加载
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
            if (!this.isInMiddle || this.loading) return
            const lastMessage = this.messages[this.messages.length - 1]
            if (!lastMessage) return

            this.loading = true
            try {
                // 使用 fetchMessagesAround，before=0 表示只获取之后的消息
                const msgs = await ipc.fetchMessagesAround(this.selectedRoom.roomId, lastMessage._id, 0, 20)
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
        pokeGroup(uin) {
            const group = -this.selectedRoom.roomId
            ipc.sendGroupPoke(group, uin)
            this.$refs.room.focusTextarea()
        },
        pokeFriend() {
            if (this.selectedRoom.roomId > 0) ipc.sendGroupPoke(this.selectedRoom.roomId, this.selectedRoom.roomId)
            this.$refs.room.focusTextarea()
        },
        openForward(e) {
            ipc.openForward(e.resId, e.fileName, e.fallbackResId)
        },
        stopFetchingHistory() {
            ipc.stopFetchMessage()
        },
        closeRoom() {
            this.selectedRoomId = 0
            this.messages = []
            this.lastUnreadCount = 0
            this.lastUnreadAt = false
            this.isInMiddle = false // 关闭房间时重置中间加载状态
            this.showPanel = 'contact'
            ipc.setSelectedRoom(0, '')
            document.title = 'Icalingua++'
        },
        roomPanelResize(pane, resizer, size) {
            if (!pane.className.includes('panel rooms-panel')) return // 表情面板调整大小也会触发这个事件
            size = +size.slice(0, -2)
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
            if (!this.roomPanelAvatarOnly && size > 140) {
                this.roomPanelWidth = size
            }
        },
        roomPanelResizeStop(pane, resizer, size) {
            const width = document.getElementsByClassName('panel rooms-panel')[0].offsetWidth
            ipc.setRoomPanelSetting(this.roomPanelAvatarOnly, width)
        },
        startStickerHeightResize(e) {
            e.preventDefault()
            const startY = e.pageY
            const startHeight = this.stickerPanelHeight
            const onMove = (ev) => {
                // 向上拖增大高度（面板在底部）
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
        sendForward(id, name) {
            this.$refs.room.sendForward(id, name, this.forwardMulti, this.forwardAnonymous)
            this.forwardShown = false
        },
        chooseForwardTarget(multi = true, anonymous = false) {
            this.forwardShown = true
            this.forwardMulti = multi
            this.forwardAnonymous = anonymous
            console.log('forwardMulti', multi, 'forwardAnonymous', anonymous)
        },
        onChatGroupsSaved(newGroups) {
            this.chatGroups = newGroups
            // 如果当前选中的分组被删除了，切回全部
            if (
                this.selectedChatGroup !== 'chats' &&
                this.selectedChatGroup !== 'group' &&
                this.selectedChatGroup !== 'private' &&
                !newGroups.find((g) => g.name === this.selectedChatGroup)
            ) {
                this.selectedChatGroup = 'chats'
            }
        },
        removeChatGroup(group) {
            this.$confirm(`此操作将永久删除 ${group} 聊天分组, 是否继续?`, '提示', {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning',
            })
                .then(() => {
                    ipc.removeChatGroup(group)
                    this.chatGroups = this.chatGroups.filter((e) => e.name !== group)
                    if (this.selectedChatGroup === group) this.selectedChatGroup = 'chats'
                })
                .catch()
        },
        updateChatGroup(groupName) {
            // 所有会话分组不能被更新
            if (this.selectedRoomId === 0) return

            // 找到要更改的 chat group
            const index = Object.values(this.chatGroups).findIndex(({ name }) => name === groupName)
            const chatGroup = this.chatGroups[index]

            const roomName =
                this.selectedRoomId < 0 && this.removeGroupNameEmotes
                    ? removeGroupNameEmotes(this.selectedRoom.roomName)
                    : this.selectedRoom.roomName
            // 移除 room
            if (chatGroup.rooms.includes(this.selectedRoomId)) {
                chatGroup.rooms = chatGroup.rooms.filter((e) => e !== this.selectedRoomId)
                this.$message({
                    type: 'success',
                    message: `已将 ${roomName} 移出分组 ${groupName}`,
                })
            }
            // 添加 room
            else {
                chatGroup.rooms.push(this.selectedRoomId)
                this.$message({
                    type: 'success',
                    message: `已将 ${roomName} 加入分组 ${groupName}`,
                })
            }

            // 保存更改到数据库
            const { rooms } = chatGroup // 解构防止响应式对象破坏存储
            ipc.updateChatGroup(groupName, { rooms })
        },
        handleMouseDown(e) {
            if (e.button === 1) {
                e.preventDefault()
            }
        },
        onChatGroupScroll(e) {
            this._chatGroupPendingScrollTop = e.target.scrollTop
            if (this._chatGroupScrollFrame) return
            this._chatGroupScrollFrame = requestAnimationFrame(() => {
                this._chatGroupScrollFrame = null
                this._updateChatGroupScrollbarPosition(this._chatGroupPendingScrollTop)
            })
        },
        _updateChatGroupScrollbarPosition(scrollTop) {
            const thumb = this.$refs.chatGroupScrollbarThumb
            if (!thumb) return

            const maxScroll = this.chatGroupScrollHeight - this.chatGroupContainerHeight
            const maxOffset = this.groupTrackHeight - this.groupThumbHeight
            const ratio = maxScroll > 0 ? Math.max(0, Math.min(1, scrollTop / maxScroll)) : 0
            thumb.style.transform = `translateY(${this.chatGroupScrollbarPadding + ratio * maxOffset}px)`
        },
        onGroupThumbMouseDown(e) {
            this.chatGroupIsDragging = true
            this._groupDragStartY = e.clientY
            this._groupDragStartScrollTop = this.$refs.chatGroupContainer?.scrollTop || 0
            this._onGroupMouseMove = (ev) => this.onGroupThumbMouseMove(ev)
            this._onGroupMouseUp = () => this.onGroupThumbMouseUp()
            document.addEventListener('mousemove', this._onGroupMouseMove)
            document.addEventListener('mouseup', this._onGroupMouseUp)
        },
        onGroupThumbMouseMove(e) {
            const delta = e.clientY - this._groupDragStartY
            const maxScroll = this.chatGroupScrollHeight - this.chatGroupContainerHeight
            const maxOffset = this.groupTrackHeight - this.groupThumbHeight
            const el = this.$refs.chatGroupContainer
            if (el) el.scrollTop = this._groupDragStartScrollTop + (delta / maxOffset) * maxScroll
        },
        onGroupThumbMouseUp() {
            document.removeEventListener('mousemove', this._onGroupMouseMove)
            document.removeEventListener('mouseup', this._onGroupMouseUp)
            this._onGroupMouseMove = null
            this._onGroupMouseUp = null
            this.chatGroupIsDragging = false
        },
        onGroupTrackMouseDown(e) {
            const el = this.$refs.chatGroupContainer
            if (!el) return
            const rect = el.getBoundingClientRect()
            const clickY = e.clientY - rect.top
            const ratio = (clickY - this.chatGroupScrollbarPadding) / this.groupTrackHeight
            const maxScroll = this.chatGroupScrollHeight - this.chatGroupContainerHeight
            el.scrollTop = ratio * maxScroll - this.groupThumbHeight / 2
        },
        navBack() {
            if (this.navBackStack.length === 0) return
            const targetRoomId = this.navBackStack.pop()
            if (this.selectedRoom.roomId !== 0) {
                this.navForwardStack.push(this.selectedRoom.roomId)
            }
            this.isNavigating = true
            this.chroom(targetRoomId).finally(() => {
                this.isNavigating = false
            })
        },
        navForward() {
            if (this.navForwardStack.length === 0) return
            const targetRoomId = this.navForwardStack.pop()
            if (this.selectedRoom.roomId !== 0) {
                this.navBackStack.push(this.selectedRoom.roomId)
            }
            this.isNavigating = true
            this.chroom(targetRoomId).finally(() => {
                this.isNavigating = false
            })
        },
        getAvatarUrl,
        handleResize(e) {
            let newWidth = e.target.innerWidth
            if (!this.useSinglePanel) {
                if (newWidth < 880) {
                    this.showSinglePanel = false
                    this.roomPanelResize(this.$refs.roomPanel, null, `${newWidth - 500}px`)
                }
                return
            }
            let oldValue = this.showSinglePanel
            this.showSinglePanel = newWidth < 720
            if (this.showSinglePanel) this.roomPanelResize(this.$refs.roomPanel, null, '300px')
            if (this.showSinglePanel && this.selectedRoomId === 0) this.showPanel = 'contact'
            if (oldValue && !this.showSinglePanel) this.$refs.roomPanel.style.width = '300px'
        },
        async sendDice(value) {
            if (!value) {
                value = Math.floor(Math.random() * 6) + 1
            }
            this.sendDiceShown = false
            if (this.sendDiceNew) {
                const messageType = await ipc.getMessgeTypeSetting()
                this.sendMessage({
                    content: `[QLottie: 33,358,${value}]`,
                    room: this.selectedRoom,
                    messageType: messageType === 'anonymous' ? 'anonymous' : 'text',
                })
            } else {
                this.sendMessage({
                    content: value.toString(),
                    room: this.selectedRoom,
                    messageType: 'dice',
                })
            }
        },
        async sendRps(value) {
            if (!value) {
                value = Math.floor(Math.random() * 3) + 1
            }
            this.sendRpsShown = false
            if (this.sendRpsNew) {
                if (value === 1) value = 3
                else if (value === 3) value = 1
                const messageType = await ipc.getMessgeTypeSetting()
                this.sendMessage({
                    content: `[QLottie: 34,359,${value}]`,
                    room: this.selectedRoom,
                    messageType: messageType === 'anonymous' ? 'anonymous' : 'text',
                })
            } else {
                this.sendMessage({
                    content: value.toString(),
                    room: this.selectedRoom,
                    messageType: 'rps',
                })
            }
        },
        chooseFileType(type) {
            this.chooseFileTypeShown = false
            this.$refs.room.onFileChange(this.tempFile, type === 'file')
            this.tempFile = null
        },
        async openChooseFileType(file) {
            if (!file) return
            if ((await ipc.getSettings()).disableChooseFileType) return this.$refs.room.onFileChange(file)
            this.chooseFileTypeShown = true
            this.tempFile = file
            this.tempFileName = '选择文件 ' + file[0].name + ' 的发送方式'
        },
        selectChatGroup(group) {
            if (this.selectedChatGroup === group) {
                // 点击已选中的分组，滚动聊天列表到顶部
                const content = this.$refs.roomsPanel.$el.querySelector('.content')
                if (content) content.scrollTop = 0
            } else {
                this.selectedChatGroup = group
            }
        },
        switchUnreadRoom() {
            let unreadRoom
            for (let i = 5; i > 0; i--) {
                unreadRoom = (this.visibleRooms.length ? this.visibleRooms : this.rooms).find(
                    (e) => e.unreadCount && e.priority === i,
                )
                if (unreadRoom) break
            }
            if (unreadRoom) this.chroom(unreadRoom)
        },
        /** 重建 roomId → groupNames 反向索引（chatGroups 变化时调用） */
        _rebuildRoomToGroupIndex() {
            const idx = new Map()
            const includeAllPersonalNames = new Set()
            for (const g of this.chatGroups) {
                if (g.includeAllPersonal) {
                    includeAllPersonalNames.add(g.name)
                }
                for (const roomId of g.rooms) {
                    if (!idx.has(roomId)) idx.set(roomId, new Set())
                    idx.get(roomId).add(g.name)
                }
            }
            this._roomToGroupIndex = idx
            this._includeAllPersonalGroupNames = includeAllPersonalNames
        },
        /** 利用反向索引计算各聊天分组中满足通知条件的会话数量（O(rooms)） */
        _recomputeChatGroupsUnreadCount() {
            if (this.disableChatGroups || this.disableChatGroupsRedPoint) {
                this.chatGroupsUnreadCount = {}
                return
            }
            const unread = {}
            const selectedId = this.selectedRoomId
            for (const e of this.rooms) {
                if (selectedId && e.roomId === selectedId) continue
                if (e.unreadCount > 0 && (e.priority >= this.priority || e.at)) {
                    unread['chats'] = (unread['chats'] || 0) + 1
                    if (e.roomId < 0) unread['group'] = (unread['group'] || 0) + 1
                    if (e.roomId > 0) unread['private'] = (unread['private'] || 0) + 1
                    // 反向索引 O(1) 查找该 room 所属的自定义分组
                    const groups = new Set(this._roomToGroupIndex?.get(e.roomId) || [])
                    // includeAllPersonal 分组匹配所有私聊；Set 可避免和显式分组重复计数
                    if (e.roomId > 0 && this._includeAllPersonalGroupNames) {
                        for (const gName of this._includeAllPersonalGroupNames) {
                            groups.add(gName)
                        }
                    }
                    for (const gName of groups) {
                        unread[gName] = (unread[gName] || 0) + 1
                    }
                }
            }
            this.chatGroupsUnreadCount = unread
        },
    },
    computed: {
        cssVars() {
            return themes.recalcTheme()
        },
        selectedRoom() {
            return this.rooms.find((e) => e.roomId === this.selectedRoomId) || { roomId: 0 }
        },
        forwardTitle() {
            return (this.forwardAnonymous ? '隐藏发送者后' : '') + (this.forwardMulti ? '合并' : '逐条') + '转发到...'
        },
        visibleRooms() {
            switch (this.selectedChatGroup) {
                case 'chats':
                    return this.rooms
                case 'group':
                    return this.rooms.filter((e) => e.roomId < 0)
                case 'private':
                    return this.rooms.filter((e) => e.roomId > 0)
                default:
                    const group = this.chatGroups.find((g) => g.name === this.selectedChatGroup)
                    if (!group) return []
                    return this.rooms.filter(
                        (e) => group.rooms.includes(e.roomId) || (group.includeAllPersonal && e.roomId > 0),
                    )
            }
        },
        showChatGroupScrollbar() {
            return this.chatGroupScrollHeight > this.chatGroupContainerHeight && this.chatGroupContainerHeight > 0
        },
        groupThumbHeight() {
            if (this.chatGroupScrollHeight <= 0) return 0
            const ratio = this.chatGroupContainerHeight / this.chatGroupScrollHeight
            return Math.max(20, ratio * this.chatGroupContainerHeight)
        },
        groupTrackHeight() {
            return this.chatGroupContainerHeight - this.chatGroupScrollbarPadding * 2
        },
    },
    mounted() {
        this._updateChatGroupContainer = () => {
            const el = this.$refs.chatGroupContainer
            if (el) {
                this.chatGroupContainerHeight = el.clientHeight
                this.chatGroupScrollHeight = el.scrollHeight
                this.$nextTick(() => this._updateChatGroupScrollbarPosition(el.scrollTop))
            }
        }
        // 等待 DOM 完全渲染后再测量
        this.$nextTick(() => {
            this._updateChatGroupContainer()
            this._chatGroupResizeObserver = new ResizeObserver(this._updateChatGroupContainer)
            const el = this.$refs.chatGroupContainer
            if (el) this._chatGroupResizeObserver.observe(el)
        })
    },
    beforeDestroy() {
        if (this._chatGroupResizeObserver) {
            this._chatGroupResizeObserver.disconnect()
            this._chatGroupResizeObserver = null
        }
        if (this._chatGroupScrollFrame) {
            cancelAnimationFrame(this._chatGroupScrollFrame)
            this._chatGroupScrollFrame = null
        }
        if (this._onGroupMouseUp) this.onGroupThumbMouseUp()
    },
    watch: {
        chatGroups: {
            handler() {
                this._rebuildRoomToGroupIndex()
                this._recomputeChatGroupsUnreadCount()
                this.$nextTick(this._updateChatGroupContainer)
            },
            deep: true,
        },
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
        },
        lastUnreadAt(n, o) {
            console.log('lastUnreadAt', n)
            if (n) {
                if (this.lastUnreadCheck2) {
                    clearTimeout(this.lastUnreadCheck2)
                }
                this.lastUnreadCheck2 = setTimeout(() => {
                    console.log('Timeout')
                    this.lastUnreadAt = false
                }, 30000)
            }
        },
        rooms() {
            this._recomputeChatGroupsUnreadCount()
        },
        selectedRoomId() {
            this._recomputeChatGroupsUnreadCount()
        },
        priority() {
            this._recomputeChatGroupsUnreadCount()
        },
    },
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
    z-index: 2000;

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
    overflow-x: hidden;
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

// 聊天区+底部表情面板的纵向容器（底部模式时启用）
.chat-area {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.sticker-bottom-resizer {
    // 视觉上不占空间：3px hit area 通过负 margin 重叠到下方面板的 border-top 上
    // 用户看到的依然是那 1px 的 border，但鼠标 hover 在该 border 附近时即可拖拽
    height: 3px;
    margin-bottom: -3px;
    width: 100%;
    cursor: row-resize;
    background-color: transparent;
    flex-shrink: 0;
    position: relative;
    z-index: 3;
}

.sticker-bottom-container {
    width: 100%;
    min-height: 120px;
    flex-shrink: 0;
    border-top: var(--chat-border-style);
    overflow: hidden;
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

.upload-progress {
    display: block;
    position: absolute;
    z-index: 2000;
    bottom: 66px;
    right: 35px;
    height: 14px;
    color: var(--chat-message-color-date);
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
    max-width: 720px;
    z-index: 3;

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

    &.is-single {
        flex-grow: 1;
    }
}

.chat-groups-container {
    display: flex;
    flex-direction: column;
    z-index: 3;
}

.chat-group-wrapper {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
}

.chat-group {
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
}
.chat-group::-webkit-scrollbar {
    width: 0;
    height: 0;
}

.custom-scrollbar-group {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 4px;
    z-index: 10;
    opacity: 0;
    transition: opacity 0.15s;
}
.chat-group-wrapper:hover .custom-scrollbar-group,
.custom-scrollbar-group.is-dragging {
    opacity: 1;
}
.custom-scrollbar-group-thumb {
    width: 4px;
    border-radius: 2px;
    background-color: rgba(255, 255, 255, 0.3);
    transition: background-color 0.15s;
    will-change: transform;
}
.custom-scrollbar-group:not(.is-dragging) .custom-scrollbar-group-thumb:hover,
.custom-scrollbar-group.is-dragging .custom-scrollbar-group-thumb {
    background-color: rgba(255, 255, 255, 0.6);
}

.random-select {
    display: flex;

    .el-button {
        flex-grow: 1;
    }
}

.random-dialog-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;

    .el-checkbox {
        margin-right: 8px;
    }

    .el-button + .el-button {
        margin-left: 0;
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
    min-width: 300px;
    flex-grow: 1;

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

.el-dialog__wrapper .el-dialog .el-dialog__body,
.el-dialog__header,
.el-dialog__footer {
    background-color: var(--panel-background);
}

.el-dialog__wrapper .el-dialog .el-dialog__title {
    color: var(--panel-color-name);
}

.el-message-box__wrapper .el-message-box {
    background-color: var(--panel-background, #ffffff);
    border: var(--chat-border-style, 1px solid #e1e4e8);
}

.el-message-box__wrapper .el-message-box .el-message-box__title {
    color: var(--panel-color-name, #303133);
}
.el-message-box__wrapper .el-message-box .el-message-box__content {
    color: var(--panel-color-desc, #606266);
}

.el-notification {
    background-color: var(--panel-background);
    border: var(--chat-border-style);
}

.el-notification .el-notification__group .el-notification__title {
    color: var(--panel-color-name);
}
.el-notification .el-notification__group .el-notification__content {
    color: var(--panel-color-desc);
}

.el-notification-progress .el-notification__group {
    width: 100%;
}
.el-notification-progress .el-progress-bar {
    margin-top: 8px;
}
</style>
