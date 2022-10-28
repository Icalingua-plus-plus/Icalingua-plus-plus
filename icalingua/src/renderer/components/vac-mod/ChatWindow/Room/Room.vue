<template>
    <div v-show="(isMobile && !showRoomsList) || !isMobile || singleRoom" class="vac-col-messages">
        <slot v-if="(!rooms.length && !loadingRooms) || (!room.roomId && !loadFirstRoom)" name="no-room-selected">
            <div class="vac-container-center vac-room-empty">
                <div>{{ textMessages.ROOM_EMPTY }}</div>
            </div>
        </slot>

        <room-header
            v-else
            :current-user-id="currentUserId"
            :text-messages="textMessages"
            :single-room="singleRoom"
            :show-rooms-list="showRoomsList"
            :is-mobile="isMobile"
            :room-info="roomInfo"
            :menu-actions="menuActions"
            :room="room"
            :members-count="membersCount"
            @toggle-rooms-list="$emit('toggle-rooms-list')"
            @menu-action-handler="$emit('menu-action-handler', $event)"
            @pokefriend="$emit('pokefriend')"
            @room-menu="roomMenu"
            @open-group-member-panel="$emit('open-group-member-panel')"
        >
            <template v-for="(index, name) in $scopedSlots" #[name]="data">
                <slot :name="name" v-bind="data" />
            </template>
        </room-header>

        <div ref="scrollContainer" class="vac-container-scroll" @scroll="containerScroll">
            <loader :show="loadingMessages" />
            <div class="vac-messages-container">
                <div :class="{ 'vac-messages-hidden': loadingMessages }">
                    <transition name="vac-fade-message">
                        <div v-if="showNoMessages" class="vac-text-started">
                            <slot name="messages-empty">
                                {{ textMessages.MESSAGES_EMPTY }}
                            </slot>
                        </div>
                        <div v-if="showMessagesStarted" class="vac-text-started">
                            {{ textMessages.CONVERSATION_STARTED }}
                            {{ messages[0].date }}
                        </div>
                    </transition>
                    <transition name="vac-fade-message">
                        <infinite-loading
                            v-if="messages.length && optimizeMethod === 'none'"
                            :class="{ 'vac-infinite-loading': !messagesLoaded }"
                            spinner="spiral"
                            direction="top"
                            :distance="40"
                            @infinite="_loadMoreMessages"
                        >
                            <div slot="spinner">
                                <loader :show="true" :infinite="true" />
                            </div>
                            <div slot="no-results" />
                            <div slot="no-more" />
                        </infinite-loading>
                    </transition>
                    <transition name="vac-fade-message">
                        <infinite-loading
                            v-if="
                                messages.length &&
                                optimizeMethod === 'infinite-loading' &&
                                !(messagesLoaded && visibleViewport.head === 0)
                            "
                            :class="{ 'vac-infinite-loading': !(messagesLoaded && visibleViewport.head === 0) }"
                            spinner="spiral"
                            direction="top"
                            :distance="40"
                            @infinite="loadHeadMessages"
                        >
                            <div slot="spinner">
                                <loader :show="true" :infinite="true" />
                            </div>
                            <div slot="no-results" />
                            <div slot="no-more" />
                        </infinite-loading>
                    </transition>
                    <transition-group :key="roomId" name="vac-fade-message">
                        <div
                            v-for="(m, i) in messages.slice(visibleViewport.head, visibleViewport.tail)"
                            :key="m._id"
                            @dblclick="replyMessage(m, $event)"
                        >
                            <message
                                :current-user-id="currentUserId"
                                :message="m"
                                :index="i + visibleViewport.head"
                                :messages="messages"
                                :edited-message="editedMessage"
                                :message-actions="messageActions"
                                :room-users="room.users"
                                :text-messages="textMessages"
                                :room-footer-ref="$refs.roomFooter"
                                :new-messages="newMessages"
                                :show-reaction-emojis="showReactionEmojis"
                                :show-new-messages-divider="showNewMessagesDivider"
                                :text-formatting="textFormatting"
                                :emojis-list="emojisList"
                                :showForwardPanel="showForwardPanel"
                                :selectedMessage="selectedMessage"
                                :linkify="linkify"
                                :forward-res-id="forwardResId"
                                :msgstoForward="msgstoForward"
                                @open-file="openFile"
                                @add-new-message="addNewMessage"
                                @ctx="msgctx(m)"
                                @avatar-ctx="avatarCtx(m)"
                                @download-image="$emit('download-image', $event)"
                                @poke="$emit('pokegroup', m.senderId)"
                                @open-forward="$emit('open-forward', $event)"
                                @start-chat="(e, f) => $emit('start-chat', e, f)"
                                @add-msg-to-forward="addMsgtoForward"
                                @del-msg-to-forward="delMsgtoForward"
                                @scroll-to-message="scrollToMessage"
                                :hide-chat-image-by-default="hideChatImageByDefault"
                            >
                                <template v-for="(index, name) in $scopedSlots" #[name]="data">
                                    <slot :name="name" v-bind="data" />
                                </template>
                            </message>
                        </div>
                    </transition-group>
                    <transition name="vac-fade-message">
                        <infinite-loading
                            v-if="visibleViewport.tail !== messages.length && optimizeMethod === 'infinite-loading'"
                            :class="{ 'vac-infinite-loading-bottom': visibleViewport.tail !== messages.length }"
                            spinner="spiral"
                            direction="bottom"
                            :distance="100"
                            @infinite="loadTailMessages"
                        >
                            <div slot="spinner">
                                <loader :show="true" :infinite="true" />
                            </div>
                            <div slot="no-results" />
                            <div slot="no-more" />
                        </infinite-loading>
                    </transition>
                </div>
            </div>
        </div>
        <div v-if="!loadingMessages">
            <transition name="vac-bounce">
                <div v-if="lastUnreadCount >= 10" class="vac-icon-last-message" @click="scrollToLastMessage">
                    <transition name="vac-bounce">
                        <div v-if="lastUnreadCount" class="vac-badge-counter vac-messages-count">
                            {{ lastUnreadCount }}
                        </div>
                    </transition>
                    <slot name="scroll-icon">
                        <svg-icon name="dropdown" style="transform: rotate(180deg)" />
                    </slot>
                </div>
            </transition>
            <transition name="vac-bounce">
                <div
                    v-if="scrollIcon || (visibleViewport.tail !== messages.length && messages.length !== 0)"
                    class="vac-icon-scroll"
                    @click="scrollToBottom"
                >
                    <transition name="vac-bounce">
                        <div v-if="scrollMessagesCount" class="vac-badge-counter vac-messages-count">
                            {{ scrollMessagesCount }}
                        </div>
                    </transition>
                    <slot name="scroll-icon">
                        <svg-icon name="dropdown" param="scroll" />
                    </slot>
                </div>
            </transition>
        </div>
        <div
            v-show="Object.keys(room).length && showFooter"
            ref="roomFooter"
            class="vac-room-footer"
            :class="{ 'vac-app-box-shadow': messageReply || showForwardPanel || editAndResend }"
        >
            <room-message-reply
                :room="room"
                :message-reply="messageReply"
                :linkify="linkify"
                @reset-message="resetMessage"
            >
                <template v-for="(index, name) in $scopedSlots" #[name]="data">
                    <slot :name="name" v-bind="data" />
                </template>
            </room-message-reply>
            <RoomForwardMessage
                :messages="messages"
                :showForwardPanel="showForwardPanel"
                :msgstoForward="msgstoForward"
                @choose-forward-target="$emit('choose-forward-target')"
                @close-forward-panel="closeForwardPanel"
                :account="account"
                :username="username"
                :roomId="roomId"
            />
            <div style="padding-top: 10px; padding-left: 10px; color: var(--panel-color-desc)" v-if="editAndResend">
                编辑重发
            </div>

            <div class="vac-box-footer">
                <div v-if="imageFile" class="vac-media-container">
                    <div class="vac-svg-button vac-icon-media" @click="resetMediaFile">
                        <slot name="image-close-icon">
                            <svg-icon name="close" param="image" />
                        </slot>
                    </div>
                    <div class="vac-media-file">
                        <img ref="mediaFile" :src="imageFile" @load="onMediaLoad" />
                    </div>
                </div>

                <div v-else-if="videoFile" class="vac-media-container">
                    <div class="vac-svg-button vac-icon-media" @click="resetMediaFile">
                        <slot name="image-close-icon">
                            <svg-icon name="close" param="image" />
                        </slot>
                    </div>
                    <div ref="mediaFile" class="vac-media-file">
                        <video width="100%" height="100%" controls>
                            <source :src="videoFile" type="video/mp4" />
                            <source :src="videoFile" type="video/ogg" />
                            <source :src="videoFile" type="video/webm" />
                        </video>
                    </div>
                </div>

                <div
                    v-else-if="file"
                    class="vac-file-container"
                    :class="{ 'vac-file-container-edit': editedMessage._id }"
                >
                    <div class="vac-icon-file-room">
                        <slot name="file-icon">
                            <svg-icon name="file" />
                        </slot>
                    </div>
                    <div v-if="file && file.audio" class="vac-file-message-room">
                        {{ file.name }}
                    </div>
                    <div v-else class="vac-file-message-room">
                        {{ message }}
                    </div>
                    <div class="vac-svg-button vac-icon-remove" @click="resetMessage(null, true)">
                        <slot name="file-close-icon">
                            <svg-icon name="close" />
                        </slot>
                    </div>
                </div>

                <transition name="vac-fade-search-input">
                    <SearchInput
                        ref="quickface"
                        v-show="isQuickFaceOn"
                        v-slot="{ id, name }"
                        :list="faceNames"
                        description="face(s)"
                        searchMethod="startsWith"
                        inputSize="80"
                        @cancel="closeQuickFace"
                        @confirm="useQuickFace"
                    >
                        <p>{{ name }}</p>
                        <img :src="`file://${faceDir}/${id}`" />
                    </SearchInput>
                </transition>

                <transition name="vac-fade-search-input">
                    <SearchInput
                        ref="quickat"
                        v-show="isQuickAtOn && room.roomId < 0"
                        v-slot="{ id, name }"
                        :list="
                            groupMembers
                                ? groupMembers.map(({ card, nickname, user_id }) => [card || nickname, user_id])
                                : []
                        "
                        description="member(s)"
                        searchMethod="includes"
                        inputSize="200"
                        @cancel="closeQuickAt"
                        @confirm="useQuickAt"
                        @nomatch="nomatchQuickAt"
                    >
                        <el-avatar size="small" v-if="id !== 0" :src="`https://q1.qlogo.cn/g?b=qq&nk=${id}&s=140`" />
                        <p style="wordwrap: 'break-word'; margin-right: auto; margin-left: 5px">{{ name }}</p>
                        <p v-if="id !== 0" style="fontfamily: 'monospace'">{{ id }}</p>
                    </SearchInput>
                </transition>

                <textarea
                    v-show="!file || imageFile || videoFile"
                    ref="roomTextarea"
                    v-model="message"
                    :placeholder="textMessages.TYPE_MESSAGE"
                    class="vac-textarea"
                    :class="{
                        'vac-textarea-outline': editAndResend,
                    }"
                    :style="{
                        'min-height': `${mediaDimensions ? mediaDimensions.height : 20}px`,
                        'padding-left': `${mediaDimensions ? mediaDimensions.width - 10 : 12}px`,
                    }"
                    @input="onChangeInput"
                    @click.right="textctx"
                    spellcheck="false"
                />

                <div class="vac-icon-textarea">
                    <div v-if="editAndResend" class="vac-svg-button" @click="resetMessage">
                        <slot name="edit-close-icon">
                            <svg-icon name="close-outline" />
                        </slot>
                    </div>

                    <div class="vac-svg-button" @click="$emit('stickers-panel')">
                        <svg-icon name="emoji" />
                    </div>

                    <div v-if="showFiles" class="vac-svg-button" @click="launchFilePicker">
                        <slot name="paperclip-icon">
                            <svg-icon name="paperclip" />
                        </slot>
                    </div>

                    <div v-if="textareaAction" class="vac-svg-button" @click="textareaActionHandler">
                        <slot name="custom-action-icon">
                            <svg-icon name="deleted" />
                        </slot>
                    </div>

                    <input
                        v-if="showFiles"
                        ref="file"
                        type="file"
                        :accept="acceptedFiles"
                        style="display: none"
                        @change="onFileChange($event.target.files)"
                    />

                    <div
                        v-if="showSendIcon"
                        class="vac-svg-button"
                        :class="{ 'vac-send-disabled': isMessageEmpty }"
                        @click.left="sendMessage"
                        @click.middle="sendStructMessage"
                        @click.right="sendStructMessage"
                    >
                        <slot name="send-icon">
                            <svg-icon name="send" :param="isMessageEmpty ? 'disabled' : ''" />
                        </slot>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import InfiniteLoading from 'vue-infinite-loading'
