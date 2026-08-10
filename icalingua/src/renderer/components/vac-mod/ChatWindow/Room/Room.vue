<template>
    <div
        v-show="(isMobile && !showRoomsList) || !isMobile || singleRoom"
        class="vac-col-messages"
        :class="{ 'vac-empty-window-drag-region': windowDragEnabled && !room.roomId }"
    >
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
            :showSinglePanel="showSinglePanel"
            :removeEmotes="removeHeaderEmotes"
            :window-drag-enabled="windowDragEnabled"
            @toggle-rooms-list="$emit('toggle-rooms-list')"
            @menu-action-handler="$emit('menu-action-handler', $event)"
            @pokefriend="$emit('pokefriend')"
            @room-menu="roomMenu"
            @open-group-announcements="openGroupAnnouncements"
            @open-group-files="openGroupFiles"
            @open-group-album="openGroupAlbum"
            @open-group-essence="openGroupEssence"
            @back-contact="$emit('back-contact')"
            @open-group-member-panel="$emit('open-group-member-panel')"
        >
            <template v-for="(index, name) in $scopedSlots" #[name]="data">
                <template v-if="name !== 'messages-top'">
                    <slot :name="name" v-bind="data" />
                </template>
            </template>
        </room-header>

        <div ref="scrollContainer" class="vac-container-scroll" @scroll="containerScroll">
            <slot name="messages-top" />
            <loader :show="loadingMessages" />
            <div
                ref="messagesContainer"
                class="vac-messages-container"
                @mousedown.left="startMouseSelect"
                @dragstart="$event.stopPropagation()"
            >
                <div v-if="mouseSelecting" ref="mouseSelectArea" class="vac-mouse-select-area"></div>
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
                                :show-date="
                                    i + visibleViewport.head > 0 &&
                                    m.date !== messages[i + visibleViewport.head - 1].date
                                "
                                :message-offset="
                                    i + visibleViewport.head > 0 &&
                                    m.senderId !== messages[i + visibleViewport.head - 1].senderId
                                "
                                :audio-session="getAudioSession(m)"
                                :edited-message="editedMessage"
                                :room-users="room.users"
                                :text-messages="textMessages"
                                :show-new-messages-divider="showNewMessagesDivider && unreadDividerMessageId === m._id"
                                :text-formatting="textFormatting"
                                :showForwardPanel="showForwardPanel"
                                :selected="selectedMessageIds.has(m._id)"
                                :linkify="linkify"
                                :forward-res-id="forwardResId"
                                :usePanguJs="usePanguJsRecv"
                                @open-file="openFile"
                                @ctx="msgctx($event, m)"
                                @avatar-ctx="avatarCtx(m, $event)"
                                @download-image="$emit('download-image', $event)"
                                @open-image="openMessageImage"
                                @poke="$emit('pokegroup', m.senderId)"
                                @open-forward="$emit('open-forward', $event)"
                                @start-chat="(e, f) => $emit('start-chat', e, f)"
                                @add-msg-to-forward="addmsgToForward"
                                @del-msg-to-forward="delmsgToForward"
                                @scroll-to-message="(id) => scrollToMessage(id, true)"
                                @reply="replyMessage(m, $event)"
                                @inline-command="useMessageInlineCommand(m, $event)"
                                :hide-chat-image-by-default="hideChatImageByDefault"
                                :hide-chat-video-by-default="hideChatVideoByDefault"
                                :local-image-viewer-by-default="localImageViewerByDefault"
                                :disableQLottie="disableQLottie"
                                :record-path="recordPath"
                                :isSteamVrRunning="isSteamVrRunning"
                            />
                        </div>
                    </transition-group>
                    <transition name="vac-fade-message">
                        <infinite-loading
                            v-if="
                                (visibleViewport.tail !== messages.length || canLoadAfter) &&
                                optimizeMethod === 'infinite-loading'
                            "
                            :key="'tail-' + canLoadAfter"
                            :class="{
                                'vac-infinite-loading-bottom': visibleViewport.tail !== messages.length || canLoadAfter,
                            }"
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
                <div v-if="lastUnreadAt" class="vac-icon-last-at-message" @click="scrollToLastAtMessage">
                    <transition name="vac-bounce">
                        <div v-if="lastUnreadAt" class="vac-badge-counter vac-messages-count">@</div>
                    </transition>
                    <slot name="scroll-icon">
                        <svg-icon name="dropdown" style="transform: rotate(180deg)" />
                    </slot>
                </div>
            </transition>
            <transition name="vac-bounce">
                <div
                    v-if="!lastUnreadAt && lastUnreadCount >= 10"
                    class="vac-icon-last-message"
                    @click="scrollToLastMessage"
                >
                    <transition name="vac-bounce">
                        <div v-if="!lastUnreadAt && lastUnreadCount" class="vac-badge-counter vac-messages-count">
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
                    v-if="
                        scrollIcon ||
                        pendingMessagesCount ||
                        (visibleViewport.tail !== messages.length && messages.length !== 0)
                    "
                    class="vac-icon-scroll"
                    @click="scrollToBottom"
                >
                    <transition name="vac-bounce">
                        <div v-if="newMessagesCount" class="vac-badge-counter vac-messages-count">
                            {{ newMessagesCount }}
                        </div>
                    </transition>
                    <slot name="scroll-icon">
                        <svg-icon name="dropdown" param="scroll" />
                    </slot>
                </div>
            </transition>
        </div>
        <div
            v-show="hasValidRoom"
            ref="roomFooter"
            class="vac-room-footer"
            :class="{ 'vac-app-box-shadow': (showFooter && (messageReply || editAndResend)) || showForwardPanel }"
        >
            <room-message-reply
                v-show="showFooter"
                :room="room"
                :message-reply="messageReply"
                :linkify="linkify"
                :showForwardPanel="showForwardPanel"
                :usePanguJs="usePanguJsRecv"
                @reset-message="resetMessage"
                @open-forward="$emit('open-forward', $event)"
            >
                <template v-for="(index, name) in $scopedSlots" #[name]="data">
                    <template v-if="name !== 'messages-top'">
                        <slot :name="name" v-bind="data" />
                    </template>
                </template>
            </room-message-reply>
            <RoomForwardMessage
                :messages="messages"
                :showForwardPanel="showForwardPanel"
                :msgsToForward="msgsToForward"
                v-on="$listeners"
                @close-forward-panel="closeForwardPanel"
                :account="account"
                :username="username"
                :roomId="roomId"
                :standalone="standalone"
            />
            <div
                style="padding-top: 10px; padding-left: 10px; color: var(--panel-color-desc)"
                v-if="editAndResend"
                v-show="showFooter"
            >
                编辑重发
            </div>

            <!-- 多图预览条：位于输入框上方，类似回复面板 -->
            <transition name="vac-slide-up">
                <div v-if="imageFiles.length && showFooter" class="vac-attached-images-bar">
                    <div class="vac-attached-images-list" @wheel.prevent="onImageListWheel">
                        <div v-for="(img, idx) in imageFiles" :key="idx" class="vac-attached-image-item">
                            <img :src="img" @click="openImage(img)" />
                            <div class="vac-attached-image-remove" @click="removeImage(idx)">
                                <svg-icon name="close" param="image" />
                            </div>
                        </div>
                    </div>
                    <div class="vac-icon-reply">
                        <div class="vac-svg-button" @click="resetMediaFile">
                            <svg-icon name="close-outline" />
                        </div>
                    </div>
                </div>
            </transition>

            <div class="vac-box-footer" v-show="showFooter">
                <el-dialog
                    title="发送语音"
                    :visible.sync="audioDialogVisible"
                    width="360px"
                    append-to-body
                    :close-on-click-modal="false"
                    :close-on-press-escape="false"
                    :show-close="!isAudioSending"
                    @close="handleAudioDialogClose"
                >
                    <div class="vac-audio-dialog-body">
                        <div class="vac-audio-dialog-status">
                            <span v-if="isAudioRecording" class="vac-audio-recording-dot"></span>
                            <i v-else-if="isAudioStarting" class="el-icon-loading"></i>
                            <span>{{ audioRecordingStatus }}</span>
                            <strong>{{ formatAudioDuration(audioDuration) }}</strong>
                        </div>

                        <p v-if="isAudioStarting || isAudioRecording" class="vac-audio-dialog-hint">
                            {{ audioRecordingHint }}
                        </p>
                        <message-audio
                            v-else-if="audioRecordUrl"
                            class="vac-audio-preview"
                            :src="audioRecordUrl"
                            :audio-session="audioPreviewSession"
                        />
                    </div>

                    <span slot="footer" class="dialog-footer">
                        <template v-if="isAudioStarting || isAudioRecording">
                            <el-button @click="cancelAudioRecording">取消</el-button>
                            <el-button
                                type="primary"
                                :loading="isAudioStarting"
                                :disabled="isAudioStarting"
                                @click="stopAudioRecording"
                            >
                                完成
                            </el-button>
                        </template>
                        <template v-else>
                            <el-button :disabled="isAudioSending" @click="cancelAudioRecording">取消</el-button>
                            <el-button :disabled="isAudioSending" @click="reRecordAudio">重录</el-button>
                            <el-button
                                type="primary"
                                :loading="isAudioSending"
                                :disabled="isAudioSending"
                                @click="sendAudioRecording"
                            >
                                发送
                            </el-button>
                        </template>
                    </span>
                </el-dialog>

                <div v-if="videoFiles.length" class="vac-media-container">
                    <div class="vac-svg-button vac-icon-media" @click="resetMediaFile">
                        <slot name="image-close-icon">
                            <svg-icon name="close" param="image" />
                        </slot>
                    </div>
                    <div ref="mediaFile" class="vac-media-file">
                        <video width="100%" height="100%" controls>
                            <source :src="videoFiles[0]" type="video/mp4" />
                            <source :src="videoFiles[0]" type="video/ogg" />
                            <source :src="videoFiles[0]" type="video/webm" />
                        </video>
                    </div>
                </div>

                <div
                    v-else-if="files.length && !imageFiles.length && !videoFiles.length"
                    class="vac-file-container"
                    :class="{ 'vac-file-container-edit': editedMessage._id }"
                >
                    <div class="vac-icon-file-room">
                        <slot name="file-icon">
                            <svg-icon name="file" />
                        </slot>
                    </div>
                    <div class="vac-file-message-room" :title="files[0].name + '.' + files[0].extension">
                        {{ files[0].name + '.' + files[0].extension }}
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
                                ? groupMembers.map(({ card, nickname, user_id }) => [
                                      card || nickname || String(user_id),
                                      user_id,
                                  ])
                                : []
                        "
                        description="member(s)"
                        searchMethod="includes"
                        inputSize="200"
                        @cancel="closeQuickAt"
                        @confirm="useQuickAt"
                        @nomatch="nomatchQuickAt"
                    >
                        <el-avatar size="small" v-if="id !== 0" :src="`https://q1.qlogo.cn/g?b=qq&nk=${id}&s=40`" />
                        <p style="word-wrap: 'break-word'; margin-right: auto; margin-left: 5px">{{ name }}</p>
                        <p v-if="id !== 0" style="font-family: 'monospace'">{{ id }}</p>
                    </SearchInput>
                </transition>

                <textarea
                    v-show="!files.length || imageFiles.length || videoFiles.length"
                    ref="roomTextarea"
                    :placeholder="textMessages.TYPE_MESSAGE"
                    class="vac-textarea"
                    :class="{
                        'vac-textarea-outline': editAndResend,
                    }"
                    :style="{
                        'min-height': `${
                            mediaDimensions ? `min(calc( 100vh - 120px), ${mediaDimensions.height}px)` : '20px'
                        }`,
                        'padding-left': `${mediaDimensions ? mediaDimensions.width - 10 : 12}px`,
                    }"
                    @input="onChangeInput"
                    @keydown="onTextareaKeydown"
                    @click.right="textctx"
                    spellcheck="false"
                />

                <div class="vac-icon-textarea">
                    <div v-if="editAndResend || isSteamVrRunning" class="vac-svg-button" @click="resetMessage">
                        <slot name="edit-close-icon">
                            <svg-icon name="close-outline" class="icon-fill" />
                        </slot>
                    </div>

                    <div
                        v-if="isSteamVrRunning"
                        class="vac-svg-button"
                        @click="paste"
                        style="width: 38px; height: 24px; display: flex; justify-content: center; align-items: center"
                    >
                        <img :src="pasteIcon" alt="" style="height: 20px; width: 20px" />
                    </div>

                    <div class="vac-svg-button" @click="$emit('stickers-panel')" @click.right="stickersMenu($event)">
                        <svg-icon name="emoji" />
                    </div>

                    <div
                        v-if="showAudio"
                        class="vac-svg-button vac-record-button"
                        :class="{
                            'vac-recording': isAudioRecording,
                            'vac-recording-pending': isAudioStarting || isAudioSending,
                        }"
                        :title="isAudioStarting ? '正在启动麦克风' : isAudioRecording ? '停止录音' : '录音'"
                        @click="toggleAudioRecording"
                    >
                        <slot name="audio-icon">
                            <svg-icon :name="isAudioRecording ? 'microphone-off' : 'microphone'" />
                        </slot>
                    </div>

                    <el-popover placement="top" trigger="hover">
                        <div
                            slot="reference"
                            v-if="showFiles"
                            class="vac-svg-button"
                            @click="launchFilePicker(false)"
                            @click.right="launchFilePicker(true)"
                        >
                            <slot name="paperclip-icon">
                                <svg-icon name="paperclip" />
                            </slot>
                        </div>
                        <el-button
                            type="text"
                            icon="el-icon-picture-outline"
                            @click="launchFilePicker(false)"
                            style="text-align: center; width: 100%"
                        >
                            识别媒体发送 (图标左键)
                        </el-button>
                        <!-- 分割线-->
                        <div style="height: 1px; background-color: #ebebeb; margin: 0 5px"></div>
                        <el-button
                            type="text"
                            icon="el-icon-paperclip"
                            @click="launchFilePicker(true)"
                            style="text-align: center; width: 100%"
                        >
                            仅以文件发送 (图标右键)
                        </el-button>
                    </el-popover>

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
                        multiple
                        style="display: none"
                        @change="onFileChange($event.target.files)"
                    />

                    <input
                        v-if="showFiles"
                        ref="fileForce"
                        type="file"
                        :accept="acceptedFiles"
                        multiple
                        style="display: none"
                        @change="onFileChange($event.target.files, true)"
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
import fs from 'fs'
import path from 'path'
import { ipcRenderer, webUtils } from 'electron'

