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
                        :show-new-messages-divider="!isInMiddle"
                        :unread-divider-count="unreadDividerCount"
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
                        :pending-messages-count="deferredIncomingMessages.length"
                        @clear-last-unread-count="clearLastUnreadCount"
                        @clear-last-unread-at="clearLastUnreadAt"
                        @locate-message="locateMessage"
                        @locate-unread-message="locateUnreadMessage"
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
                        @return-to-latest="returnToLatest"
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
import { createRendererLifecycleScope } from '../utils/rendererLifecycleScope'
import { createRoomUpdateBatch, mergeRoomUpdatesByUtime } from '../utils/roomUpdateBatch'
import {
    compareMessageOrder,
    getMessageCursor,
    mergeMessageLists,
    messageIdKey,
    normalizeMessageList,
} from '../utils/messageOrder'
import fs from 'fs'
import * as themes from '../utils/themes'

const NEARBY_MESSAGE_LOAD_LIMIT = 100

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
            messageIndex: new Map(),
            pendingIncomingMessages: [],
            pendingIncomingIds: new Set(),
            pendingIncomingRoomId: null,
            pendingIncomingFrame: null,
            deferredIncomingMessages: [],
            deferredIncomingIds: new Set(),
            messageLoadGeneration: 0,
            selectedRoomId: 0,
            account: 0,
            messagesLoaded: false,
            dbUpgrade: { active: false, step: 0, total: 0, message: '' },
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
            unreadDividerCount: 0,
            lastUnreadCheck: 0,
            lastUnreadAt: false,
            lastUnreadAtMessageId: null,
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
        this.lifecycleScope = createRendererLifecycleScope()
        const roomUpdateBatch = createRoomUpdateBatch({
            schedule: (callback) => this.lifecycleScope.animationFrame(callback),
            cancel: (frame) => this.lifecycleScope.cancelAnimationFrame(frame),
            apply: (updates) => {
                this.rooms = mergeRoomUpdatesByUtime(this.rooms, updates)
            },
        })
        this.lifecycleScope.addCleanup(roomUpdateBatch.clear)
        //region set status
        const STORE_PATH = await ipc.getStorePath()
        const ver = await ipc.getVersion()
        this.dbUpgrade = await ipc.getDbUpgradeProgress()
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
        this.lifecycleScope.onIpc('dbUpgradeProgress', (_, progress) => {
            this.dbUpgrade = progress
        })
        this.lifecycleScope.onEvent(document, 'dragover', (e) => {
            e.preventDefault()
            e.stopPropagation()
        })
        this.lifecycleScope.onEvent(document, 'click', (e) => {
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
        this.lifecycleScope.onEvent(document, 'mouseup', (e) => {
            if (e.button === 3) {
                e.preventDefault()
                this.navBack()
            } else if (e.button === 4) {
                e.preventDefault()
                this.navForward()
            }
        })
        //keyboard
        this.lifecycleScope.onEvent(document, 'keydown', (e) => {
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

        this.lifecycleScope.onIpc('setDisableChatGroupsSeeting', (_, p) => {
            this.disableChatGroups = p
            this.selectedChatGroup = 'chats'
            if (p) {
                this.chatGroupsUnreadCount = {}
            } else {
                this._rebuildRoomToGroupIndex()
                this._recomputeChatGroupsUnreadCount()
            }
        })
        this.lifecycleScope.onIpc('setDisableChatGroupsRedPointSeeting', (_, p) => {
            this.disableChatGroupsRedPoint = p
            if (!p) {
                this._rebuildRoomToGroupIndex()
                this._recomputeChatGroupsUnreadCount()
            } else {
                this.chatGroupsUnreadCount = {}
            }
        })
        this.lifecycleScope.onIpc('openGroupMemberPanel', (_, p) => {
            this.groupmemberShown = p.shown
            this.groupmemberPanelGin = p.gin
        })
        this.lifecycleScope.onIpc('closeLoading', () => {
            this.loading = false
            this.uploadProgress = '0'
        })
        this.lifecycleScope.onIpc('notify', (_, p) => this.$notify(p))
        this.lifecycleScope.onIpc('addHistoryCount', (_, p) => {
            this.historyCount += p.count
            this.historyFetchingName = (p.roomId < 0 ? '群聊' : '私聊') + Math.abs(p.roomId)
        })
        this.lifecycleScope.onIpc('clearHistoryCount', () => (this.historyCount = 0))
        this.lifecycleScope.onIpc('notifyError', (_, p) => this.$notify.error(p))
        this.lifecycleScope.onIpc('notifySuccess', (_, p) => this.$notify.success(p))
        this.lifecycleScope.onIpc('notifyProgress', (_, { id, string }) => {
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
        this.lifecycleScope.onIpc('notifyProgressValue', (_, { id, value }) => {
            const instance = this.notifyProgresses.get(id)
            if (instance) {
                instance.progressBar.componentInstance.setValue(value)
            }
        })
        this.lifecycleScope.onIpc('notifyProgressClose', (_, id) => {
            const instance = this.notifyProgresses.get(id)
            if (instance) {
                instance.notification.close()
            }
        })
        this.lifecycleScope.onIpc('notifyDownloadComplete', (_, { fileName, filePath }) => {
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
        this.lifecycleScope.onIpc('message', (_, p) => this.$message(p))
        this.lifecycleScope.onIpc('messageError', (_, p) => this.$message.error(p))
        this.lifecycleScope.onIpc('messageSuccess', (_, p) => this.$message.success(p))
        this.lifecycleScope.onIpc('setShutUp', (_, p) => (this.isShutUp = p))
        this.lifecycleScope.onIpc('chroom', (_, p) => this.chroom(p))
        this.lifecycleScope.onIpc('confirmIgnoreChat', (_, data) => {
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
        this.lifecycleScope.onIpc('confirmDeleteMessage', (_, { roomId, messageId }) => {
            this.$confirm('确定撤回群成员消息?', '提示', {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning',
            }).then(() => {
                ipc.deleteMessage(roomId, messageId)
            })
        })
        this.lifecycleScope.onIpc('confirmDeleteSticker', (_, filename) => {
            this.$confirm('确定删除本 Sticker?', '提示', {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning',
            }).then(() => {
                fs.unlink(path.join(filename), () => this.$message('删除成功'))
            })
        })
        this.lifecycleScope.onIpc('confirmDeleteStickerDir', (_, dirname) => {
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
        this.lifecycleScope.onIpc('moveSticker', async (_, filename) => {
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
        this.lifecycleScope.onIpc('sendDice', (_) => {
            this.sendDiceShown = true
        })
        this.lifecycleScope.onIpc('sendRps', (_) => {
            this.sendRpsShown = true
        })
        this.lifecycleScope.onIpc('updateRoom', (_, room) => {
            roomUpdateBatch.queue(room)
        })
        this.lifecycleScope.onIpc('addMessage', (_, { roomId, message }) => {
            if (roomId !== this.selectedRoomId) return
            this.queueIncomingMessage(roomId, message)
        })
        this.lifecycleScope.onIpc('deleteMessage', (_, messageId) => {
            const index = this.getMessageIndex(messageId)
            if (index !== -1) {
                this.$set(this.messages, index, {
                    ...this.messages[index],
                    deleted: Date.now(),
                    reveal: false,
                })
            } else
                this.updateQueuedIncomingMessage(messageId, (message) => ({
                    ...message,
                    deleted: Date.now(),
                    reveal: false,
                }))
        })
        this.lifecycleScope.onIpc('hideMessage', (_, messageId) => {
            const index = this.getMessageIndex(messageId)
            if (index !== -1) {
                this.$set(this.messages, index, {
                    ...this.messages[index],
                    hide: true,
                    reveal: false,
                })
            } else
                this.updateQueuedIncomingMessage(messageId, (message) => ({
                    ...message,
                    hide: true,
                    reveal: false,
                }))
        })
        this.lifecycleScope.onIpc('revealMessage', (_, messageId) => {
            const index = this.getMessageIndex(messageId)
            if (index !== -1) {
                this.$set(this.messages, index, {
                    ...this.messages[index],
                    hide: false,
                    reveal: true,
                })
            } else
                this.updateQueuedIncomingMessage(messageId, (message) => ({
                    ...message,
                    hide: false,
                    reveal: true,
                }))
        })
        this.lifecycleScope.onIpc('renewMessage', (_, { messageId, message }) => {
            const index = this.getMessageIndex(messageId)
            if (index !== -1 && message) {
                this.$set(this.messages, index, {
                    ...this.messages[index],
                    ...message,
                })
            } else if (message) this.updateQueuedIncomingMessage(messageId, (current) => ({ ...current, ...message }))
        })
        this.lifecycleScope.onIpc('renewMessageURL', (_, { messageId, URL }) => {
            const index = this.getMessageIndex(messageId)
            const message = index === -1 ? null : this.messages[index]
            if (message && message.file && URL !== 'error') {
                this.$set(this.messages, index, {
                    ...message,
                    file: {
                        ...message.file,
                        url: URL,
                    },
                })
            } else if (URL !== 'error') {
                this.updateQueuedIncomingMessage(messageId, (current) => ({
                    ...current,
                    file: current.file ? { ...current.file, url: URL } : current.file,
                }))
            }
        })
        this.lifecycleScope.onIpc('setOnline', () => (this.reconnecting = this.offline = false))
        this.lifecycleScope.onIpc('setOffline', (_, msg) => {
            this.offlineReason = msg
            this.offline = true
        })
        this.lifecycleScope.onIpc('clearCurrentRoomUnread', () => {
            this.selectedRoom.unreadCount = 0
            this._recomputeChatGroupsUnreadCount()
        })
        this.lifecycleScope.onIpc('clearRoomUnread', (_, roomId) => {
            const room = this.rooms.find((e) => e.roomId === roomId)
            if (room) {
                room.unreadCount = 0
                room.at = false
                room.atMessageId = null
                this._recomputeChatGroupsUnreadCount()
            }
        })
        this.lifecycleScope.onIpc('updatePriority', (_, p) => (this.priority = p))
        this.lifecycleScope.onIpc('setAllRooms', (_, p) => {
            roomUpdateBatch.clear()
            this.rooms = p
        })
        this.lifecycleScope.onIpc('setAllChatGroups', (_, p) => (this.chatGroups = p || []))
        this.lifecycleScope.onIpc('setMessages', (_, p) => {
            this.messageLoadGeneration++
            this.cancelPendingIncomingMessages()
            this.clearDeferredIncomingMessages()
            this.isInMiddle = false
            const messages = p || []
            this.setMessageList(messages)
            this.messagesLoaded = false
        })
        this.lifecycleScope.onIpc('startChat', (_, { id, name }) => this.startChat(id, name))
        this.lifecycleScope.onIpc('closePanel', () => (this.panel = ''))
        this.lifecycleScope.onIpc(
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
                this.lifecycleScope.timeout(() => {
                    groupMemberCache.preloadAllGroups().catch((err) => {
                        console.error('Failed to preload group members:', err)
                    })
                }, 3000) // 延迟3秒后开始预加载，避免影响启动速度
            },
        )
        this.lifecycleScope.onIpc('uploadProgress', (_, p) => {
            if (p > this.uploadProgress) {
                this.uploadProgress = p
            }
        })
        this.lifecycleScope.onIpc('useSinglePanel', (_, b) => {
            if (this.useSinglePanel && window.innerWidth > 720) {
                this.$refs.roomPanel.style.width = '360px'
            }
            this.useSinglePanel = b
            this.handleResize({ target: { innerWidth: window.innerWidth } })
        })
        this.lifecycleScope.onIpc('setRemoveGroupNameEmotes', (_, b) => {
            this.removeGroupNameEmotes = b
        })
        this.lifecycleScope.onIpc('setUsePanguJsRecv', (_, b) => {
            this.usePanguJsRecv = b
        })
        this.lifecycleScope.onIpc('setStickerPanelBottom', (_, b) => {
            this.stickerPanelBottom = b
        })
        this.lifecycleScope.onIpc('forwardSingleMessage', (_, message_id) => {
            this.chooseForwardTarget(false, false)
        })
        this.lifecycleScope.onIpc('gotoMessage', async (_, { roomId, messageId }) => {
            await this.gotoMessage(roomId, messageId)
        })
        ipc.setSelectedRoom(0, '')
        ipc.requestOnlineData()

        this.lifecycleScope.onEvent(window, 'resize', this.handleResize)
        this.handleResize({ target: { innerWidth: window.innerWidth } })
        console.log('加载完成')
    },
    methods: {
        rebuildMessageIndex(messages = this.messages) {
            const index = new Map()
            for (let i = 0; i < messages.length; i++) {
                const message = messages[i]
                if (message && message._id !== undefined && message._id !== null) {
                    index.set(messageIdKey(message._id), i)
                }
            }
            this.messageIndex = index
        },
        getMessageIndex(messageId) {
            const index = this.messageIndex.get(messageIdKey(messageId))
            return index === undefined ? -1 : index
        },
        setMessageList(messages) {
            const normalized = normalizeMessageList(messages || [])
            for (const message of normalized) message.__v_skip = true
            this.messages = normalized
            this.rebuildMessageIndex(normalized)
        },
        appendMessages(messages) {
            if (!messages.length) return
            const newMessages = normalizeMessageList(messages).filter(
                (message) => this.getMessageIndex(message._id) === -1,
            )
            if (!newMessages.length) return
            const lastMessage = this.messages[this.messages.length - 1]
            if (!lastMessage || compareMessageOrder(lastMessage, newMessages[0]) <= 0) {
                const start = this.messages.length
                for (const message of newMessages) message.__v_skip = true
                this.messages.push(...newMessages)
                for (let i = 0; i < newMessages.length; i++) {
                    this.messageIndex.set(messageIdKey(newMessages[i]._id), start + i)
                }
                return
            }
            this.setMessageList(mergeMessageLists(this.messages, messages))
        },
        prependMessages(messages) {
            if (!messages.length) return
            const newMessages = normalizeMessageList(messages).filter(
                (message) => this.getMessageIndex(message._id) === -1,
            )
            if (!newMessages.length) return
            const firstMessage = this.messages[0]
            if (!firstMessage || compareMessageOrder(newMessages[newMessages.length - 1], firstMessage) < 0) {
                for (const message of newMessages) message.__v_skip = true
                this.messages.unshift(...newMessages)
                this.rebuildMessageIndex()
                return
            }
            this.setMessageList(mergeMessageLists(this.messages, messages))
        },
        clearDeferredIncomingMessages() {
            this.deferredIncomingMessages = []
            this.deferredIncomingIds.clear()
        },
        deferIncomingMessages(messages) {
            for (const message of messages) {
                const key = messageIdKey(message._id)
                if (this.getMessageIndex(message._id) !== -1 || this.deferredIncomingIds.has(key)) continue
                this.deferredIncomingMessages.push(message)
                this.deferredIncomingIds.add(key)
            }
        },
        flushDeferredIncomingMessages() {
            if (!this.deferredIncomingMessages.length) return
            const messages = this.deferredIncomingMessages
            this.clearDeferredIncomingMessages()
            this.appendMessages(messages)
        },
        consumeDeferredIncomingMessages(messages) {
            if (!this.deferredIncomingMessages.length || !messages.length) return
            const consumedIds = new Set(messages.map((message) => messageIdKey(message._id)))
            this.deferredIncomingMessages = this.deferredIncomingMessages.filter(
                (message) => !consumedIds.has(messageIdKey(message._id)),
            )
            for (const id of consumedIds) this.deferredIncomingIds.delete(id)
        },
        updateQueuedIncomingMessage(messageId, update) {
            const key = messageIdKey(messageId)
            for (const messages of [this.pendingIncomingMessages, this.deferredIncomingMessages]) {
                const index = messages.findIndex((message) => messageIdKey(message._id) === key)
                if (index !== -1) this.$set(messages, index, update(messages[index]))
            }
        },
        cancelPendingIncomingMessages() {
            if (this.pendingIncomingFrame !== null) {
                this.lifecycleScope.cancelAnimationFrame(this.pendingIncomingFrame)
                this.pendingIncomingFrame = null
            }
            this.pendingIncomingMessages = []
            this.pendingIncomingIds.clear()
            this.pendingIncomingRoomId = null
        },
        queueIncomingMessage(roomId, message) {
            if (this.pendingIncomingRoomId !== null && this.pendingIncomingRoomId !== roomId) {
                this.cancelPendingIncomingMessages()
            }
            this.pendingIncomingRoomId = roomId

            const existingIndex = this.getMessageIndex(message._id)
            const key = messageIdKey(message._id)
            if (existingIndex !== -1 || this.pendingIncomingIds.has(key) || this.deferredIncomingIds.has(key)) {
                if (existingIndex !== -1) {
                    console.warn(`[WARN] Duplicated message ID ${message._id}`, message, this.messages[existingIndex])
                }
                return
            }

            message.__v_skip = true
            this.pendingIncomingMessages.push(message)
            this.pendingIncomingIds.add(key)
            if (this.pendingIncomingFrame !== null) return

            this.pendingIncomingFrame = this.lifecycleScope.animationFrame(() => {
                this.pendingIncomingFrame = null
                this.flushIncomingMessages(roomId)
            })
        },
        flushIncomingMessages(roomId = this.pendingIncomingRoomId) {
            if (roomId === null || roomId !== this.pendingIncomingRoomId) return

            const pendingMessages = this.pendingIncomingMessages
            this.pendingIncomingMessages = []
            this.pendingIncomingIds.clear()
            this.pendingIncomingRoomId = null

            if (roomId !== this.selectedRoomId) return
            const newMessages = pendingMessages.filter((message) => this.getMessageIndex(message._id) === -1)
            if (!newMessages.length) return

            if (this.isInMiddle) this.deferIncomingMessages(newMessages)
            else this.appendMessages(newMessages)
            let groupMembersChanged = false
            const memberChangeText = ['加入了本群', '离开了本群', '踢了']
            for (const message of newMessages) {
                if (this.lastUnreadCount >= 10 && !message.system) this.lastUnreadCount++
                if (message.at && message.senderId != this.account) {
                    this.lastUnreadAt = true
                    this.lastUnreadAtMessageId = String(message._id)
                }
                if (
                    message.system &&
                    memberChangeText.some(
                        (text) => typeof message.content === 'string' && message.content.includes(text),
                    )
                ) {
                    groupMembersChanged = true
                }
            }
            if (groupMembersChanged && this.$refs.room) this.$refs.room.updateGroupMembers()
        },
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
            if (!room && !roomId) {
                room = this.selectedRoom
                roomId = room.roomId
            }
            if (!room) room = this.rooms.find((e) => e.roomId === roomId)
            if (!roomId) roomId = room.roomId

            if (this.isInMiddle && roomId === this.selectedRoomId) await this.returnToLatest()
            this.loading = true

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
            const atMessageId = this.lastUnreadAtMessageId
            this.lastUnreadAt = false
            this.lastUnreadAtMessageId = null
            if (!atMessageId) {
                this.$message.error('找不到未读的 @ 消息')
                return
            }
            await this.$nextTick()
            if (this.$refs.room?.scrollToMessage(atMessageId, false, true)) return
            await this.locateMessage(atMessageId)
        },
        async locateMessage(messageId) {
            const roomId = this.selectedRoom.roomId
            const generation = ++this.messageLoadGeneration
            this.loading = true
            try {
                await this.fetchMessage(false, NEARBY_MESSAGE_LOAD_LIMIT)
                if (generation !== this.messageLoadGeneration || roomId !== this.selectedRoom.roomId) return
                await this.$nextTick()
                if (this.$refs.room?.scrollToMessage(messageId, false, true)) return
            } finally {
                if (generation === this.messageLoadGeneration) this.loading = false
            }

            if (generation === this.messageLoadGeneration && roomId === this.selectedRoom.roomId) {
                await this.gotoMessage(roomId, messageId)
            }
        },
        async locateUnreadMessage(unreadCount, notFoundMessage = '找不到未读消息') {
            const count = Math.max(0, Math.trunc(Number(unreadCount) || 0))
            if (!count) return
            const roomId = this.selectedRoom.roomId
            const generation = ++this.messageLoadGeneration

            if (count <= NEARBY_MESSAGE_LOAD_LIMIT && !this.isInMiddle) {
                const currentMessages = this.messages.filter((message) => !message.system)
                const fetchNumber = Math.max(count - currentMessages.length, 0)
                if (fetchNumber) await this.fetchMessage(false, fetchNumber)
                if (generation !== this.messageLoadGeneration || roomId !== this.selectedRoom.roomId) return

                const nonSystemMessages = this.messages.filter((message) => !message.system)
                const target = nonSystemMessages[nonSystemMessages.length - count]
                await this.$nextTick()
                if (target && this.$refs.room?.scrollToMessage(target._id, false, true)) return
                this.$message.error(notFoundMessage)
                return
            }

            this.loading = true
            try {
                const targetMessageId = await ipc.resolveUnreadTargetMessageId(roomId, count)
                if (generation !== this.messageLoadGeneration || roomId !== this.selectedRoom.roomId) return
                if (!targetMessageId) {
                    this.$message.error(notFoundMessage)
                    return
                }
                await this.gotoMessage(roomId, targetMessageId)
            } finally {
                if (generation === this.messageLoadGeneration) this.loading = false
            }
        },
        async fetchMessage(reset, number) {
            let generation = this.messageLoadGeneration
            if (reset) {
                generation = ++this.messageLoadGeneration
                this.loading = false
                this.cancelPendingIncomingMessages()
                this.clearDeferredIncomingMessages()
                this.isInMiddle = false
                this.messagesLoaded = false
                this.setMessageList([])
            }
            const _roomId = this.selectedRoom.roomId
            let cursor = !reset && this.messages.length ? getMessageCursor(this.messages[0]) : null
            const messagePages = []
            let lastPage = []
            let nonSystemMessageCount = 0
            try {
                do {
                    const page = await ipc.fetchMessage(_roomId, cursor ? { before: cursor } : {})
                    lastPage = page || []
                    if (lastPage.length) cursor = getMessageCursor(lastPage[0])
                    messagePages.unshift(lastPage)
                    nonSystemMessageCount += lastPage.filter((message) => !message.system).length
                    if (!number || nonSystemMessageCount >= number || !lastPage.length) break
                    if (_roomId !== this.selectedRoom.roomId || generation !== this.messageLoadGeneration) return
                } while (true)
            } catch (e) {
                console.error('fetchMessage failed:', e)
                return
            }
            if (_roomId !== this.selectedRoom.roomId || generation !== this.messageLoadGeneration) return

            const msgs2add = messagePages.flat()
            const newIds = new Set()
            const newMsgs = msgs2add.filter((message) => {
                const key = messageIdKey(message._id)
                if (this.getMessageIndex(message._id) !== -1 || newIds.has(key)) return false
                newIds.add(key)
                return true
            })
            if (newMsgs.length) this.prependMessages(newMsgs)
            if (!lastPage.length || lastPage.length < 20) this.messagesLoaded = true

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
            this.lastUnreadAtMessageId = room.atMessageId || null
            if (this.selectedRoom.roomId != 0) {
                this.selectedRoom.at = false
                this.selectedRoom.atMessageId = null
                ipc.updateRoom(this.selectedRoom.roomId, { at: false, atMessageId: null })
            }
            if (this.selectedRoom.roomId === room.roomId) return
            this.unreadDividerCount = Math.max(Number(room.unreadCount) || 0, 0)
            // 记录导航历史
            if (!this.isNavigating) {
                this.navBackStack.push(this.selectedRoom.roomId)
                this.navForwardStack = []
            }
            this.cancelPendingIncomingMessages()
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

            // 先尝试在当前消息列表中查找，Room 内部会兼容 random 等可变字段。
            if (this.$refs.room?.scrollToMessage(messageId, false, true)) return

            // 消息不在当前列表中，需要加载指定消息前后的消息
            const generation = ++this.messageLoadGeneration
            const previousMiddleState = this.isInMiddle
            this.isInMiddle = true
            this.loading = true
            try {
                const msgs = await ipc.fetchMessagesAround(roomId, messageId, 20, 20)
                if (generation !== this.messageLoadGeneration || roomId !== this.selectedRoom.roomId) return
                if (msgs && msgs.length > 0) {
                    this.setMessageList(msgs)
                    this.consumeDeferredIncomingMessages(msgs)
                    await this.$nextTick()
                    const targetIndex = this.getMessageIndex(messageId)
                    const targetFound = this.$refs.room?.scrollToMessage(messageId, false, true)
                    if (targetIndex === -1 && !targetFound) {
                        this.$message.error('找不到该消息')
                        this.isInMiddle = previousMiddleState
                        if (!this.isInMiddle) this.flushDeferredIncomingMessages()
                        return
                    }
                    this.messagesLoaded = targetIndex !== -1 && targetIndex < 20
                    // Keep the window detached from the live tail until an explicit
                    // after-cursor request proves that no gap remains.
                    this.isInMiddle = true
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
            const roomId = this.selectedRoom.roomId
            this.loading = true
            try {
                const msgs = await ipc.fetchMessage(roomId, { after: getMessageCursor(lastMessage) })
                if (generation !== this.messageLoadGeneration || roomId !== this.selectedRoom.roomId) return
                if (msgs?.length) {
                    this.consumeDeferredIncomingMessages(msgs)
                    this.appendMessages(msgs)
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
            const roomId = this.selectedRoom.roomId
            if (!roomId) return false

            const generation = ++this.messageLoadGeneration
            this.loading = true
            try {
                const messages = (await ipc.fetchMessage(roomId, {})) || []
                if (generation !== this.messageLoadGeneration || roomId !== this.selectedRoom.roomId) return false

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
            this.messageLoadGeneration++
            this.selectedRoomId = 0
            this.cancelPendingIncomingMessages()
            this.clearDeferredIncomingMessages()
            this.setMessageList([])
            this.lastUnreadCount = 0
            this.unreadDividerCount = 0
            this.lastUnreadAt = false
            this.lastUnreadAtMessageId = null
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
            this._chatGroupScrollFrame = this.lifecycleScope.animationFrame(() => {
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
        this.cancelPendingIncomingMessages()
        if (this._chatGroupResizeObserver) {
            this._chatGroupResizeObserver.disconnect()
            this._chatGroupResizeObserver = null
        }
        if (this._chatGroupScrollFrame) {
            this.lifecycleScope.cancelAnimationFrame(this._chatGroupScrollFrame)
            this._chatGroupScrollFrame = null
        }
        if (this._onGroupMouseUp) this.onGroupThumbMouseUp()
        this.lifecycleScope?.dispose()
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
                    this.lifecycleScope.cancelTimeout(this.lastUnreadCheck)
                }
                this.lastUnreadCheck = this.lifecycleScope.timeout(() => {
                    console.log('Timeout')
                    this.lastUnreadCount = 0
                }, 30000)
            }
        },
        lastUnreadAt(n, o) {
            console.log('lastUnreadAt', n)
            if (n) {
                if (this.lastUnreadCheck2) {
                    this.lifecycleScope.cancelTimeout(this.lastUnreadCheck2)
                }
                this.lastUnreadCheck2 = this.lifecycleScope.timeout(() => {
                    console.log('Timeout')
                    this.lastUnreadAt = false
                    this.lastUnreadAtMessageId = null
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