import vClickOutside from 'v-click-outside'
import emojis from 'vue-emoji-picker/src/emojis'

import Loader from '../../components/Loader'
import SvgIcon from '../../components/SvgIcon'

import RoomHeader from './RoomHeader'
import RoomMessageReply from './RoomMessageReply'
import RoomForwardMessage from './RoomForwardMessage'
import Message from '../Message/Message'
import SearchInput from '../../../SearchInput'

import faceNames from '../../../../../../static/faceNames'
import getStaticPath from '../../../../../utils/getStaticPath'
import path from 'path'
const faceDir = path.join(getStaticPath(), 'face')

import { ipcRenderer } from 'electron'

const { detectMobile, iOSDevice } = require('../../utils/mobileDetection')
const { isImageFile, isVideoFile } = require('../../utils/mediaFile')

import ipc from '../../../../utils/ipc'

/** @type 'Enter'|'CtrlEnter'|'ShiftEnter' */
let keyToSendMessage

// scroll
const scrollOffset = 300

export default {
    name: 'Room',
    components: {
        InfiniteLoading,
        Loader,
        SvgIcon,
        RoomHeader,
        RoomMessageReply,
        RoomForwardMessage,
        Message,
        SearchInput,
    },
    directives: {
        clickOutside: vClickOutside.directive,
    },
    props: {
        currentUserId: { type: [String, Number], required: true },
        singleRoom: { type: Boolean, required: true },
        showRoomsList: { type: Boolean, required: true },
        isMobile: { type: Boolean, required: true },
        rooms: { type: Array, required: true },
        roomId: { type: [String, Number], required: true },
        loadFirstRoom: { type: Boolean, required: true },
        messages: { type: Array, required: true },
        messagesLoaded: { type: Boolean, required: true },
        menuActions: { type: Array, required: true },
        messageActions: { type: Array, required: true },
        showSendIcon: { type: Boolean, required: true },
        showFiles: { type: Boolean, required: true },
        showAudio: { type: Boolean, required: true },
        showEmojis: { type: Boolean, required: true },
        showReactionEmojis: { type: Boolean, required: true },
        showNewMessagesDivider: { type: Boolean, required: true },
        showFooter: { type: Boolean, required: true },
        showHeader: { type: Boolean, default: true },
        acceptedFiles: { type: String, required: true },
        textFormatting: { type: Boolean, required: true },
        loadingRooms: { type: Boolean, required: true },
        roomInfo: { type: Function, default: null },
        textareaAction: { type: Function, default: null },
        membersCount: { type: Number, default: 0 },
        linkify: { type: Boolean, default: true },
        account: { type: Number, required: true },
        username: { type: String, required: true },
        forwardResId: { type: String, required: false },
        hideChatImageByDefault: { type: Boolean, required: false, default: false },
        lastUnreadCount: { type: Number, required: false, default: 0 },
    },
    data() {
        return {
            message: '',
            editedMessage: {},
            messageReply: null,
            loadingMessages: false,
            loadingHeadMessages: false,
            file: null,
            imageFile: null,
            videoFile: null,
            mediaDimensions: null,
            fileDialog: false,
            emojiOpened: false,
            scrollIcon: false,
            scrollMessagesCount: 0,
            newMessages: [],
            keepKeyboardOpen: false,
            textareaCursorPosition: null,
            textMessages: require('../../locales').default,
            editAndResend: false,
            msgstoForward: [],
            showForwardPanel: false,
            isQuickFaceOn: false,
            isQuickAtOn: false,
            faceNames,
            faceDir,
            groupMembers: null,
            useAtKey: false,
            selectedMessage: '',
            visibleViewport: {
                head: 0,
                tail: 0,
            },
            onScrolling: null,
            lastScrollPosition: {
                top: 0,
                bottom: 0,
            },
            infiniteState: {
                head: null,
                tail: null,
            },
            optimizeMethod: 'infinite-loading',
            scrollingTolastMessage: 0,
        }
    },
    computed: {
        emojisList() {
            const emojisTable = Object.keys(emojis).map((key) => emojis[key])
            return Object.assign({}, ...emojisTable)
        },
        room() {
            return this.rooms.find((room) => room.roomId === this.roomId) || {}
        },
        showNoMessages() {
            return this.room.roomId && !this.messages.length && !this.loadingMessages && !this.loadingRooms
        },
        showMessagesStarted() {
            return this.messages.length && this.messagesLoaded && this.visibleViewport.head === 0
        },
        isMessageEmpty() {
            return !this.file && !this.message.trim()
        },
        maxViewportLength() {
            const w = window.visualViewport ? window.visualViewport : window
            const height = w.height || w.innerHeight
            return Math.ceil(height / 60) * 5
        },
    },
    watch: {
        loadingMessages(val) {
            if (val) this.infiniteState.head = null
            else if (!val) this.focusTextarea(true)
        },
        async room(newVal, oldVal) {
            if (newVal.roomId && newVal.roomId !== oldVal.roomId) {
                this.loadingMessages = true
                this.scrollIcon = false
                this.scrollMessagesCount = 0
                this.scrollingTolastMessage = 0
                //this.resetMessage(true)

                this.editAndResend = false
                this.closeForwardPanel()
                await this.updateGroupMembers()
            } else if (newVal.roomId === 0) {
                this.scrollIcon = false
                this.scrollMessagesCount = 0
                this.scrollingTolastMessage = 0
            }
        },
        messages(newVal, oldVal) {
            const element = this.$refs.scrollContainer
            if (!element) return

            const offset = (newVal ? newVal.length : 0) - (oldVal ? oldVal.length : 0)
            if (
                oldVal &&
                oldVal.length &&
                newVal &&
                newVal.length &&
                oldVal[oldVal.length - 1]._id === newVal[newVal.length - 1]._id
            ) {
                const scrollTop = this.getTopScroll(element)
                const scrollBottom = this.getBottomScroll(element)
                if (scrollTop < scrollBottom) {
                    this.visibleViewport.tail = Math.min(
                        newVal.length,
                        this.visibleViewport.head + this.maxViewportLength,
                    )
                }
                if (scrollTop > scrollBottom) {
                    this.visibleViewport.tail = Math.min(newVal.length, this.visibleViewport.tail + offset)
                    this.visibleViewport.head = Math.max(0, this.visibleViewport.tail - this.maxViewportLength)
                }
            }
            if (!oldVal || !oldVal.length || this.optimizeMethod === 'none') {
                this.visibleViewport.head = 0
                this.visibleViewport.tail = newVal.length
            }

            if (oldVal && newVal && oldVal.length === newVal.length - 1) {
                this.loadingMessages = false

                if (
                    newVal[newVal.length - 1].senderId === this.currentUserId ||
                    (this.getBottomScroll(element) < 60 &&
                        (this.visibleViewport.tail === oldVal.length || this.optimizeMethod === 'none'))
                ) {
                    if (this.optimizeMethod !== 'none') {
                        this.visibleViewport.tail = newVal.length
                        this.visibleViewport.head = Math.max(0, this.visibleViewport.tail - this.maxViewportLength)
                    }
                    return setTimeout(() => {
                        const options = { top: element.scrollHeight, behavior: 'smooth' }
                        element.scrollTo(options)
                    }, 50)
                } else {
                    this.scrollIcon = true
                    return this.scrollMessagesCount++
                }
            }

            if (this.infiniteState.head) {
                this.infiniteState.head.loaded()
            } else if (newVal.length && !this.scrollIcon) {
                setTimeout(() => {
                    element.scrollTo({ top: element.scrollHeight })
                    this.loadingMessages = false
                }, 0)
            }
            if (this.scrollingTolastMessage && newVal.length >= this.scrollingTolastMessage) {
                const msgCount = this.scrollingTolastMessage
                this.scrollingTolastMessage = 0
                setTimeout(() => {
                    const nonSystemMessages = newVal.filter((msg) => !msg.system)
                    const _id = nonSystemMessages[nonSystemMessages.length - msgCount]._id
                    if (!_id) {
                        this.$message.error('Message not found')
                        return
                    }
                    console.log('last unread message ID', _id)
                    this.scrollToMessage(_id)
                }, 0)
            }
            setTimeout(() => (this.loadingHeadMessages = false), 0)
        },
        messagesLoaded(val) {
            if (val) this.loadingMessages = false
            if (this.infiniteState.head) {
                if (this.optimizeMethod !== 'none') this.infiniteState.head.loaded()
                else this.infiniteState.head.complete()
            }
        },
    },
    async mounted() {
        this.newMessages = []
        this.$refs.roomTextarea.addEventListener('keydown', (e) => {
            if (e.isComposing) return
            if (e.key === 'Enter') {
                switch (keyToSendMessage) {
                    case 'Enter':
                        if (e.ctrlKey) {
                            let selectionStart = this.$refs.roomTextarea.selectionStart
                            let selectionEnd = this.$refs.roomTextarea.selectionEnd
                            this.message =
                                this.message.substr(0, selectionStart) + '\n' + this.message.substr(selectionEnd)
                            setTimeout(() => this.onChangeInput(), 0)
                        } else if (e.shiftKey) {
                            setTimeout(() => this.onChangeInput(), 0)
                        } else {
                            this.sendMessage()
                            e.preventDefault()
                        }
                        break
                    case 'CtrlEnter':
                        if (!e.ctrlKey) {
                            setTimeout(() => this.onChangeInput(), 0)
                        } else {
                            this.sendMessage()
                            e.preventDefault()
                        }
                        break
                    case 'ShiftEnter':
                        if (e.ctrlKey) {
                            let selectionStart = this.$refs.roomTextarea.selectionStart
                            let selectionEnd = this.$refs.roomTextarea.selectionEnd
                            this.message =
                                this.message.substr(0, selectionStart) + '\n' + this.message.substr(selectionEnd)
                            setTimeout(() => this.onChangeInput(), 0)
                        } else if (!e.shiftKey) {
                            setTimeout(() => this.onChangeInput(), 0)
                        } else {
                            this.sendMessage()
                            e.preventDefault()
                        }
                        break
                    default:
                        console.log('qwq')
                }
            } else if (e.key === 'ArrowUp') {
                if (this.message) return
                //编辑重发上一条消息
                e.preventDefault()
                const ownMessages = this.messages.filter((e) => e.senderId === this.currentUserId)
                if (!ownMessages.length) return
                const lastMessage = ownMessages[ownMessages.length - 1]
                if (lastMessage.file && lastMessage.file.type.startsWith('image')) {
                    this.onPasteGif(lastMessage.file.url)
                } else {
                    this.file = lastMessage.file
                }
                this.messageReply = lastMessage.replyMessage
                this.message = lastMessage.content
                this.$nextTick(
                    () =>
                        (this.$refs.roomTextarea.selectionStart = this.$refs.roomTextarea.selectionEnd =
                            this.message.length),
                )
                this.editAndResend = lastMessage._id
            } else if (e.key === 'e' && e.ctrlKey) {
                // 快捷表情选择
                this.isQuickFaceOn = true
                this.$nextTick(() => this.$refs.quickface.focus())
            } else if (e.key === 'm' && e.ctrlKey && this.room.roomId < 0) {
                // 快捷 at 选择
                this.isQuickAtOn = true
                this.$nextTick(() => this.$refs.quickat.focus())
            }
        })

        window.addEventListener('paste', (event) => {
            console.log(event.clipboardData.files)
            const imageHTML = event.clipboardData.getData('text/html') || '.'
            console.log(imageHTML)
            if (event.clipboardData.files && event.clipboardData.files.length) {
                // Using the path attribute to get absolute file path
                const f = event.clipboardData.files[0]
                const index = f.name.lastIndexOf('.')
                const ext = f.name.substr(index + 1).toLowerCase()
                if (this.roomId < 0 || ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp', 'svg', 'tiff'].includes(ext)) {
                    this.onFileChange(event.clipboardData.files)
                }
            } else if (imageHTML.indexOf('<img src="') !== -1) {
                const imageURL = imageHTML.match(/img src="(.*?)"/)
                console.log(imageURL)
                if (imageURL) {
                    this.onPasteGif(imageURL[1])
                }
            }
        })

        //drag and drop https://www.geeksforgeeks.org/drag-and-drop-files-in-electronjs/
        document.addEventListener('drop', (event) => {
            event.preventDefault()
            event.stopPropagation()
            console.log(event)
            if (event.dataTransfer.files.length) {
                // Using the path attribute to get absolute file path
                const f = event.dataTransfer.files[0]
                const index = f.name.lastIndexOf('.')
                const ext = f.name.substr(index + 1).toLowerCase()
                if (this.roomId < 0 || ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp', 'svg', 'tiff'].includes(ext)) {
                    this.onFileChange(event.dataTransfer.files)
                }
            }
        })
    },
    async created() {
        this.optimizeMethod = await ipc.getOptimizeMethodSetting()
        if (this.$route.name === 'history-page') this.optimizeMethod = 'none'
        keyToSendMessage = await ipc.getKeyToSendMessage()
        ipcRenderer.on('setOptimizeMethodSetting', (_, method) => (this.optimizeMethod = method))
        ipcRenderer.on('startForward', (_, _id) => {
            if (this.showForwardPanel) return
            this.selectedMessage = _id
            this.msgstoForward.push(_id)
            this.showForwardPanel = true
        })
        ipcRenderer.on('replyMessage', (_, message) => this.replyMessage(message))
        ipcRenderer.on('setKeyToSendMessage', (_, key) => (keyToSendMessage = key))
        ipcRenderer.on('addMessageText', (_, message) => {
            this.message += message
            this.focusTextarea()
            this.$nextTick(() => this.resizeTextarea())
        })
        ipcRenderer.on('pasteGif', (_, GifURL) => {
            this.onPasteGif(GifURL)
            this.$emit('stickers-panel')
        })
        this.hideChatImageByDefault = await ipc.getHideChatImageByDefault()
        ipcRenderer.on('setHideChatImageByDefault', (_, hideChatImageByDefault) => {
            this.hideChatImageByDefault = hideChatImageByDefault
        })
    },
    methods: {
        sendForward(target, name) {
            if (this.msgstoForward.length <= 0) {
                console.log('No Message Selected.')
                return
            }
            const ForwardMessages = []
            const dm = target > 0

            this.messages.forEach((message) => {
                this.msgstoForward.forEach((msgId) => {
                    if (message._id === msgId) {
                        ForwardMessages.push(message)
                    }
                })
            })
            const messagesToSend = []
            ForwardMessages.forEach((msg) => {
                const singleMessage = {
                    user_id: 0,
                    message: [],
                    nickname: '',
                    time: 0,
                }
                if (msg) {
                    singleMessage.user_id = msg.senderId
                    singleMessage.message.push({
                        type: 'text',
                        data: {
                            text: msg.content,
                        },
                    })
                    if (msg.files) {
                        msg.files.forEach((file) => {
                            if (file.type.startsWith('image/'))
                                singleMessage.message.push({
                                    type: 'image',
                                    data: {
                                        file: file.url.startsWith('data:image')
                                            ? 'base64://' + file.url.replace(/^data:.+;base64,/, '')
                                            : file.url,
                                        type: 'image',
                                    },
                                })
                        })
                    }
                    singleMessage.nickname = msg.senderId !== this.account ? msg.username : this.username
                    singleMessage.time = Math.floor(msg.time / 1000)
                    messagesToSend.push(singleMessage)
                }
            })
            const origin = parseInt(String(this.roomId))
            this.$emit('start-chat', target, name)

            if (origin < 0) {
                ipc.makeForward(messagesToSend, dm, -origin, target)
            } else {
                ipc.makeForward(messagesToSend, dm, undefined, target)
            }
            this.closeForwardPanel()
        },
        closeForwardPanel() {
            this.showForwardPanel = false
            this.msgstoForward = []
            this.selectedMessage = ''
            console.log('closeForwardPanel')
        },
        addMsgtoForward(messageId) {
            this.msgstoForward.push(messageId)
            console.log('addMsgtoForward')
        },
        delMsgtoForward(messageId) {
            this.msgstoForward = this.msgstoForward.filter((e) => e !== messageId)
            if (this.msgstoForward.length === 0) {
                this.closeForwardPanel()
            }
            console.log('delMsgtoForward')
        },
        scrollToMessage(messageId) {
            const judgeSameMessage = (a, b) => {
                if (a === b) return true
                const parsedA = Buffer.from(a, 'base64')
                const parsedB = Buffer.from(b, 'base64')
                if (this.roomId < 0) {
                    for (let i = 0; i <= 16; i += 4) {
                        if (i !== 12 && parsedA.readUInt32BE(i) !== parsedB.readUInt32BE(i)) return false
                    }
                    if (parsedA.readUInt8(20) !== parsedB.readUInt8(20)) return false
                } else {
                    for (let i = 0; i <= 12; i += 4) {
                        if (i !== 8 && parsedA.readUInt32BE(i) !== parsedB.readUInt32BE(i)) return false
                    }
                    if (parsedA.readUInt8(16) !== parsedB.readUInt8(16)) return false
                }
                return true
            }
            const message = document.getElementById(messageId)
            if (message) {
                message.scrollIntoView({ behavior: 'smooth' })
                return
            } else {
                const index = this.messages.findIndex((e) => judgeSameMessage(e._id, messageId))
                if (index !== -1) {
                    let head = index - Math.floor(this.maxViewportLength / 2)
                    let tail = head + this.maxViewportLength
                    if (head < 0) {
                        head = 0
                        tail = Math.min(this.maxViewportLength, this.messages.length)
                    }
                    if (tail > this.messages.length) {
                        tail = this.messages.length
                        head = Math.max(tail - this.maxViewportLength, 0)
                    }
                    if (this.optimizeMethod !== 'none') {
                        this.visibleViewport.head = head
                        this.visibleViewport.tail = tail
                    }
                    this.$nextTick(() => {
                        const message = document.getElementById(this.messages[index]._id)
                        if (message) {
                            message.scrollIntoView()
                        }
                    })
                    return
                }
            }
            this.$message.error('被回复的消息太远啦')
        },
        onMediaLoad() {
            let height = this.$refs.mediaFile.clientHeight
            if (height < 30) height = 30

            this.mediaDimensions = {
                height: this.$refs.mediaFile.clientHeight - 10,
                width: this.$refs.mediaFile.clientWidth + 26,
            }
        },
        addNewMessage(message) {
            this.newMessages.push(message)
        },
        resetMessage(disableMobileFocus = null, editFile = null) {
            this.$emit('typing-message', null)

            if (editFile) {
                this.file = null
                this.message = ''
                return
            }

            this.resetTextareaSize()
            this.message = ''
            this.editedMessage = {}
            this.messageReply = null
            this.file = null
            this.mediaDimensions = null
            this.imageFile = null
            this.videoFile = null
            this.emojiOpened = false
            this.editAndResend = false
            this.preventKeyboardFromClosing()
            setTimeout(() => this.focusTextarea(disableMobileFocus), 0)
        },
        resetMediaFile() {
            this.mediaDimensions = null
            this.imageFile = null
            this.videoFile = null
            this.editedMessage.file = null
            this.file = null
            this.focusTextarea()
            this.$nextTick(() => this.resizeTextarea())
        },
        resetTextareaSize() {
            if (!this.$refs['roomTextarea']) return
            this.$refs['roomTextarea'].style.height = '20px'
        },
        useMessageContent(content) {
            const textarea = this.$refs.roomTextarea
            const { selectionStart, selectionEnd } = textarea
            this.message = this.message.slice(0, selectionStart) + content + this.message.slice(selectionEnd)
            const newStart = selectionStart + content.length
            this.$nextTick(() => textarea.setSelectionRange(newStart, newStart))
        },
        focusTextarea(disableMobileFocus) {
            if (detectMobile() && disableMobileFocus) return
            if (!this.$refs['roomTextarea']) return
            this.$refs['roomTextarea'].focus()
        },
        preventKeyboardFromClosing() {
            if (this.keepKeyboardOpen) this.$refs['roomTextarea'].focus()
        },
        closeQuickFace() {
            this.isQuickFaceOn = false
            this.focusTextarea()
        },
        useQuickFace(id) {
            this.isQuickFaceOn = false
            if (typeof id === 'string') {
                this.useMessageContent(`[Face: ${id}]`)
            }
            setTimeout(() => this.focusTextarea(), 0)
        },
        closeQuickAt() {
            this.isQuickAtOn = false
            this.useAtKey = false
            this.focusTextarea()
        },
        useQuickAt(id, name) {
            this.isQuickAtOn = false
            if (typeof id === 'number') {
                const atText = `@${name}`
                if (id !== 0 && name !== '全体成员') {
                    ipc.pushAtCache({
                        text: atText,
                        id: id,
                    })
                }
                this.useMessageContent((this.useAtKey ? name : atText) + ' ')
            }
            this.useAtKey = false
            setTimeout(() => this.focusTextarea(), 0)
        },
        nomatchQuickAt(search) {
            if (!this.useAtKey) return
            this.isQuickAtOn = false
            this.useAtKey = false
            this.useMessageContent(search)
            setTimeout(() => this.focusTextarea(), 0)
        },
        async sendMessage() {
            let message = this.message.trim()

            if (!this.file && !message) return

            const messageType = await ipc.getMessgeTypeSetting()

            this.$emit('send-message', {
                content: message,
                file: this.file,
                replyMessage: this.messageReply,
                resend: this.editAndResend,
                messageType: messageType,
            })

            this.resetMessage(true)
        },
        async sendStructMessage(e) {
            const isJSON = (str) => {
                try {
                    if (typeof JSON.parse(str) == 'object') return true
                } catch (e) {}
                return false
            }
            const debugmode = await ipc.getDebugSetting()
            let message = this.message.trim()

            if (!this.file && !message) return

            if (!debugmode && message.match(/serviceID[\s]*?=[\s]*?('|")(13|60|76|83)('|")/g)) return

            const msgType = isJSON(message) ? 'json' : 'xml'

            this.$emit('send-message', {
                content: message,
                file: this.file,
                replyMessage: this.messageReply,
                resend: this.editAndResend,
                messageType: msgType,
            })

            this.resetMessage(true)
        },
        loadMoreMessages() {
            setTimeout(
                () => {
                    if (this.loadingHeadMessages) return
                    if (!this.messages || this.messages.length === 0) return
                    this.$emit('fetch-messages')
                    this.loadingHeadMessages = true
                },
                // prevent scroll bouncing issue on iOS devices
                iOSDevice() ? 500 : 0,
            )
        },
        messageActionHandler({ action, message }) {
            switch (action.name) {
                case 'replyMessage':
                    return this.replyMessage(message)
                case 'editMessage':
                    return this.editMessage(message)
                case 'deleteMessage':
                    return this.$emit('delete-message', message._id)
                default:
                    return this.$emit('message-action-handler', { action, message })
            }
        },
        replyMessage(message, e) {
            if (this.showForwardPanel && e) return
            if (e && e.path[1].classList.contains('el-avatar')) return // prevent avatar dblclick
            if (message.system || message.flash) return
            this.messageReply = message
            this.focusTextarea()
        },
        editMessage(message) {
            this.resetMessage()
            this.editedMessage = { ...message }
            this.file = message.file

            if (isImageFile(this.file)) {
                this.imageFile = message.file.url
                setTimeout(() => this.onMediaLoad(), 0)
            } else if (isVideoFile(this.file)) {
                this.videoFile = message.file.url
                setTimeout(() => this.onMediaLoad(), 50)
            }

            this.message = message.content
        },
        getTopScroll(element) {
            const { scrollTop } = element
            return scrollTop
        },
        getBottomScroll(element) {
            const { scrollHeight, clientHeight, scrollTop } = element
            return scrollHeight - clientHeight - scrollTop
        },
        scrollToBottom() {
            const element = this.$refs.scrollContainer
            if (this.optimizeMethod !== 'none') {
                this.visibleViewport.tail = this.messages.length
                this.visibleViewport.head = Math.max(this.messages.length - this.maxViewportLength, 0)
            }
            this.$nextTick(() => {
                element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' })
            })
        },
        async scrollToLastMessage() {
            const lastUnreadCount = this.lastUnreadCount
            if (lastUnreadCount === 0) return
            const fetchNumber = Math.max(lastUnreadCount - this.messages.length, 0)
            console.log('Need fetch messages: ', fetchNumber)
            this.$emit('fetch-messages', false, fetchNumber)
            this.$emit('clear-last-unread-count')
            this.scrollingTolastMessage = lastUnreadCount
        },
        onChangeInput() {
            this.keepKeyboardOpen = true
            this.resizeTextarea()
            this.$emit('typing-message', this.message)
            const selectionStart = this.$refs.roomTextarea.selectionStart
            if (this.room.roomId < 0 && this.message.slice(selectionStart - 1, selectionStart) === '@') {
                this.useAtKey = true
                this.isQuickAtOn = true
                this.$nextTick(() => this.$refs.quickat.focus())
            }
        },
        resizeTextarea() {
            const el = this.$refs['roomTextarea']

            if (!el) return

            const padding = window.getComputedStyle(el, null).getPropertyValue('padding-top').replace('px', '')

            el.style.height = 0
            el.style.height = el.scrollHeight - padding * 2 + 'px'
        },
        launchFilePicker() {
            this.$refs.file.value = ''
            this.$refs.file.click()
        },
        async onFileChange(files) {
            this.fileDialog = true
            this.resetMediaFile()

            const file = files[0]
            const fileURL = URL.createObjectURL(file)
            const blobFile = await fetch(fileURL).then((res) => res.blob())
            const typeIndex = file.name.lastIndexOf('.')

            this.file = {
                blob: blobFile,
                name: file.name.substring(0, typeIndex),
                size: file.size,
                type: file.type,
                extension: file.name.substring(typeIndex + 1),
                localUrl: fileURL,
                path: file.path,
            }

            if (isImageFile(this.file)) {
                this.imageFile = fileURL
            } else if (isVideoFile(this.file)) {
                this.videoFile = fileURL
                setTimeout(() => this.onMediaLoad(), 50)
            } else {
                this.message = file.name
            }

            setTimeout(() => (this.fileDialog = false), 500)
        },
        async onPasteGif(GifURL) {
            this.fileDialog = true
            this.resetMediaFile()

            const blobFile = await fetch(GifURL).then((res) => res.blob())
            const fileURL = URL.createObjectURL(blobFile)
            const typeIndex = GifURL.lastIndexOf('.')

            this.file = {
                blob: blobFile,
                name: GifURL.substring(0, typeIndex),
                size: blobFile.size,
                type: blobFile.type,
                extension: GifURL.substring(typeIndex + 1),
                localUrl: fileURL,
                path: GifURL,
            }

            this.imageFile = fileURL
            setTimeout(() => (this.fileDialog = false), 500)
        },
        openFile({ message, action }) {
            this.$emit('open-file', { message, action, room: this.room })
        },
        textareaActionHandler() {
            this.$emit('textarea-action-handler', this.message)
        },
        msgctx(message) {
            const sect = window.getSelection().toString()
            ipc.popupMessageMenu(this.room, message, sect, this.$route.name === 'history-page')
        },
        avatarCtx(message) {
            ipc.popupAvatarMenu(message, this.room)
        },
        containerScroll(e) {
            if (this.onScrolling) {
                clearTimeout(this.onScrolling)
                this.onScrolling = null
            }
            this.onScrolling = setTimeout(() => {
                this.onScrolling = null
                if (!e.target) return

                const bottomScroll = this.getBottomScroll(e.target)
                if (bottomScroll < 60 && this.visibleViewport.tail >= this.messages.length) this.scrollMessagesCount = 0
                this.scrollIcon = bottomScroll > 500 || this.scrollMessagesCount

                const topScroll = this.getTopScroll(e.target)

                const scrollDirection = this.lastScrollPosition.top ? topScroll - this.lastScrollPosition.top : 0
                this.lastScrollPosition.top = topScroll

                if (this.optimizeMethod !== 'scroll') return
                if (topScroll < scrollOffset && scrollDirection <= 0) {
                    if (this.visibleViewport.head === 0) this.$nextTick(() => this.loadMoreMessages())
                    else {
                        this.visibleViewport.head = Math.max(0, this.visibleViewport.head - 10)
                        this.visibleViewport.tail = Math.max(
                            this.visibleViewport.head + this.maxViewportLength,
                            this.visibleViewport.tail - 10,
                        )
                    }
                }
                if (bottomScroll < scrollOffset && scrollDirection >= 0) {
                    this.visibleViewport.tail = Math.min(this.visibleViewport.tail + 10, this.messages.length)
                    this.visibleViewport.head = Math.max(0, this.visibleViewport.tail - this.maxViewportLength)
                }
                if (this.getTopScroll(e.target) <= 0) e.target.scrollTo({ top: 1 })
                if (this.getBottomScroll(e.target) <= 0 && this.visibleViewport.tail !== this.messages.length)
                    e.target.scrollTo({ top: e.target.scrollHeight - 1 - e.target.clientHeight })
            }, 24)
        },
        loadHeadMessages(infiniteState) {
            if (this.optimizeMethod !== 'infinite-loading') return
            setTimeout(
                () => {
                    this.infiniteState.head = infiniteState
                    if (this.loadingHeadMessages && this.visibleViewport.head === 0) return

                    if ((this.messagesLoaded && this.visibleViewport.head === 0) || !this.room.roomId) {
                        return infiniteState.loaded()
                    }
                    if (this.visibleViewport.head === 0) {
                        this.$emit('fetch-messages')
                        this.loadingHeadMessages = true
                    } else {
                        this.visibleViewport.head = Math.max(0, this.visibleViewport.head - 10)
                        this.visibleViewport.tail = Math.max(
                            this.visibleViewport.head + this.maxViewportLength,
                            this.visibleViewport.tail - 10,
                        )
                        infiniteState.loaded()
                    }
                },
                iOSDevice() ? 500 : 0,
            )
        },
        loadTailMessages(infiniteState) {
            if (this.optimizeMethod !== 'infinite-loading') return
            this.visibleViewport.tail = Math.min(this.visibleViewport.tail + 10, this.messages.length)
            this.visibleViewport.head = Math.max(0, this.visibleViewport.tail - this.maxViewportLength)
            this.infiniteState.tail = infiniteState
            infiniteState.loaded()
        },
        _loadMoreMessages(infiniteState) {
            setTimeout(
                () => {
                    if (this.loadingHeadMessages) return
                    if (this.messagesLoaded || !this.room.roomId) {
                        return infiniteState.complete()
                    }
                    this.infiniteState.head = infiniteState
                    this.$emit('fetch-messages')
                    this.loadingHeadMessages = true
                },
                // prevent scroll bouncing issue on iOS devices
                iOSDevice() ? 500 : 0,
            )
        },
        textctx: ipc.popupTextAreaMenu,
        roomMenu() {
            ipc.popupRoomMenu(this.room.roomId)
        },
        async updateGroupMembers() {
            const { roomId } = this.room
            if (roomId < 0) {
                const groupMembers = await ipc.getGroupMembers(-roomId)
                const self = groupMembers.find((member) => member.user_id === this.currentUserId)
                if (self && (self.role === 'owner' || self.role === 'admin')) {
                    groupMembers.unshift({
                        card: '全体成员',
                        nickname: '全体成员',
                        user_id: 0,
                    })
                }
                this.groupMembers = groupMembers
            }
        },
    },
}
</script>

<style lang="scss">
.vac-container-center {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
}

.vac-room-empty {
    font-size: 14px;
    color: #9ca6af;
    font-style: italic;
    line-height: 20px;
    white-space: pre-line;

    div {
        padding: 0 10%;
    }
}

.vac-col-messages {
    position: relative;
    height: 100%;
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-flow: column;
}

.vac-container-scroll {
    background: var(--chat-content-bg-color);
    flex: 1;
    overflow-y: auto;
    margin-top: 60px;
    -webkit-overflow-scrolling: touch;
}

.vac-messages-container {
    padding: 0 5px 5px;
}

.vac-text-started {
    font-size: 14px;
    color: var(--chat-message-color-started);
    font-style: italic;
    text-align: center;
    margin-top: 30px;
    margin-bottom: 20px;
}

.vac-infinite-loading {
    height: 68px;
}

.vac-infinite-loading-bottom {
    height: 0px;
}

.vac-icon-last-message {
    position: absolute;
    top: 80px;
    right: 20px;
    padding: 8px;
    background: var(--chat-bg-scroll-icon);
    border-radius: 50%;
    box-shadow: 0 1px 1px -1px rgba(0, 0, 0, 0.2), 0 1px 1px 0 rgba(0, 0, 0, 0.14), 0 1px 2px 0 rgba(0, 0, 0, 0.12);
    display: flex;
    cursor: pointer;
    z-index: 10;

    svg {
        height: 25px;
        width: 25px;
    }
}

.vac-icon-scroll {
    position: absolute;
    bottom: 80px;
    right: 20px;
    padding: 8px;
    background: var(--chat-bg-scroll-icon);
    border-radius: 50%;
    box-shadow: 0 1px 1px -1px rgba(0, 0, 0, 0.2), 0 1px 1px 0 rgba(0, 0, 0, 0.14), 0 1px 2px 0 rgba(0, 0, 0, 0.12);
    display: flex;
    cursor: pointer;
    z-index: 10;

    svg {
        height: 25px;
        width: 25px;
    }
}

.vac-messages-count {
    position: absolute;
    top: -8px;
    left: 11px;
    background-color: var(--chat-message-bg-color-scroll-counter);
    color: var(--chat-message-color-scroll-counter);
}

.vac-room-footer {
    display: flex;
    flex-direction: column;
    width: 100%;
    border-bottom-right-radius: 4px;
    z-index: 10;
}

.vac-box-footer {
    display: flex;
    position: relative;
    background: var(--chat-footer-bg-color);
    padding: 10px 8px 10px;
}

.vac-textarea {
    height: 20px;
    width: 100%;
    max-height: 50vh;
    line-height: 20px;
    overflow: auto;
    outline: 0;
    resize: none;
    border-radius: 20px;
    padding: 12px 16px;
    box-sizing: content-box;
    font-size: 16px;
    background: var(--chat-bg-color-input);
    color: var(--chat-color);
    caret-color: var(--chat-color-caret);
    border: var(--chat-border-style-input);

    &::placeholder {
        color: var(--chat-color-placeholder);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
}

.vac-textarea-outline {
    border: 1px solid var(--chat-border-color-input-selected);
    box-shadow: inset 0px 0px 0px 1px var(--chat-border-color-input-selected);
}

.vac-icon-textarea {
    display: flex;
    margin: 12px 0 0 5px;

    svg,
    .vac-wrapper {
        margin: 0 7px;
    }
}

.vac-media-container {
    position: absolute;
    max-width: 25%;
    left: 16px;
    top: 18px;
}

.vac-media-file {
    display: flex;
    justify-content: center;
    flex-direction: column;
    min-height: 30px;

    img {
        border-radius: 15px;
        width: 100%;
        max-width: 150px;
        max-height: 100%;
    }

    video {
        border-radius: 15px;
        width: 100%;
        max-width: 250px;
        max-height: 100%;
    }
}

.vac-icon-media {
    position: absolute;
    top: 6px;
    left: 6px;
    z-index: 10;

    svg {
        height: 20px;
        width: 20px;
        border-radius: 50%;
    }

    &:before {
        content: ' ';
        position: absolute;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        border-radius: 50%;
        z-index: -1;
    }
}

.vac-file-container {
    display: flex;
    align-items: center;
    width: calc(100% - 115px);
    height: 20px;
    padding: 12px 0;
    box-sizing: content-box;
    background: var(--chat-bg-color-input);
    border: var(--chat-border-style-input);
    border-radius: 20px;
}

.vac-file-container-edit {
    width: calc(100% - 150px);
}

.vac-file-message-room {
    max-width: 300px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.vac-icon-file-room {
    display: flex;
    margin: 0 8px 0 15px;
}

.vac-icon-remove {
    margin: 0 8px;

    svg {
        height: 18px;
        width: 18px;
    }
}

.vac-send-disabled,
.vac-send-disabled svg {
    cursor: none !important;
    pointer-events: none !important;
    transform: none !important;
}

.vac-messages-hidden {
    opacity: 0;
}

@media only screen and (max-width: 768px) {
    .vac-container-scroll {
        margin-top: 50px;
    }

    .vac-infinite-loading {
        height: 58px;
    }

    .vac-box-footer {
        border-top: var(--chat-border-style-input);
        padding: 7px 2px 7px 7px;
    }

    .vac-text-started {
        margin-top: 20px;
    }

    .vac-textarea {
        padding: 7px;
        line-height: 18px;

        &::placeholder {
            color: transparent;
        }
    }

    .vac-icon-textarea {
        margin: 6px 0 0 5px;

        svg,
        .wrapper {
            margin: 0 5px;
        }
    }

    .vac-media-container {
        top: 10px;
        left: 10px;
    }

    .vac-media-file {
        img,
        video {
            transform: scale(0.97);
        }
    }

    .vac-room-footer {
        width: 100%;
    }

    .vac-file-container {
        padding: 7px 0;

        .icon-file {
            margin-left: 10px;
        }
    }

    .vac-icon-scroll {
        bottom: 70px;
    }
}
</style>