import InfiniteLoading from 'vue-infinite-loading'
import vClickOutside from 'v-click-outside'

import Loader from '../../components/Loader'
import SvgIcon from '../../components/SvgIcon'

import RoomHeader from './RoomHeader'
import RoomMessageReply from './RoomMessageReply'
import RoomForwardMessage from './RoomForwardMessage'
import Message from '../Message/Message'
import MessageAudio from '../Message/MessageAudio'
import SearchInput from '../../../SearchInput'

import faceNames from '../../../../../../static/faceNames'
import getStaticPath from '../../../../../utils/getStaticPath'

import ipc from '../../../../utils/ipc'
import { createRendererLifecycleScope } from '../../../../utils/rendererLifecycleScope'
import { detectMobile, iOSDevice } from '../../utils/mobileDetection'
import { isImageFile, isVideoFile, isAudioFile } from '../../utils/mediaFile'
import { getOrderedMessageParts } from '../../utils/messageMediaOrder'
import Recorder from '../../utils/recorder'

const faceDir = path.join(getStaticPath(), 'face')
const messageDraftStorageKey = 'icalingua:message-draft'
const messageDraftThrottleMs = 500

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
        MessageAudio,
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
        unreadDividerCount: { type: Number, default: 0 },
        showFooter: { type: Boolean, required: true },
        showHeader: { type: Boolean, default: true },
        acceptedFiles: { type: String, required: true },
        textFormatting: { type: Boolean, required: true },
        loadingRooms: { type: Boolean, required: true },
        roomInfo: { type: Function, default: null },
        textareaAction: { type: Function, default: null },
        linkify: { type: Boolean, default: true },
        account: { type: Number, required: true },
        username: { type: String, required: true },
        forwardResId: { type: String, required: false },
        lastUnreadCount: { type: Number, required: false, default: 0 },
        lastUnreadAt: { type: Boolean, required: false, default: false },
        showSinglePanel: { type: Boolean, require: true, default: false },
        removeHeaderEmotes: { type: Boolean, required: false, default: false },
        usePanguJsRecv: { type: Boolean, required: false, default: false },
        isSteamVrRunning: { type: Boolean, required: false, default: false },
        canLoadAfter: { type: Boolean, required: false, default: false },
        pendingMessagesCount: { type: Number, required: false, default: 0 },
        standalone: { type: Boolean, default: false },
        windowDragEnabled: { type: Boolean, default: false },
    },
    data() {
        return {
            editedMessage: {},
            messageReply: null,
            loadingMessages: false,
            loadingHeadMessages: false,
            loadingTailMessages: false,
            files: [],
            imageFiles: [],
            videoFiles: [],
            mediaDimensions: null,
            fileDialog: false,
            emojiOpened: false,
            scrollIcon: false,
            scrollMessagesCount: 0,
            keepKeyboardOpen: false,
            textareaCursorPosition: null,
            textMessages: require('../../locales').default,
            editAndResend: false,
            msgsToForward: [],
            showForwardPanel: false,
            isQuickFaceOn: false,
            isQuickAtOn: false,
            faceNames,
            faceDir,
            groupMembers: null,
            useAtKey: false,
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
            hideChatImageByDefault: false,
            hideChatVideoByDefault: false,
            localImageViewerByDefault: false,
            disableQLottie: false,
            recordPath: '',
            mouseSelecting: false,
            mouseSelectArea: null,
            mouseSelectIds: null,
            mouseSelectFrame: null,
            mouseSelectBounds: null,
            isMessageEmpty: true,
            membersCount: 0,
            scrollToBottomTimer: null,
            scrollToBottomGeneration: 0,
            textareaResizeScheduled: false,
            pasteIcon: `file://${__static}/Clipboard.svg`,
            audioSessions: {},
            audioPreviewSession: { audio: new Audio() },
            audioRecorder: null,
            isAudioStarting: false,
            isAudioRecording: false,
            isAudioSending: false,
            audioDialogVisible: false,
            audioRecord: null,
            audioRecordUrl: '',
            audioDuration: 0,
            audioDurationTimer: null,
            audioRecordingStartedAt: 0,
            messageDraftSaveTimer: null,
            pendingMessageDraft: '',
            messageListSnapshot: {
                length: Array.isArray(this.messages) ? this.messages.length : 0,
                firstId: Array.isArray(this.messages) && this.messages.length ? this.messages[0]._id : null,
                lastId:
                    Array.isArray(this.messages) && this.messages.length
                        ? this.messages[this.messages.length - 1]._id
                        : null,
            },
        }
    },
    computed: {
        newMessagesCount() {
            return Math.max(Number(this.scrollMessagesCount) || 0, Number(this.pendingMessagesCount) || 0)
        },
        room() {
            return this.rooms.find((room) => room.roomId === this.roomId) || {}
        },
        hasValidRoom() {
            const roomId = Number(this.room.roomId)
            return Number.isFinite(roomId) && roomId !== 0 && Object.keys(this.room).length
        },
        showNoMessages() {
            return this.room.roomId && !this.messages.length && !this.loadingMessages && !this.loadingRooms
        },
        showMessagesStarted() {
            return this.messages.length && this.messagesLoaded && this.visibleViewport.head === 0
        },
        maxViewportLength() {
            const w = window.visualViewport ? window.visualViewport : window
            const height = w.height || w.innerHeight
            // 每条消息估算高度 60px，乘以 5 倍缓冲确保快速滚动不会出现空白
            return Math.ceil(height / 60) * 5
        },
        selectedMessageIds() {
            return new Set(this.msgsToForward)
        },
        unreadDividerMessageId() {
            let remaining = this.unreadDividerCount
            if (remaining <= 0) return null

            for (let index = this.messages.length - 1; index >= 0; index--) {
                const message = this.messages[index]
                if (!message || message.system) continue
                remaining--
                if (remaining === 0) return message._id
            }
            return null
        },
        audioRecordingStatus() {
            if (this.isAudioStarting) return '正在启动麦克风'
            if (this.isAudioRecording) return '正在录音'
            return '录音预览'
        },
        audioRecordingHint() {
            return this.isAudioStarting ? '准备完成后再开始说话' : '点击“完成”结束录音'
        },
    },
    watch: {
        hasValidRoom(val) {
            if (val) this.scheduleTextareaResize()
        },
        showFooter(val) {
            if (val) this.scheduleTextareaResize()
        },
        canLoadAfter(val) {
            // 当 canLoadAfter 变为 true 且已在底部时，自动触发加载
            if (
                val &&
                this.optimizeMethod === 'infinite-loading' &&
                this.visibleViewport.tail >= this.messages.length
            ) {
                this.$emit('fetch-messages-after')
            }
        },
        loadingMessages(val) {
            if (val) this.infiniteState.head = null
            else if (!val) this.focusTextarea(true)
        },
        async room(newVal, oldVal) {
            if (newVal.roomId && newVal.roomId !== oldVal.roomId) {
                this.clearAudioSessions()
                this.loadingMessages = true
                this.scrollIcon = false
                this.scrollMessagesCount = 0
                //this.resetMessage(true)

                this.editAndResend = false
                this.messageReply = null
                this.closeForwardPanel()
                await this.updateGroupMembers()
            } else if (newVal.roomId === 0) {
                this.scrollIcon = false
                this.scrollMessagesCount = 0
            }
        },
        messages(newVal, oldVal) {
            if (this.mouseSelecting) this.mouseSelectBounds = null
            const currentSnapshot = {
                length: newVal ? newVal.length : 0,
                firstId: newVal && newVal.length ? newVal[0]._id : null,
                lastId: newVal && newVal.length ? newVal[newVal.length - 1]._id : null,
            }
            const previousSnapshot =
                oldVal === newVal
                    ? this.messageListSnapshot
                    : {
                          length: oldVal ? oldVal.length : 0,
                          firstId: oldVal && oldVal.length ? oldVal[0]._id : null,
                          lastId: oldVal && oldVal.length ? oldVal[oldVal.length - 1]._id : null,
                      }
            this.messageListSnapshot = currentSnapshot

            const element = this.$refs.scrollContainer
            if (!element) return

            const newLen = currentSnapshot.length
            const oldLen = previousSnapshot.length
            const offset = newLen - oldLen

            // 头部加载历史消息（最后一条消息相同 = 在前面插入了历史消息）
            if (oldLen && newLen && previousSnapshot.lastId === currentSnapshot.lastId) {
                const scrollTop = this.getTopScroll(element)
                const scrollBottom = this.getBottomScroll(element)
                if (scrollTop < scrollBottom) {
                    // 接近顶部，扩展尾部保持视觉稳定
                    this.visibleViewport.tail = Math.min(newLen, this.visibleViewport.head + this.maxViewportLength)
                }
                if (scrollTop > scrollBottom) {
                    // 接近底部，向右平移视口
                    this.visibleViewport.tail = Math.min(newLen, this.visibleViewport.tail + offset)
                    this.visibleViewport.head = Math.max(0, this.visibleViewport.tail - this.maxViewportLength)
                }
            }

            // 初始加载或不使用优化模式
            if (!oldLen || this.optimizeMethod === 'none') {
                this.visibleViewport.head = 0
                this.visibleViewport.tail = newLen
            }

            // 新增单条消息
            if (oldLen === newLen - 1) {
                this.loadingMessages = false

                if (
                    newVal[newLen - 1].senderId === this.currentUserId ||
                    (this.getBottomScroll(element) < 60 &&
                        (this.visibleViewport.tail === oldLen || this.optimizeMethod === 'none'))
                ) {
                    // 自己发的或在底部：自动滚动到底
                    this.queueScrollToBottom()
                    return
                } else {
                    // 不在底部：显示新消息提示
                    this.scrollIcon = true
                    return this.scrollMessagesCount++
                }
            }

            // 防御性修复：只要消息列表非空就清除 loading 状态
            // 解决 addMessage 与 fetchMessage 竞态导致 loadingMessages 永远为 true 的问题
            if (newLen > 0 && this.loadingMessages) {
                this.loadingMessages = false
            }

            if (this.infiniteState.head) {
                this.infiniteState.head.loaded()
            } else if (newLen && !this.scrollIcon && newLen !== oldLen && !this.canLoadAfter) {
                // 不在 gotoMessage 模式时才自动滚动到底部
                this.queueScrollToBottom()
            }

            // 处理向下加载完成
            if (this.loadingTailMessages) {
                this.loadingTailMessages = false
                if (this.infiniteState.tail) {
                    if (newLen > oldLen) {
                        // 有新消息加载，继续允许加载
                        this.visibleViewport.tail = newLen
                        this.visibleViewport.head = Math.max(0, this.visibleViewport.tail - this.maxViewportLength)
                        this.infiniteState.tail.loaded()
                    } else {
                        // 没有新消息了，完成加载
                        this.infiniteState.tail.complete()
                    }
                }
            }

            this.lifecycleScope.timeout(() => (this.loadingHeadMessages = false), 0)
        },
        messagesLoaded(val) {
            if (val) this.loadingMessages = false
            if (this.infiniteState.head) {
                if (this.optimizeMethod !== 'none') this.infiniteState.head.loaded()
                else this.infiniteState.head.complete()
            }
        },
        files() {
            this.updateMessageEmptyState()
        },
    },
    async mounted() {
        this.restoreMessageDraft()

        this.lifecycleScope.onEvent(window, 'paste', (event) => {
            console.log(event.clipboardData.files)
            const imageHTML = event.clipboardData.getData('text/html') || '.'
            console.log(imageHTML)
            if (event.clipboardData.files && event.clipboardData.files.length) {
                // Using the path attribute to get absolute file path
                if (!event.clipboardData.files[0].path) {
                    console.log('No file path found.')
                    this.onFileChange(event.clipboardData.files)
                    return
                }
                this.$emit('open-choose-file-type', event.clipboardData.files)
            } else if (imageHTML.indexOf('<img ') !== -1) {
                try {
                    const imageMatch = imageHTML.match(/<img [^>]*>/)[0]
                    const imageURL = imageMatch.match(/src="(.*?)"/)
                    if (imageURL) {
                        this.onPasteGif(imageURL[1].replace(/\\\//g, '/').replace(/&amp;/g, '&'))
                    }
                } catch (e) {
                    console.error(e)
                }
            }
        })

        //drag and drop https://www.geeksforgeeks.org/drag-and-drop-files-in-electronjs/
        this.lifecycleScope.onEvent(document, 'drop', (event) => {
            event.preventDefault()
            event.stopPropagation()
            console.log(event)
            //纯文本
            if (event.dataTransfer.getData('text')) {
                if (event.target.className === 'vac-textarea') {
                    this.appendMessageText(event.dataTransfer.getData('text'))
                    this.focusTextarea()
                }
            }
            if (event.dataTransfer.files.length) {
                // Using the path attribute to get absolute file path
                if (!event.dataTransfer.files[0].path) {
                    console.log('No file path found.')
                    this.onFileChange(event.dataTransfer.files)
                    return
                }
                this.$emit('open-choose-file-type', event.dataTransfer.files)
            } else if (event.dataTransfer.getData('text/html')) {
                //富文本中的图片
                const imageHTML = event.dataTransfer.getData('text/html')
                if (imageHTML.indexOf('<img ') !== -1) {
                    try {
                        const imageMatch = imageHTML.match(/<img [^>]*>/)[0]
                        const imageURL = imageMatch.match(/src="(.*?)"/)
                        if (imageURL) {
                            this.onPasteGif(imageURL[1].replace(/\\\//g, '/').replace(/&amp;/g, '&'))
                        }
                    } catch (e) {
                        console.error(e)
                    }
                }
            }
        })
    },
    async created() {
        this.lifecycleScope = createRendererLifecycleScope()
        this.optimizeMethod = await ipc.getOptimizeMethodSetting()
        if (this.$route.name === 'history-page' || this.$route.name === 'member-history-page')
            this.optimizeMethod = 'none'
        keyToSendMessage = await ipc.getKeyToSendMessage()
        this.lifecycleScope.onIpc('setOptimizeMethodSetting', (_, method) => (this.optimizeMethod = method))
        this.lifecycleScope.onIpc('startForward', (_, _id) => {
            if (this.showForwardPanel) return
            this.msgsToForward = [_id]
            this.showForwardPanel = true
        })
        this.lifecycleScope.onIpc('replyMessage', (_, message) => this.replyMessage(message))
        this.lifecycleScope.onIpc('setKeyToSendMessage', (_, key) => {
            keyToSendMessage = key
        })
        this.lifecycleScope.onIpc('addMessageText', (_, message) => {
            this.appendMessageText(message)
            this.focusTextarea()
        })
        this.lifecycleScope.onIpc('setMessageText', (_, message) => {
            this.setMessageText(message)
            this.focusTextarea()
        })
        this.lifecycleScope.onIpc('pasteGif', (_, GifURL) => {
            this.onPasteGif(GifURL)
            this.$emit('close-stickers-panel')
        })
        this.hideChatImageByDefault = await ipc.getHideChatImageByDefault()
        this.lifecycleScope.onIpc('setHideChatImageByDefault', (_, hideChatImageByDefault) => {
            this.hideChatImageByDefault = hideChatImageByDefault
        })
        this.hideChatVideoByDefault = await ipc.getHideChatVideoByDefault()
        this.lifecycleScope.onIpc('setHideChatVideoByDefault', (_, hideChatVideoByDefault) => {
            this.hideChatVideoByDefault = hideChatVideoByDefault
        })
        this.localImageViewerByDefault = (await ipc.getSettings()).localImageViewerByDefault
        this.lifecycleScope.onIpc('setLocalImageViewerByDefault', (_, localImageViewerByDefault) => {
            this.localImageViewerByDefault = localImageViewerByDefault
        })
        this.disableQLottie = (await ipc.getSettings()).disableQLottie
        this.lifecycleScope.onIpc('setDisableQLottie', (_, a) => {
            this.disableQLottie = a
        })
        const isAdapter = (await ipc.getSettings()).adapter === 'socketIo'
        if (isAdapter) {
            this.recordPath = (await ipc.getSettings()).server + '/records'
        } else {
            this.recordPath = 'file://' + (await ipc.getStorePath()) + '/records'
        }
        this.lifecycleScope.onIpc('forwardSingleMessage', (_, _id) => {
            this.showForwardPanel = true
            if (!this.selectedMessageIds.has(_id)) {
                this.msgsToForward = [...this.msgsToForward, _id]
            }
        })
    },
    beforeDestroy() {
        this.scrollToBottomGeneration++
        this.lifecycleScope?.dispose()
        this.textareaResizeScheduled = false
        this.saveMessageDraft(this.getMessageText(), true)
        this.disposeAudioRecorder()
        if (this.onScrolling) {
            this.lifecycleScope.cancelTimeout(this.onScrolling)
            this.onScrolling = null
        }
        if (this.scrollToBottomTimer) {
            this.lifecycleScope.cancelAnimationFrame(this.scrollToBottomTimer)
            this.scrollToBottomTimer = null
        }
        if (this.mouseSelectFrame !== null) {
            this.lifecycleScope.cancelAnimationFrame(this.mouseSelectFrame)
            this.mouseSelectFrame = null
        }
        if (this.mouseSelecting) {
            window.removeEventListener('mousemove', this.continueMouseSelect)
            window.removeEventListener('mouseup', this.endMouseSelect)
            this.mouseSelecting = false
        }
        this.mouseSelectBounds = null
        this.clearAudioSessions()
    },
    methods: {
        createAudioRecorder() {
            if (this.audioRecorder) return this.audioRecorder

            this.audioRecorder = new Recorder({
                sampleRate: 24000,
                bitRate: 16,
                afterRecording: (record) => this.handleAudioRecord(record),
                micFailed: (error) => this.handleAudioRecordError(error),
            })
            return this.audioRecorder
        },
        async startAudioRecording() {
            this.clearAudioRecord()
            this.audioDialogVisible = true
            this.audioDuration = 0
            this.isAudioStarting = true
            this.isAudioRecording = false
            try {
                const recorder = this.createAudioRecorder()
                const result = await recorder.start()
                if (!result) return
                if (!this.isAudioStarting || !this.audioDialogVisible) {
                    recorder.cancel()
                    return
                }

                this.audioDuration = Number(recorder.duration) || 0
                this.audioRecordingStartedAt = Date.now() - this.audioDuration * 1000
                this.isAudioStarting = false
                this.isAudioRecording = true
                this.startAudioDurationTimer()
            } catch (error) {
                this.handleAudioRecordError(error)
            }
        },
        toggleAudioRecording() {
            if (!this.showAudio || this.isAudioStarting || this.isAudioSending || this.audioRecord) return

            if (this.isAudioRecording) {
                this.stopAudioRecording()
                return
            }

            this.startAudioRecording()
        },
        handleAudioRecord(record) {
            this.isAudioStarting = false
            this.isAudioRecording = false
            this.stopAudioDurationTimer()
            // Ignore a recording that contains no captured audio frames.
            if (!record || !record.blob || !record.blob.size || !record.duration) {
                this.clearAudioRecord()
                this.audioDialogVisible = false
                return
            }

            this.audioRecord = record
            this.audioRecordUrl = record.url || ''
            this.audioDuration = record.duration
            this.audioDialogVisible = true
        },
        stopAudioRecording() {
            if (this.isAudioStarting) return
            const recorder = this.audioRecorder
            if (!recorder) return
            try {
                recorder.stop()
            } catch (error) {
                this.handleAudioRecordError(error)
            }
        },
        startAudioDurationTimer() {
            this.stopAudioDurationTimer()
            this.audioDurationTimer = this.lifecycleScope.interval(() => {
                if (!this.isAudioRecording) return
                this.audioDuration = (Date.now() - this.audioRecordingStartedAt) / 1000
            }, 200)
        },
        stopAudioDurationTimer() {
            if (!this.audioDurationTimer) return
            this.lifecycleScope.cancelInterval(this.audioDurationTimer)
            this.audioDurationTimer = null
        },
        formatAudioDuration(seconds) {
            const duration = Math.max(0, Math.floor(Number(seconds) || 0))
            const minutes = Math.floor(duration / 60)
            const remainder = String(duration % 60).padStart(2, '0')
            return `${minutes}:${remainder}`
        },
        cancelAudioRecording() {
            if (this.isAudioSending) return
            if (this.isAudioStarting || this.isAudioRecording) this.audioRecorder?.cancel?.()
            this.stopAudioDurationTimer()
            this.isAudioStarting = false
            this.isAudioRecording = false
            this.audioDialogVisible = false
            this.clearAudioRecord()
        },
        reRecordAudio() {
            if (this.isAudioStarting || this.isAudioSending || this.isAudioRecording) return

            this.startAudioRecording()
        },
        async sendAudioRecording() {
            if (!this.audioRecord || this.isAudioSending) return

            this.isAudioSending = true
            try {
                const file = await this.persistAudioRecord(this.audioRecord)
                const messageType = await ipc.getMessgeTypeSetting()
                this.$emit('send-message', {
                    content: '',
                    files: [file],
                    replyMessage: this.messageReply,
                    messageType,
                })
                this.audioDialogVisible = false
                this.clearAudioRecord()
                this.resetMessage(true)
            } catch (error) {
                console.error('Failed to save recording:', error)
                this.$message.error('录音保存失败，无法发送语音')
            } finally {
                this.isAudioSending = false
            }
        },
        clearAudioRecord() {
            const recordUrl = this.audioRecord?.url
            const previewUrl = this.audioRecordUrl
            const recorder = this.audioRecorder
            this.resetAudioSession(this.audioPreviewSession)
            this.audioRecord = null
            this.audioRecordUrl = ''
            if (recorder?.clearRecords) recorder.clearRecords()
            else if (recordUrl) URL.revokeObjectURL(recordUrl)
            if (previewUrl && previewUrl !== recordUrl) URL.revokeObjectURL(previewUrl)
        },
        handleAudioRecordError(error) {
            if (error) console.error('Microphone access failed:', error)
            this.stopAudioDurationTimer()
            this.isAudioStarting = false
            this.isAudioRecording = false
            this.isAudioSending = false
            this.audioDialogVisible = false
            this.clearAudioRecord()
            this.$message.error('无法访问麦克风，请检查麦克风权限')
        },
        handleAudioDialogClose() {
            if (this.isAudioStarting || this.isAudioRecording) this.audioRecorder?.cancel?.()
            this.stopAudioDurationTimer()
            this.isAudioStarting = false
            this.isAudioRecording = false
            this.audioDialogVisible = false
            this.clearAudioRecord()
        },
        async persistAudioRecord(record) {
            const recordsDir = path.join(await ipc.getStorePath(), 'records')
            await fs.promises.mkdir(recordsDir, { recursive: true })

            const filename = `record-${Date.now()}.wav`
            const filePath = path.join(recordsDir, filename)
            const buffer = Buffer.from(await record.blob.arrayBuffer())
            await fs.promises.writeFile(filePath, buffer)

            return {
                blob: record.blob,
                name: filename,
                size: buffer.length,
                type: 'audio/wav',
                extension: 'wav',
                path: filePath,
                localUrl: record.url,
            }
        },
        disposeAudioRecorder() {
            this.stopAudioDurationTimer()
            this.audioDialogVisible = false
            this.clearAudioRecord()

            const recorder = this.audioRecorder
            if (recorder) {
                try {
                    if (typeof recorder.dispose === 'function') {
                        recorder.dispose()
                    } else if (typeof recorder.cancel === 'function') {
                        recorder.cancel()
                    } else {
                        recorder.stream?.getTracks().forEach((track) => track.stop())
                        recorder.input?.disconnect()
                        recorder.processor?.disconnect()
                        recorder.context?.close()
                    }
                } catch (error) {
                    console.warn('Failed to dispose audio recorder:', error)
                }
            }
            this.audioRecorder = null
            this.isAudioStarting = false
            this.isAudioRecording = false
            this.isAudioSending = false
        },
        getMessageText() {
            return this.$refs.roomTextarea?.value || ''
        },
        persistMessageDraft() {
            try {
                if (this.pendingMessageDraft) localStorage.setItem(messageDraftStorageKey, this.pendingMessageDraft)
                else localStorage.removeItem(messageDraftStorageKey)
            } catch (error) {
                console.warn('Failed to save message draft:', error)
            }
        },
        saveMessageDraft(message, immediate = false) {
            if (this.$route.name === 'history-page' || this.$route.name === 'member-history-page') return

            this.pendingMessageDraft = message == null ? '' : String(message)
            if (immediate) {
                if (this.messageDraftSaveTimer) {
                    this.lifecycleScope.cancelTimeout(this.messageDraftSaveTimer)
                    this.messageDraftSaveTimer = null
                }
                this.persistMessageDraft()
                return
            }

            if (this.messageDraftSaveTimer) return
            this.messageDraftSaveTimer = this.lifecycleScope.timeout(() => {
                this.messageDraftSaveTimer = null
                this.persistMessageDraft()
            }, messageDraftThrottleMs)
        },
        restoreMessageDraft() {
            if (this.$route.name === 'history-page' || this.$route.name === 'member-history-page') return

            try {
                const draft = localStorage.getItem(messageDraftStorageKey)
                if (!draft || this.getMessageText()) return

                this.setMessageText(draft, false)
            } catch (error) {
                console.warn('Failed to restore message draft:', error)
            }
        },
        setMessageText(message, saveDraft = true) {
            const textarea = this.$refs.roomTextarea
            if (!textarea) return

            textarea.value = message == null ? '' : String(message)
            if (saveDraft) this.saveMessageDraft(textarea.value, !textarea.value)
            this.updateMessageEmptyState(textarea.value)
            this.scheduleTextareaResize()
        },
        scheduleTextareaResize() {
            if (this.textareaResizeScheduled) return
            this.textareaResizeScheduled = true
            this.$nextTick(() => {
                if (!this.textareaResizeScheduled) return
                const frame = this.lifecycleScope.animationFrame(() => {
                    this.textareaResizeScheduled = false
                    this.resizeTextarea()
                })
                if (frame === null) this.textareaResizeScheduled = false
            })
        },
        appendMessageText(message) {
            this.setMessageText(this.getMessageText() + message)
        },
        updateMessageEmptyState(message = this.getMessageText()) {
            const isEmpty = !this.files.length && !message.trim()
            if (isEmpty !== this.isMessageEmpty) this.isMessageEmpty = isEmpty
        },
        onTextareaKeydown(event) {
            if (event.isComposing) return

            if (event.key === 'Enter') {
                this.onEnterKeydown(event)
            } else if (event.key === 'ArrowUp') {
                if (event.ctrlKey) {
                    // Ctrl + ↑ 选择上一条消息进行回复
                    event.preventDefault()
                    this.moveReplySelection(-1)
                } else if (!this.getMessageText()) {
                    // 编辑重发上一条消息
                    event.preventDefault()
                    this.editLastOwnMessage()
                }
            } else if (event.key === 'ArrowDown' && event.ctrlKey) {
                // Ctrl + ↓ 选择下一条消息进行回复
                event.preventDefault()
                this.moveReplySelection(1)
            } else if (event.key === 'e' && event.ctrlKey) {
                // 快捷表情选择
                this.isQuickFaceOn = true
                this.$nextTick(() => this.$refs.quickface.focus())
            } else if (event.key === 'n' && event.ctrlKey && this.room.roomId < 0) {
                // 快捷 at 选择
                this.isQuickAtOn = true
                this.$nextTick(() => this.$refs.quickat.focus())
            }
        },
        onEnterKeydown(event) {
            const shouldSend =
                (keyToSendMessage === 'Enter' && !event.ctrlKey && !event.shiftKey) ||
                (keyToSendMessage === 'CtrlEnter' && event.ctrlKey) ||
                (keyToSendMessage === 'ShiftEnter' && !event.ctrlKey && event.shiftKey)

            if (shouldSend) {
                event.preventDefault()
                this.sendMessage()
                return
            }

            const shouldInsertLineBreak =
                event.ctrlKey && (keyToSendMessage === 'Enter' || keyToSendMessage === 'ShiftEnter')
            if (shouldInsertLineBreak) {
                event.preventDefault()
                this.useMessageContent('\n')
                this.onChangeInput()
            }
        },
        moveReplySelection(direction) {
            if (direction > 0 && !this.messageReply) return

            const messages = this.messages.filter((message) => !message.system && !message.flash)
            if (!messages.length) return

            if (!this.messageReply) {
                // 如果当前没有回复消息，选择最后一条消息
                this.messageReply = messages[messages.length - 1]
            } else {
                // 如果已经有回复消息，找到当前消息的位置，向前切换
                const currentIndex = messages.findIndex((message) => message._id === this.messageReply._id)
                if (currentIndex === -1) {
                    if (direction < 0) {
                        this.$nextTick(() => this.highlightMessage(this.messageReply._id))
                    }
                    this.focusTextarea()
                    return
                }

                const nextIndex = currentIndex + direction
                if (nextIndex >= 0 && nextIndex < messages.length) {
                    this.messageReply = messages[nextIndex]
                } else if (direction > 0 && currentIndex === messages.length - 1) {
                    this.messageReply = null
                }
            }

            if (this.messageReply) {
                this.$nextTick(() => this.highlightMessage(this.messageReply._id))
            }
            this.focusTextarea()
        },
        editLastOwnMessage() {
            const ownMessages = this.messages.filter((message) => message.senderId === this.currentUserId)
            if (!ownMessages.length) return

            const lastMessage = ownMessages[ownMessages.length - 1]
            if (lastMessage.file && isImageFile(lastMessage.file)) {
                this.onPasteGif(lastMessage.file.url)
            } else if (lastMessage.file) {
                return
            }

            this.messageReply = lastMessage.replyMessage
            this.setMessageText(lastMessage.content)
            this.$nextTick(() => {
                const end = this.getMessageText().length
                this.$refs.roomTextarea.setSelectionRange(end, end)
            })
            this.editAndResend = lastMessage._id
        },
        getAudioSession(message) {
            if (!message || !message._id || !message.file || !isAudioFile(message.file)) return null
            if (message.file.name === 'decoding' || message.file.url === 'decoding') return null
            if (!this.audioSessions[message._id]) {
                this.$set(this.audioSessions, message._id, {
                    audio: new Audio(),
                })
            }
            return this.audioSessions[message._id]
        },
        resetAudioSession(session) {
            const audio = session?.audio
            if (!audio) return
            audio.pause()
            audio.removeAttribute('src')
            audio.load()
        },
        clearAudioSessions() {
            Object.values(this.audioSessions).forEach((session) => this.resetAudioSession(session))
            this.audioSessions = {}
        },
        sendForward(target, name, multi = true, anonymous = false) {
            const isJSON = (str) => {
                try {
                    if (typeof JSON.parse(str) == 'object') return true
                } catch (e) {}
                return false
            }
            if (this.msgsToForward.length <= 0) {
                console.log('No Message Selected.')
                return
            }
            const ForwardMessages = []
            const dm = target > 0

            this.messages.forEach((message) => {
                this.msgsToForward.forEach((msgId) => {
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
                    id: msg._id,
                    consistent: true,
                    bubble_id: msg.bubble_id,
                }
                if (msg) {
                    let content = msg.content
                    const orderedParts = getOrderedMessageParts(msg)
                    const forwardedImageIndexes = new Set()
                    singleMessage.user_id = msg.senderId
                    if (msg.replyMessage) {
                        singleMessage.message.push({
                            type: 'reply',
                            data: {
                                id: msg.replyMessage._id,
                                text: msg.replyMessage.content,
                            },
                        })
                    }
                    if (content || orderedParts) {
                        const messageParts = orderedParts || [{ type: 'text', content }]
                        for (const messagePart of messageParts) {
                            if (messagePart.type === 'image') {
                                const file = messagePart.file
                                forwardedImageIndexes.add(messagePart.fileIndex)
                                singleMessage.message.push({
                                    type: 'image',
                                    data: {
                                        file: file.url.startsWith('data:image')
                                            ? 'base64://' + file.url.replace(/^data:.+;base64,/, '')
                                            : file.url,
                                        type: 'image',
                                    },
                                })
                                continue
                            }

                            let partContent = messagePart.content
                            const icalinguaAtRegex = /<IcalinguaAt qq=\d+>([^<]*)<\/IcalinguaAt>/
                            while (icalinguaAtRegex.test(partContent)) {
                                const icalinguaAt = icalinguaAtRegex.exec(partContent)
                                partContent = partContent.replace(icalinguaAt[0], decodeURIComponent(icalinguaAt[1]))
                            }

                            const FACE_REGEX = /\[Face: (\d+)]/
                            const parts = []
                            while (FACE_REGEX.test(partContent)) {
                                const exec = FACE_REGEX.exec(partContent)
                                const index = exec.index
                                const before = partContent.substr(0, index)
                                const text = exec[0]
                                partContent = partContent.substr(index + text.length)
                                before && parts.push(before)
                                parts.push(text)
                            }
                            parts.push(partContent)
                            for (const part of parts) {
                                const isFace = FACE_REGEX.test(part)
                                if (isFace) {
                                    const faceId = FACE_REGEX.exec(part)[1]
                                    singleMessage.message.push({
                                        type: 'face',
                                        data: {
                                            id: Number.parseInt(faceId, 10),
                                        },
                                    })
                                } else if (part) {
                                    singleMessage.message.push({
                                        type: 'text',
                                        data: {
                                            text: part,
                                        },
                                    })
                                }
                            }
                        }
                    }
                    if (msg.files) {
                        msg.files.forEach((file, fileIndex) => {
                            if (forwardedImageIndexes.has(fileIndex)) return
                            if (file.type.startsWith('image/')) {
                                singleMessage.message.push({
                                    type: 'image',
                                    data: {
                                        file: file.url.startsWith('data:image')
                                            ? 'base64://' + file.url.replace(/^data:.+;base64,/, '')
                                            : file.url,
                                        type: 'image',
                                    },
                                })
                            } else if (file.name === file.url && file.type.toLowerCase().includes('audio/')) {
                                singleMessage.message.push({
                                    type: 'record',
                                    data: {
                                        file: file.fid,
                                    },
                                })
                                if (multi) {
                                    singleMessage.message.push({
                                        type: 'text',
                                        data: {
                                            text: '[语音] 语音无法合并转发',
                                        },
                                    })
                                }
                            } else {
                                singleMessage.message.push({
                                    type: 'text',
                                    data: {
                                        text: ' 该文件不支持转发',
                                    },
                                })
                            }
                        })
                    }
                    if (msg.code) {
                        if (isJSON(msg.code)) {
                            let jsonCode = msg.code
                            const jsonObj = JSON.parse(msg.code)
                            if (jsonObj.app === 'com.tencent.multimsg') {
                                const extra = jsonObj.extra
                                if (typeof extra !== 'string') {
                                    let resId, fileName
                                    try {
                                        resId = jsonObj.meta.detail.resid
                                        fileName = jsonObj.meta.detail.uniseq
                                    } catch (e) {
                                        console.error(e)
                                    }
                                    if (resId && fileName) jsonObj.extra = `{"tsum":1,"filename":"${fileName}"}`
                                    jsonCode = JSON.stringify(jsonObj)
                                }
                            }
                            singleMessage.message = [{ type: 'json', data: { data: jsonCode } }]
                        } else {
                            singleMessage.message = [{ type: 'xml', data: { data: msg.code } }]
                        }
                    }
                    const idReg =
                        content.match(/\[QLottie: (\d+)\,(\d+)\]/) || content.match(/\[QLottie: (\d+)\,(\d+)\,(\d+)\]/)
                    if (idReg && content === idReg[0]) {
                        singleMessage.message = [
                            {
                                type: 'face',
                                data: {
                                    id: parseInt(idReg[2]),
                                    qlottie: idReg[1],
                                    extra: idReg[3] ? JSON.stringify({ lottieType: 2, resultId: idReg[3] }) : undefined,
                                },
                            },
                        ]
                    }
                    singleMessage.nickname = msg.senderId !== this.account ? msg.username : this.username
                    singleMessage.time = Math.floor(msg.time / 1000)
                    if (anonymous) {
                        singleMessage.user_id = 1094950020
                        singleMessage.nickname = 'QQ用户'
                        if (singleMessage.bubble_id) singleMessage.bubble_id = -1
                    }
                    messagesToSend.push(singleMessage)
                }
            })
            const origin = parseInt(String(this.roomId))
            this.$emit('start-chat', target, name)

            if (!multi) {
                messagesToSend.forEach((msg, index) => {
                    console.log(msg.message)
                    this.lifecycleScope.timeout(
                        () => {
                            this.$emit('send-message', {
                                roomId: target,
                                content: JSON.stringify(msg.message),
                                messageType: 'raw',
                            })
                        },
                        (index + 1) * 1000,
                    )
                })
            } else {
                if (origin < 0) {
                    ipc.makeForward(messagesToSend, dm, -origin, target)
                } else {
                    ipc.makeForward(messagesToSend, dm, undefined, target)
                }
            }
            this.closeForwardPanel()
        },
        closeForwardPanel() {
            this.showForwardPanel = false
            this.msgsToForward = []
            console.log('closeForwardPanel')
        },
        addmsgToForward(messageId) {
            if (!this.selectedMessageIds.has(messageId)) {
                this.msgsToForward = [...this.msgsToForward, messageId]
            }
            console.log('addmsgToForward')
        },
        delmsgToForward(messageId) {
            this.msgsToForward = this.msgsToForward.filter((e) => e !== messageId)
            if (this.msgsToForward.length === 0) {
                this.closeForwardPanel()
            }
            console.log('delmsgToForward')
        },
        highlightMessage(messageId) {
            // 高亮指定的消息
            const message = document.getElementById(messageId)
            if (message) {
                message.scrollIntoView({ behavior: 'smooth', block: 'center' })
                message.parentElement.style = 'background: var(--chat-message-bg-color-reply)'
                this.lifecycleScope.timeout(() => {
                    message.parentElement.style = ''
                }, 200)
            }
        },
        scrollToMessage(messageId, autoLoad = false, isRetry = false) {
            this.cancelQueuedScrollToBottom()
            const targetMessageId = String(messageId)
            let judgeSameMessage = () => false
            const parsed = Buffer.from(targetMessageId, 'base64')
            let messageSeq = 0
            try {
                if (parsed.length === 21) {
                    //group
                    messageSeq = parsed.readUInt32BE(8)
                } else if (parsed.length === 17) {
                    //c2c
                    messageSeq = parsed.readUInt32BE(4)
                }
            } catch (e) {}
            if (this.$route.name === 'history-page' || this.$route.name === 'member-history-page') {
                judgeSameMessage = (a) => {
                    const seqA = Number(String(a).split('|')[1])
                    if (seqA !== messageSeq) return false
                    return true
                }
            } else {
                const parsedB = parsed
                judgeSameMessage = (a) => {
                    //shitcode?
                    if (String(a) === targetMessageId) return true
                    try {
                        const parsedA = Buffer.from(String(a), 'base64')
                        if (this.roomId < 0) {
                            // 群消息 ID 格式: | groupId(0) | senderId(4) | seq(8) | random(12) | time(16) | pktnum(20) |
                            // 如果 senderId 或 time 为 0（milky 适配器），则跳过这些字段的比较
                            const senderIdIsZero = parsedB.readUInt32BE(4) === 0
                            const timeIsZero = parsedB.readUInt32BE(16) === 0
                            for (let i = 0; i <= 16; i += 4) {
                                if (i === 12) continue // 跳过 random 字段
                                if (i === 4 && senderIdIsZero) continue // senderId 为 0 时跳过
                                if (i === 16 && timeIsZero) continue // time 为 0 时跳过
                                if (parsedA.readUInt32BE(i) !== parsedB.readUInt32BE(i)) return false
                            }
                            if (parsedA.readUInt8(20) !== parsedB.readUInt8(20)) return false
                        } else {
                            // 私聊消息 ID 格式: | peerId(0) | seq(4) | random(8) | time(12) | flag(16) |
                            // 如果 time 为 0（milky 适配器），则跳过 time 字段的比较
                            const timeIsZero = parsedB.readUInt32BE(12) === 0
                            for (let i = 0; i <= 12; i += 4) {
                                if (i === 8) continue // 跳过 random 字段
                                if (i === 12 && timeIsZero) continue // time 为 0 时跳过
                                if (parsedA.readUInt32BE(i) !== parsedB.readUInt32BE(i)) return false
                            }
                            if (parsedA.readUInt8(16) !== parsedB.readUInt8(16)) return false
                        }
                        return true
                    } catch (e) {}
                }
            }
            const message = document.getElementById(targetMessageId)
            if (message) {
                message.scrollIntoView()
                message.parentElement.style = 'background: var(--chat-message-bg-color-reply)'
                this.lifecycleScope.timeout(() => {
                    message.parentElement.style = ''
                }, 3000)
                return true
            } else {
                const index = this.messages.findIndex((e) => judgeSameMessage(e._id))
                if (index !== -1) {
                    // 将目标消息放在视口中心位置
                    const halfViewport = Math.floor(this.maxViewportLength / 2)
                    let head = Math.max(0, index - halfViewport)
                    let tail = Math.min(head + this.maxViewportLength, this.messages.length)
                    // 修正头部确保视口大小一致
                    if (tail - head < this.maxViewportLength) {
                        head = Math.max(0, tail - this.maxViewportLength)
                    }
                    if (this.optimizeMethod !== 'none') {
                        this.visibleViewport.head = head
                        this.visibleViewport.tail = tail
                    }
                    this.$nextTick(() => {
                        const el = document.getElementById(this.messages[index]._id)
                        if (el) {
                            el.scrollIntoView()
                            el.parentElement.style = 'background: var(--chat-message-bg-color-reply)'
                            this.lifecycleScope.timeout(() => {
                                el.parentElement.style = ''
                            }, 3000)
                        }
                    })
                    return true
                }
            }

            // 回复消息未找到时，由外层先尝试加载附近历史，再按需切换到稳定的中间窗口。
            if (autoLoad && !isRetry) {
                if (!(this.$route.name === 'history-page' || this.$route.name === 'member-history-page')) {
                    this.$emit('locate-message', messageId)
                    return false
                }
            }

            if (!isRetry) {
                this.$message.error('被回复的消息太远啦')
            }
            return false
        },
        onMediaLoad() {
            let height = this.$refs.mediaFile.clientHeight
            let width = 0
            if (height < 30) {
                height = 30
                width = this.$refs.mediaFile.clientWidth
            }
            height -= 10
            width = width || Math.floor((height * this.$refs.mediaFile.clientWidth) / this.$refs.mediaFile.clientHeight)
            if (width < 30) width = 30

            this.mediaDimensions = {
                height: height,
                width: width + 26,
            }
        },
        resetMessage(disableMobileFocus = null, editFile = null) {
            this.$emit('typing-message', null)

            if (editFile) {
                this.files = []
                this.imageFiles = []
                this.videoFiles = []
                this.setMessageText('')
                return
            }

            this.resetTextareaSize()
            this.setMessageText('')
            this.editedMessage = {}
            this.messageReply = null
            this.files = []
            this.mediaDimensions = null
            this.imageFiles = []
            this.videoFiles = []
            this.emojiOpened = false
            this.editAndResend = false
            this.preventKeyboardFromClosing()
            this.lifecycleScope.timeout(() => this.focusTextarea(disableMobileFocus), 0)
        },
        async paste() {
            this.appendMessageText(await navigator.clipboard.readText())
            const read = await navigator.clipboard.read()
            console.log(read)
            if (!read[0]) return
            const type = read[0].types.find((it) => it.startsWith('image/'))
            if (!type) return

            const blob = await read[0].getType(type)
            const url = URL.createObjectURL(blob)
            this.imageFiles.push(url)
            this.files.push({
                name: '粘贴的图片',
                type: type,
                url: url,
                blob,
            })
            this.focusTextarea()
        },
        resetMediaFile() {
            this.mediaDimensions = null
            this.imageFiles = []
            this.videoFiles = []
            this.editedMessage.file = null
            this.files = []
            this.focusTextarea()
            this.scheduleTextareaResize()
        },
        removeImage(idx) {
            this.imageFiles.splice(idx, 1)
            this.files.splice(idx, 1)
            if (!this.imageFiles.length && !this.files.length) {
                this.resetMediaFile()
            }
        },
        onImageListWheel(e) {
            const el = e.currentTarget
            el.scrollLeft += e.deltaY
        },
        resetTextareaSize() {
            if (!this.$refs.roomTextarea) return
            this.$refs.roomTextarea.style.height = '20px'
        },
        useMessageContent(content) {
            const textarea = this.$refs.roomTextarea
            const { selectionStart, selectionEnd } = textarea
            const message = this.getMessageText()
            this.setMessageText(message.slice(0, selectionStart) + content + message.slice(selectionEnd))
            const newStart = selectionStart + content.length
            this.$nextTick(() => textarea.setSelectionRange(newStart, newStart))
        },
        focusTextarea(disableMobileFocus) {
            if (detectMobile() && disableMobileFocus) return
            if (!this.$refs.roomTextarea) return
            this.$refs.roomTextarea.focus()
        },
        preventKeyboardFromClosing() {
            if (this.keepKeyboardOpen) this.focusTextarea()
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
            this.lifecycleScope.timeout(() => this.focusTextarea(), 0)
        },
        closeQuickAt() {
            this.isQuickAtOn = false
            this.useAtKey = false
            this.focusTextarea()
        },
        useQuickAt(id, name) {
            this.isQuickAtOn = false
            if (typeof id === 'number') {
                const atName = name || String(id)
                const atText = `@${atName}`
                if (id !== 0 && atName !== '全体成员') {
                    ipc.pushAtCache({
                        text: atText,
                        id: id,
                    })
                } else if (id === 0 && name === '全体成员') {
                    ipc.pushAtCache({
                        id: 'all',
                        text: '@全体成员',
                    })
                }
                this.useMessageContent((this.useAtKey ? atName : atText) + ' ')
            }
            this.useAtKey = false
            this.lifecycleScope.timeout(() => this.focusTextarea(), 0)
        },
        nomatchQuickAt(search) {
            if (!this.useAtKey) return
            this.isQuickAtOn = false
            this.useAtKey = false
            this.useMessageContent(search)
            this.lifecycleScope.timeout(() => this.focusTextarea(), 0)
        },
        async sendMessage() {
            const message = this.getMessageText()
            this.setMessageText('')

            if ((!this.files || !this.files.length) && !message) return

            const messageType = await ipc.getMessgeTypeSetting()

            if (messageType === 'raw') {
                const { action } = await this.$confirm('你确定要发送 OICQ 原始消息吗？？', '提示', {
                    confirmButtonText: '确定',
                    cancelButtonText: '取消',
                    type: 'warning',
                })
                if (action === 'cancel') return
            }

            this.$emit('send-message', {
                content: message,
                files: this.files,
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
            const message = this.getMessageText().trim()

            if ((!this.files || !this.files.length) && !message) return

            if (!debugmode && message.match(/serviceID[\s]*?=[\s]*?('|")(13|60|76|83)('|")/g)) return

            const map = [
                '73686f7773656e646572',
                '636f6d2e74656e63656e742e6175746f7265706c79',
                '6a712e71712e636f6d',
                '76696577526563656970744d657373616765',
                '636f6d2e74656e63656e742e6d6f62696c6571712e72656164696e67',
                '74692e71712e636f6d',
            ]
            const mode = Buffer.from('aGV4', 'base64').toString()
            if (!debugmode) {
                for (let i of map) {
                    if (message.toLowerCase().includes(Buffer.from(i, mode).toString())) {
                        this.resetMessage(true)
                        return
                    }
                }
            }

            const msgType = isJSON(message) ? 'json' : 'xml'

            this.$emit('send-message', {
                content: message,
                file: this.files && this.files.length ? this.files[0] : null,
                replyMessage: this.messageReply,
                resend: this.editAndResend,
                messageType: msgType,
            })

            this.resetMessage(true)
        },
        loadMoreMessages() {
            this.lifecycleScope.timeout(
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
            if (e && e.path && e.path[1].classList.contains('el-avatar')) return // prevent avatar dblclick
            if (message.system || message.flash) return
            this.messageReply = message
            this.focusTextarea()
        },
        useMessageInlineCommand(message, inlineCommand) {
            const senderId = Number(message.senderId)
            const senderName = message.username || String(message.senderId)
            const atText = `@${senderName}`
            const command = inlineCommand.command.trimEnd()
            if (!command) return

            if (Number.isFinite(senderId)) {
                ipc.pushAtCache({
                    id: senderId,
                    text: atText,
                })
            }
            this.setMessageText(`${atText} ${command} `)
            if (inlineCommand.reply) this.replyMessage(message)
            else this.focusTextarea()

            this.$nextTick(() => {
                const textarea = this.$refs.roomTextarea
                const end = this.getMessageText().length
                textarea?.setSelectionRange(end, end)
            })
        },
        editMessage(message) {
            this.resetMessage()
            this.editedMessage = { ...message }

            if (message.file) {
                this.files = [message.file]

                if (isImageFile(message.file)) {
                    this.imageFiles = [message.file.url]
                    this.lifecycleScope.timeout(() => this.onMediaLoad(), 0)
                } else if (isVideoFile(message.file)) {
                    this.videoFiles = [message.file.url]
                    this.lifecycleScope.timeout(() => this.onMediaLoad(), 50)
                }
            }

            this.setMessageText(message.content)
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
            if (this.canLoadAfter) {
                this.$emit('return-to-latest')
                return
            }
            this.queueScrollToBottom(true)
        },
        cancelQueuedScrollToBottom() {
            this.scrollToBottomGeneration++
            if (this.scrollToBottomTimer) {
                this.lifecycleScope.cancelAnimationFrame(this.scrollToBottomTimer)
                this.scrollToBottomTimer = null
            }
        },
        queueScrollToBottom(smooth = false) {
            const element = this.$refs.scrollContainer
            if (!element) return
            this.loadingMessages = false
            this.cancelQueuedScrollToBottom()
            const generation = this.scrollToBottomGeneration
            if (this.optimizeMethod !== 'none') {
                this.visibleViewport.tail = this.messages.length
                this.visibleViewport.head = Math.max(this.messages.length - this.maxViewportLength, 0)
            }
            this.scrollMessagesCount = 0
            this.scrollIcon = false
            this.$nextTick(() => {
                if (generation !== this.scrollToBottomGeneration) return
                this.scrollToBottomTimer = this.lifecycleScope.animationFrame(() => {
                    if (generation !== this.scrollToBottomGeneration) return
                    this.scrollToBottomTimer = null
                    element.scrollTo({ top: element.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
                })
            })
        },
        async scrollToLastMessage() {
            const lastUnreadCount = this.lastUnreadCount
            if (lastUnreadCount === 0) return
            this.$emit('clear-last-unread-count')
            this.$emit('locate-unread-message', lastUnreadCount)
        },
        async scrollToLastAtMessage() {
            this.$emit('clear-last-unread-at')
        },
        onChangeInput(event) {
            const message = event?.target?.value ?? this.getMessageText()
            this.keepKeyboardOpen = true
            this.saveMessageDraft(message, !message)
            this.updateMessageEmptyState(message)
            this.scheduleTextareaResize()
            this.$emit('typing-message', message)
            const selectionStart = this.$refs.roomTextarea.selectionStart
            if (
                this.room.roomId < 0 &&
                message.slice(selectionStart - 1, selectionStart) === '@' &&
                !event?.isComposing
            ) {
                this.useAtKey = true
                this.isQuickAtOn = true
                this.$nextTick(() => this.$refs.quickat.focus())
            }
        },
        resizeTextarea() {
            const el = this.$refs.roomTextarea

            if (!el) return

            const padding = window.getComputedStyle(el, null).getPropertyValue('padding-top').replace('px', '')

            el.style.height = 0
            el.style.height = el.scrollHeight - padding * 2 + 'px'
        },
        launchFilePicker(force) {
            if (force) {
                this.$refs.fileForce.value = ''
                this.$refs.fileForce.click()
                return
            }
            this.$refs.file.value = ''
            this.$refs.file.click()
        },
        async onFileChange(files, force = false) {
            this.fileDialog = true

            for (let i = 0; i < files.length; i++) {
                const file = files[i]
                let filePath = file.path
                if (!filePath && webUtils && webUtils.getPathForFile) {
                    console.log('Electron >= 32.0.0')
                    try {
                        filePath = webUtils.getPathForFile(file)
                    } catch (e) {
                        console.error(e)
                    }
                }
                const typeIndex = file.name.lastIndexOf('.')

                const fileObj = {
                    name: file.name.substring(0, typeIndex),
                    size: file.size,
                    type: file.type,
                    extension: file.name.substring(typeIndex + 1),
                    path: filePath,
                }
                const extension = fileObj.extension.toLowerCase()
                if (['slk', 'silk'].includes(extension)) {
                    fileObj.type = 'audio/silk'
                }
                if (['amr'].includes(extension)) {
                    fileObj.type = 'audio/amr'
                }
                if (['psd', 'svg'].includes(extension)) {
                    fileObj.type = ''
                }
                if (force) fileObj.type = ''

                const isImage = isImageFile(fileObj)
                const isVideo = isVideoFile(fileObj)
                const isAudio = isAudioFile(fileObj)
                const fileURL = filePath || (isImage || isVideo || isAudio ? URL.createObjectURL(file) : '')
                fileObj.localUrl = fileURL

                // File 本身就是惰性 Blob。仅图片和音频在发送阶段需要读取内容；
                // 普通文件与视频走路径上传，避免添加附件时把大文件完整读入渲染进程。
                if (isImage || isAudio) fileObj.blob = file
                this.files.push(fileObj)

                if (isImage) {
                    this.imageFiles.push(fileURL)
                } else if (isVideo) {
                    this.resetMediaFile()
                    this.files = [fileObj]
                    this.videoFiles.push(fileURL)
                    this.lifecycleScope.timeout(() => this.onMediaLoad(), 50)
                    break
                } else if (isAudio) {
                    this.resetMediaFile()
                    this.files = [fileObj]
                    this.videoFiles.push(fileURL)
                    this.lifecycleScope.timeout(() => this.onMediaLoad(), 50)
                    break
                } else {
                    this.resetMediaFile()
                    this.files = [fileObj]
                    this.setMessageText(file.name)
                    break
                }
            }

            this.lifecycleScope.timeout(() => {
                this.fileDialog = false
                this.focusTextarea()
            }, 500)
        },
        async onPasteGif(GifURL) {
            this.fileDialog = true

            const blobFile = await fetch(GifURL).then((res) => res.blob())
            const fileURL = URL.createObjectURL(blobFile)
            const typeIndex = GifURL.lastIndexOf('.')

            const fileObj = {
                blob: blobFile,
                name: GifURL.substring(0, typeIndex),
                size: blobFile.size,
                type: blobFile.type,
                extension: GifURL.substring(typeIndex + 1),
                localUrl: fileURL,
                path: GifURL,
            }

            this.files.push(fileObj)
            this.imageFiles.push(fileURL)
            this.lifecycleScope.timeout(() => {
                this.fileDialog = false
                this.focusTextarea()
            }, 500)
        },
        openFile({ message, action }) {
            this.$emit('open-file', { message, action, room: this.room })
        },
        textareaActionHandler() {
            this.$emit('textarea-action-handler', this.getMessageText())
        },
        msgctx(e, message) {
            const _message = Object.assign({}, message)
            delete _message.__v_skip
            const sect = window.getSelection().toString()
            ipc.popupMessageMenu(
                e,
                this.room,
                _message,
                sect,
                this.$route.name === 'history-page' || this.$route.name === 'member-history-page',
            )
        },
        avatarCtx(message, e) {
            const _message = Object.assign({}, message)
            delete _message.__v_skip
            ipc.popupAvatarMenu(_message, this.room, e)
        },
        containerScroll(e) {
            if (this.mouseSelecting) this.mouseSelectBounds = null
            if (this.onScrolling) {
                this.lifecycleScope.cancelTimeout(this.onScrolling)
                this.onScrolling = null
            }
            this.onScrolling = this.lifecycleScope.timeout(() => {
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
                    // 如果已经到达消息列表末尾且可以向后加载，触发加载更多
                    if (this.visibleViewport.tail >= this.messages.length && this.canLoadAfter) {
                        this.$emit('fetch-messages-after')
                    }
                }
                if (this.getTopScroll(e.target) <= 0) e.target.scrollTo({ top: 1 })
                if (this.getBottomScroll(e.target) <= 0 && this.visibleViewport.tail !== this.messages.length)
                    e.target.scrollTo({ top: e.target.scrollHeight - 1 - e.target.clientHeight })
            }, 24)
        },
        loadHeadMessages(infiniteState) {
            if (this.optimizeMethod !== 'infinite-loading') return
            this.lifecycleScope.timeout(
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
            if (this.loadingTailMessages) return
            this.visibleViewport.tail = Math.min(this.visibleViewport.tail + 10, this.messages.length)
            this.visibleViewport.head = Math.max(0, this.visibleViewport.tail - this.maxViewportLength)
            this.infiniteState.tail = infiniteState
            // 如果已经到达消息列表末尾且可以向后加载，触发加载更多
            if (this.visibleViewport.tail >= this.messages.length && this.canLoadAfter) {
                this.loadingTailMessages = true
                this.$emit('fetch-messages-after')
            } else if (this.visibleViewport.tail >= this.messages.length && !this.canLoadAfter) {
                // 真正到底了，没有更多可加载
                infiniteState.complete()
            } else {
                infiniteState.loaded()
            }
        },
        _loadMoreMessages(infiniteState) {
            this.lifecycleScope.timeout(
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
        roomMenu(e) {
            ipc.popupRoomMenu(this.room.roomId, e)
        },
        openGroupAnnouncements() {
            ipc.openGroupAnnouncements(this.room.roomId)
        },
        openGroupFiles() {
            ipc.openGroupFiles(this.room.roomId)
        },
        openGroupAlbum() {
            ipc.openGroupAlbum(this.room.roomId)
        },
        openGroupEssence() {
            ipc.openGroupEssence(this.room.roomId)
        },
        stickersMenu(e) {
            ipc.popupStickerMenu(e, false)
        },
        async updateGroupMembers() {
            const debugmode = await ipc.getDebugSetting()
            const { roomId } = this.room
            if (roomId < 0) {
                const group = await ipc.getGroup(-roomId)
                if (!group) {
                    // 退了的群获取不到成员数和成员列表
                    this.membersCount = 0
                    return
                }
                this.membersCount = group.member_count
                const gms = await ipc.getGroupMembers(-roomId)
                const ownerMembers = []
                const adminMembers = []
                const normalMembers = []
                for (const member of gms) {
                    if (member.role === 'owner') ownerMembers.push(member)
                    else if (member.role === 'admin') adminMembers.push(member)
                    else normalMembers.push(member)
                }
                const groupMembers = [...ownerMembers, ...adminMembers, ...normalMembers]
                if (roomId !== this.room.roomId) return
                const self = groupMembers.find((member) => member.user_id === this.currentUserId)
                if ((self && (self.role === 'owner' || self.role === 'admin')) || debugmode) {
                    groupMembers.unshift({
                        card: '全体成员',
                        nickname: '全体成员',
                        user_id: 0,
                    })
                }
                this.groupMembers = groupMembers
            } else this.membersCount = 0
        },
        refreshMouseSelectBounds() {
            const container = this.$refs.messagesContainer
            if (!container) {
                this.mouseSelectBounds = []
                return
            }

            this.mouseSelectBounds = [...container.querySelectorAll('.vac-message-box')]
                .map((msgBox) => {
                    const msgCard = msgBox.querySelector('.vac-message-card')
                    if (!msgCard) return null
                    const { x, y, width, height } = msgCard.getBoundingClientRect()
                    return {
                        id: msgBox.id,
                        x1: x,
                        y1: y,
                        x2: x + width,
                        y2: y + height,
                    }
                })
                .filter(Boolean)
        },
        updateMouseSelectAreaStyleImmediately() {
            const el = this.$refs.mouseSelectArea
            const area = this.mouseSelectArea
            if (!el || !area) return

            const ax1 = Math.min(area.x1, area.x2)
            const ax2 = Math.max(area.x1, area.x2)
            const ay1 = Math.min(area.y1, area.y2)
            const ay2 = Math.max(area.y1, area.y2)
            el.style.left = ax1 + 'px'
            el.style.top = ay1 + 'px'
            el.style.width = ax2 - ax1 + 'px'
            el.style.height = ay2 - ay1 + 'px'

            if (this.mouseSelectBounds === null) this.refreshMouseSelectBounds()
            const selectedIds = (this.mouseSelectBounds || [])
                .filter((bound) => !(ax2 < bound.x1 || bound.x2 < ax1 || ay2 < bound.y1 || bound.y2 < ay1))
                .map((bound) => bound.id)
            const currentIds = this.mouseSelectIds || []
            const selectionUnchanged =
                selectedIds.length === currentIds.length && selectedIds.every((id, index) => id === currentIds[index])
            if (selectionUnchanged) return

            const oldMouseSelectIds = new Set(currentIds)
            const nextForwardIds = (this.msgsToForward || []).filter((id) => !oldMouseSelectIds.has(id))
            const nextForwardIdSet = new Set(nextForwardIds)
            for (const id of selectedIds) {
                if (!nextForwardIdSet.has(id)) {
                    nextForwardIds.push(id)
                    nextForwardIdSet.add(id)
                }
            }

            this.msgsToForward = nextForwardIds
            this.mouseSelectIds = selectedIds
        },
        scheduleMouseSelectUpdate() {
            if (this.mouseSelectFrame !== null) return
            this.mouseSelectFrame = this.lifecycleScope.animationFrame(() => {
                this.mouseSelectFrame = null
                if (this.mouseSelecting) this.updateMouseSelectAreaStyleImmediately()
            })
        },
        flushMouseSelectUpdate() {
            if (this.mouseSelectFrame !== null) {
                this.lifecycleScope.cancelAnimationFrame(this.mouseSelectFrame)
                this.mouseSelectFrame = null
            }
            this.updateMouseSelectAreaStyleImmediately()
        },
        startMouseSelect(e) {
            if (this.$route.name === 'history-page' || this.$route.name === 'member-history-page') return
            if (this.mouseSelecting) return

            for (let el = e.target; el.className !== 'vac-messages-container'; el = el.parentElement) {
                if (el.className.includes && el.className.includes('vac-message-container')) return
            }

            this.mouseSelecting = true

            window.addEventListener('mousemove', this.continueMouseSelect)
            window.addEventListener('mouseup', this.endMouseSelect)

            const { pageX: x, pageY: y } = e
            this.mouseSelectArea = {
                x1: x,
                y1: y,
                x2: x,
                y2: y,
            }
            this.mouseSelectIds = []
            this.mouseSelectBounds = null

            this.updateMouseSelectAreaStyleImmediately()
        },
        continueMouseSelect(e) {
            if (!this.mouseSelecting) return

            const { pageX: x, pageY: y } = e

            this.mouseSelectArea.x2 = x
            this.mouseSelectArea.y2 = y

            this.scheduleMouseSelectUpdate()
        },
        endMouseSelect(e) {
            if (!this.mouseSelecting) return

            const { pageX: x, pageY: y } = e
            this.mouseSelectArea.x2 = x
            this.mouseSelectArea.y2 = y
            this.flushMouseSelectUpdate()

            this.mouseSelecting = false

            window.removeEventListener('mousemove', this.continueMouseSelect)
            window.removeEventListener('mouseup', this.endMouseSelect)

            if (this.mouseSelectIds.length) {
                this.showForwardPanel = true
            }
            this.mouseSelectBounds = null
        },
        async openImage(src) {
            if (this.imageFiles.length > 1) {
                ipcRenderer.send('openImage', src, false, [...this.imageFiles])
            } else {
                ipcRenderer.send('openImage', src, this.localImageViewerByDefault)
            }
        },
        async openMessageImage({ url, messageId, imageIndex }) {
            const messages = this.messages
            const { singleImageMode } = await ipc.getSettings()
            if (singleImageMode || this.localImageViewerByDefault) {
                ipcRenderer.send('openImage', url, this.localImageViewerByDefault)
                return
            }

            const images = []
            for (const message of messages) {
                if (message.files) {
                    for (let index = 0; index < message.files.length; index++) {
                        const file = message.files[index]
                        if (file.type && file.type.startsWith('image')) {
                            images.push(`${file.url}&message_id=${message._id}&img_index=${index}`)
                        }
                    }
                } else if (message.file && message.file.type && message.file.type.startsWith('image')) {
                    images.push(`${message.file.url}&message_id=${message._id}&img_index=0`)
                }
            }

            const imageUrl = `${url}&message_id=${messageId}&img_index=${imageIndex}`
            ipcRenderer.send('openImage', imageUrl, false, images)
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

.vac-empty-window-drag-region {
    -webkit-app-region: drag;
    user-select: none;
}

.vac-container-scroll {
    background: var(--chat-content-bg-color);
    flex: 1;
    overflow-y: auto;
    margin-top: 60px;
    -webkit-overflow-scrolling: touch;
}

.db-upgrade-banner {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 6px 12px;
    color: var(--chat-message-color);
    background: var(--chat-content-bg-color);
    background: color-mix(in srgb, var(--chat-content-bg-color) 82%, transparent);
    border-bottom: 1px solid var(--chat-message-divider-color, rgba(128, 128, 128, 0.25));

    .el-icon-loading {
        flex: 0 0 auto;
    }

    .db-upgrade-banner-message {
        flex: 0 1 auto;
        white-space: nowrap;
    }

    .el-progress {
        flex: 1 1 auto;
        min-width: 80px;
    }
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
    box-shadow:
        0 1px 1px -1px rgba(0, 0, 0, 0.2),
        0 1px 1px 0 rgba(0, 0, 0, 0.14),
        0 1px 2px 0 rgba(0, 0, 0, 0.12);
    display: flex;
    cursor: pointer;
    z-index: 10;

    svg {
        height: 25px;
        width: 25px;
    }
}

.vac-icon-last-at-message {
    position: absolute;
    top: 80px;
    right: 20px;
    padding: 8px;
    background: var(--chat-bg-scroll-icon);
    border-radius: 50%;
    box-shadow:
        0 1px 1px -1px rgba(0, 0, 0, 0.2),
        0 1px 1px 0 rgba(0, 0, 0, 0.14),
        0 1px 2px 0 rgba(0, 0, 0, 0.12);
    display: flex;
    cursor: pointer;
    z-index: 20;

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
    box-shadow:
        0 1px 1px -1px rgba(0, 0, 0, 0.2),
        0 1px 1px 0 rgba(0, 0, 0, 0.14),
        0 1px 2px 0 rgba(0, 0, 0, 0.12);
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

.vac-record-button {
    align-self: flex-end;
    flex: 0 0 auto;
}

.vac-record-button svg {
    width: 20px;
}

.vac-recording {
    color: var(--chat-color-primary, #f56c6c);
}

.vac-recording svg {
    fill: var(--chat-color-primary, #f56c6c) !important;
}

.vac-recording-pending {
    pointer-events: none;
    opacity: 0.6;
}

.vac-audio-dialog-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.vac-audio-dialog-status {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 22px;
    font-size: 14px;
}

.vac-audio-dialog-status strong {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
}

.vac-audio-dialog-hint {
    margin: 0;
    color: var(--panel-color-desc, #606266);
    font-size: 13px;
}

.vac-audio-recording-dot {
    display: inline-block;
    width: 9px;
    height: 9px;
    flex: 0 0 9px;
    border-radius: 50%;
    background: #f56c6c;
    box-shadow: 0 0 0 0 rgba(245, 108, 108, 0.45);
    animation: vac-audio-recording-pulse 1.4s infinite;
}

.vac-audio-preview {
    align-self: center;
    width: 100%;
    max-width: 300px;
    margin: 2px 0 4px;
}

@keyframes vac-audio-recording-pulse {
    0%,
    100% {
        box-shadow: 0 0 0 0 rgba(245, 108, 108, 0.45);
    }
    50% {
        box-shadow: 0 0 0 5px rgba(245, 108, 108, 0);
    }
}

.vac-textarea-outline {
    border: 1px solid var(--chat-border-color-input-selected);
    box-shadow: inset 0px 0px 0px 1px var(--chat-border-color-input-selected);
}

.vac-icon-textarea {
    display: flex;
    margin: 12px 0 10px 5px;
    align-items: flex-end;

    svg,
    .vac-wrapper {
        margin: 0 7px;
    }
}

.vac-media-container {
    position: absolute;
    max-width: 50%;
    left: 16px;
    top: 18px;
}

.vac-attached-images-bar {
    display: flex;
    align-items: center;
    padding: 6px 10px;
    border-top: var(--chat-border-style);
    background: var(--chat-footer-bg-color);
    gap: 4px;

    .vac-icon-reply {
        margin-left: 10px;

        svg {
            height: 20px;
            width: 20px;
        }
    }
}

.vac-attached-images-list {
    display: flex;
    flex-wrap: nowrap;
    gap: 6px;
    overflow-x: auto;
    flex: 1;
    min-width: 0;
    padding: 2px 0;
    scrollbar-width: thin;
}

.vac-attached-image-item {
    position: relative;
    flex-shrink: 0;
    width: 72px;
    height: 72px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--chat-border-style-color, rgba(0, 0, 0, 0.1));

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        cursor: pointer;
        display: block;
    }
}

.vac-attached-image-remove {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;

    svg {
        width: 10px;
        height: 10px;
        fill: #fff;
    }
}

.vac-attached-image-item:hover .vac-attached-image-remove {
    opacity: 1;
}

.vac-multi-images-preview {
    display: none;
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

.vac-mouse-select-area {
    position: fixed;
    z-index: 2;
    background: rgba(#c2dcf2, 0.5);
    border: 2px solid #c2dcf2;
    border-radius: 2px;
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
        margin: 6px 0 6px 5px;

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

.icon-fill * {
    fill: #1976d2 !important;
}
</style>
