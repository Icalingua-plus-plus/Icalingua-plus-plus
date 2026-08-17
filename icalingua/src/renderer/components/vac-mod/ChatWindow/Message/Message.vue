<template>
    <div>
        <div v-if="showDate" class="vac-card-info vac-card-date">
            {{ message.date }}
        </div>

        <div v-if="showNewMessagesDivider" class="vac-line-new">
            {{ textMessages.NEW_MESSAGES }}
        </div>

        <div v-if="message.system" class="vac-card-info vac-card-system">
            <template v-for="(part, index) in msgSystemParts">
                <span v-if="part.type === 'text'" :key="index">{{
                    usePanguJs ? panguSpacing(part.content) : part.content
                }}</span>
                <img
                    v-else-if="part.type === 'image'"
                    :key="index"
                    :src="message.files && message.files[part.content] ? message.files[part.content].url : ''"
                    style="max-width: 100%; max-height: 1.2em; transform: translateY(0.25em)"
                />
            </template>
        </div>

        <div
            v-else
            :id="message._id"
            class="vac-message-box"
            :class="{
                'vac-offset-current': message.senderId === currentUserId,
                'vac-message-box-lottie': lottie && !disableQLottie,
            }"
            @click="selectMessage"
        >
            <slot name="message" v-bind="{ message }">
                <div
                    class="vac-message-sender-avatar"
                    @click.right="$emit('avatar-ctx', $event)"
                    @dblclick.stop="$emit('poke')"
                    v-if="roomUsers.length > 2 && message.senderId !== currentUserId"
                >
                    <img
                        :src="tgLogo"
                        v-if="message.mirai && message.mirai.eqq.type === 'tg'"
                        style="
                            position: absolute;
                            right: -4px;
                            bottom: 5px;
                            object-fit: cover;
                            height: 18px;
                            width: 18px;
                            line-height: 18px;
                        "
                    />
                    <el-avatar size="medium" :src="avatar" />
                </div>
                <div
                    class="vac-message-container"
                    :class="{ 'vac-message-container-offset': messageOffset }"
                    @click.right="$emit('ctx', $event)"
                >
                    <div
                        class="vac-message-card"
                        :class="{
                            'vac-message-highlight': isMessageHover,
                            'vac-message-current': message.senderId === currentUserId,
                            'vac-message-deleted': message.deleted || message.hide,
                            'vac-message-markdown': message.markdown,
                            'vac-message-clickable': showForwardPanel,
                            'vac-message-selected': selected,
                        }"
                        :title="recallInfoText"
                        @mouseover="onHoverMessage"
                        @mouseleave="onLeaveMessage"
                    >
                        <div
                            v-if="roomUsers.length > 2 && message.senderId !== currentUserId"
                            class="vac-text-username"
                            :class="{
                                'vac-username-reply':
                                    ((!message.deleted && !message.hide) || message.reveal) && message.replyMessage,
                            }"
                            style="display: flex"
                        >
                            <span style="width: 100%">{{ message.username || message.senderId }}</span>
                            <span v-if="message.markdown" class="vac-text-markdown-badge">Markdown</span>
                            <span
                                v-show="
                                    message.role &&
                                    message.role !== 'member' &&
                                    !(message.mirai && message.mirai.eqq.type === 'tg')
                                "
                                style="margin-left: 10px"
                            >
                                {{ message.role }}
                            </span>
                            <span
                                v-show="message.title && !(message.mirai && message.mirai.eqq.type === 'tg')"
                                style="margin-left: 10px; min-width: fit-content"
                            >
                                {{ message.title }}
                            </span>
                        </div>

                        <message-reply
                            v-if="((!message.deleted && !message.hide) || message.reveal) && message.replyMessage"
                            :message="message"
                            :linkify="linkify"
                            :showForwardPanel="showForwardPanel"
                            :forward-res-id="forwardResId"
                            :hide-chat-image-by-default="hideChatImageByDefault"
                            :local-image-viewer-by-default="localImageViewerByDefault"
                            :usePanguJs="usePanguJs"
                            @open-forward="$emit('open-forward', $event)"
                            @scroll-to-message="$emit('scroll-to-message', $event)"
                        />

                        <div v-if="message.deleted && !message.reveal">
                            <slot name="deleted-icon">
                                <svg-icon name="deleted" class="vac-icon-deleted" />
                            </slot>
                            <span>{{ recallInfoText || textMessages.MESSAGE_DELETED }}</span>
                        </div>

                        <div v-else-if="message.hide && !message.reveal && !message.deleted">
                            <slot name="deleted-icon">
                                <svg-icon name="hide" class="vac-icon-hide" />
                            </slot>
                            <span>{{ textMessages.MESSAGE_HIDE }}</span>
                        </div>

                        <message-markdown
                            v-else-if="message.markdown"
                            :content="message.content"
                            :hide-chat-image-by-default="hideChatImageByDefault"
                            :local-image-viewer-by-default="localImageViewerByDefault"
                            :show-forward-panel="showForwardPanel"
                            @inline-command="$emit('inline-command', $event)"
                        />

                        <template v-else-if="orderedMessageParts">
                            <div v-for="part in orderedMessageParts" :key="part.key" class="vac-ordered-message-part">
                                <message-image
                                    v-if="part.type === 'image'"
                                    :current-user-id="currentUserId"
                                    :file="part.file"
                                    :flash="message.flash"
                                    :content="message.content"
                                    :text-formatting="textFormatting"
                                    :image-hover="imageHover"
                                    :showForwardPanel="showForwardPanel"
                                    :hide-chat-image-by-default="hideChatImageByDefault"
                                    :local-image-viewer-by-default="localImageViewerByDefault"
                                    :message-id="message._id"
                                    :image-index="part.fileIndex"
                                    @open-file="openFile"
                                    @open-image="$emit('open-image', $event)"
                                />
                                <format-message
                                    v-else
                                    :content="part.content"
                                    :text-formatting="textFormatting"
                                    :linkify="linkify"
                                    :showForwardPanel="showForwardPanel"
                                    :forward-res-id="forwardResId"
                                    :code="message.code"
                                    :disableQLottie="disableQLottie"
                                    :usePanguJs="usePanguJs"
                                    @open-forward="$emit('open-forward', $event)"
                                >
                                    <template #deleted-icon="data">
                                        <slot name="deleted-icon" v-bind="data" />
                                    </template>
                                </format-message>
                            </div>
                        </template>

                        <template v-else-if="isImage && message.files">
                            <message-image
                                v-for="(file, i) in message.files"
                                :key="i"
                                :current-user-id="currentUserId"
                                :file="file"
                                :flash="message.flash"
                                :content="message.content"
                                :text-formatting="textFormatting"
                                :image-hover="imageHover"
                                :showForwardPanel="showForwardPanel"
                                :hide-chat-image-by-default="hideChatImageByDefault"
                                :local-image-viewer-by-default="localImageViewerByDefault"
                                :message-id="message._id"
                                :image-index="i"
                                @open-file="openFile"
                                @open-image="$emit('open-image', $event)"
                            />
                        </template>

                        <message-image
                            v-else-if="isImage"
                            :current-user-id="currentUserId"
                            :file="message.file"
                            :flash="message.flash"
                            :content="message.content"
                            :text-formatting="textFormatting"
                            :image-hover="imageHover"
                            :showForwardPanel="showForwardPanel"
                            :hide-chat-image-by-default="hideChatImageByDefault"
                            :local-image-viewer-by-default="localImageViewerByDefault"
                            :message-id="message._id"
                            :image-index="0"
                            @open-file="openFile"
                            @open-image="$emit('open-image', $event)"
                        />

                        <message-video
                            v-else-if="isVideo"
                            :isHidden="hideChatVideoByDefault"
                            :url="message.file.url"
                        ></message-video>

                        <div v-else-if="isAudio" class="vac-audio-message">
                            <div v-if="isAudioDecoding" class="vac-audio-decoding" title="语音解码中">
                                <div class="vac-audio-decoding-icon" aria-hidden="true">
                                    <svg viewBox="0 0 24 24" width="18" height="18">
                                        <path
                                            fill="currentColor"
                                            d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zm-7 8a1 1 0 0 1 2 0 5 5 0 0 0 10 0 1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V20h2a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2h2v-2.07A7 7 0 0 1 5 11z"
                                        />
                                    </svg>
                                </div>
                                <div class="vac-audio-decoding-wave" aria-hidden="true">
                                    <span></span>
                                    <span></span>
                                    <span></span>
                                    <span></span>
                                    <span></span>
                                </div>
                                <div class="vac-audio-decoding-text">
                                    <span class="vac-audio-decoding-title">语音解码中</span>
                                    <span class="vac-audio-decoding-dots">
                                        <i></i>
                                        <i></i>
                                        <i></i>
                                    </span>
                                </div>
                            </div>
                            <message-audio v-else :src="audioPath" :audio-session="audioSession" />
                        </div>

                        <div v-else-if="message.file" class="vac-file-message">
                            <div class="vac-svg-button vac-icon-file" @click.stop="openFile('download')">
                                <slot name="document-icon">
                                    <svg-icon name="document" />
                                </slot>
                            </div>
                        </div>

                        <LottieAnimation
                            v-else-if="lottie && !disableQLottie"
                            :path="lottie"
                            :pathResult="lottieResult"
                            :height="250"
                            :width="250"
                            :autoPlay="true"
                        />

                        <format-message
                            v-if="
                                ((!message.deleted && !message.hide) || message.reveal) &&
                                !message.markdown &&
                                !orderedMessageParts &&
                                !(lottie && message.content.startsWith('[QLottie') && !disableQLottie)
                            "
                            :content="message.content"
                            :text-formatting="textFormatting"
                            :linkify="linkify"
                            :showForwardPanel="showForwardPanel"
                            :forward-res-id="forwardResId"
                            :code="message.code"
                            :disableQLottie="disableQLottie"
                            :usePanguJs="usePanguJs"
                            @open-forward="$emit('open-forward', $event)"
                        >
                            <template #deleted-icon="data">
                                <slot name="deleted-icon" v-bind="data" />
                            </template>
                        </format-message>

                        <message-buttons
                            v-if="
                                ((!message.deleted && !message.hide) || message.reveal) &&
                                message.button_rows &&
                                message.button_rows.length
                            "
                            :rows="message.button_rows"
                            :show-forward-panel="showForwardPanel"
                            @inline-command="$emit('inline-command', $event)"
                        />

                        <div class="vac-text-timestamp" :title="message.date + ' ' + message.timestamp">
                            <span>{{ message.timestamp }}</span>
                        </div>
                    </div>
                    <div :class="{ vrButtons: true, self: message.senderId === currentUserId }" v-if="isSteamVrRunning">
                        <div v-if="message.content" @click="copy">
                            <img
                                :src="copyButton"
                                alt=""
                                class="vac-svg-button"
                                style="width: 20px; height: 20px"
                                @click="openFile('copy')"
                            />
                        </div>
                        <div v-if="message.file" @click="copyLink">
                            <img :src="copyLinkButton" alt="" class="vac-svg-button" />
                        </div>
                        <div @click="$emit('reply', $event)">
                            <img :src="replyButton" alt="" class="vac-svg-button" />
                        </div>
                        <div v-if="canPlusOne" @click="plusOne" title="+1">
                            <svg-icon name="plus-one" class="vac-svg-button" />
                        </div>
                        <div @click="$emit('ctx', $event)" title="更多">
                            <svg-icon name="more" class="vac-svg-button" />
                        </div>
                    </div>
                </div>
            </slot>
        </div>
    </div>
</template>

<script>
import SvgIcon from '../../components/SvgIcon'
import FormatMessage from '../../components/FormatMessage'

import MessageReply from './MessageReply'
import MessageImage from './MessageImage'
import MessageVideo from './MessageVideo'
import MessageAudio from './MessageAudio'
import MessageMarkdown from './MessageMarkdown'
import MessageButtons from './MessageButtons'

import getLottieFace from '../../../../utils/getLottieFace'

const { isImageFile } = require('../../utils/mediaFile')
const { messagesValid } = require('../../utils/roomValidation')

import LottieAnimation from '../../../LottieAnimation'
import ipc from '../../../../utils/ipc'
import getImageUrlByMd5 from '../../../../../utils/getImageUrlByMd5'
import getAvatarUrl from '../../../../../utils/getAvatarUrl'
import pangu from 'pangu'
import { getOrderedMessageParts } from '../../utils/messageMediaOrder'
import createPlusOneMessage from '../../../../../utils/createPlusOneMessage'

export default {
    name: 'Message',
    components: {
        SvgIcon,
        FormatMessage,
        MessageReply,
        MessageImage,
        MessageAudio,
        MessageVideo,
        MessageMarkdown,
        MessageButtons,
        LottieAnimation,
    },

    props: {
        currentUserId: { type: [String, Number], required: true },
        textMessages: { type: Object, required: true },
        message: { type: Object, required: true },
        showDate: { type: Boolean, default: false },
        messageOffset: { type: Boolean, default: false },
        audioSession: { type: Object, default: null },
        editedMessage: { type: Object, required: true },
        roomUsers: { type: Array, default: () => [] },
        showNewMessagesDivider: { type: Boolean, required: true },
        textFormatting: { type: Boolean, required: true },
        showForwardPanel: { type: Boolean, required: true },
        selected: { type: Boolean, default: false },
        linkify: { type: Boolean, default: true },
        forwardResId: { type: String, required: false },
        hideChatImageByDefault: { type: Boolean, required: true },
        hideChatVideoByDefault: { type: Boolean, required: true },
        localImageViewerByDefault: { type: Boolean, required: true },
        disableQLottie: { type: Boolean, required: true },
        recordPath: { type: String, required: true },
        usePanguJs: { type: Boolean, required: false, default: false },
        isSteamVrRunning: { type: Boolean, required: false, default: false },
    },

    data() {
        return {
            hoverMessageId: null,
            imageHover: false,
            messageHover: false,
            optionsOpened: false,
            emojiOpened: false,
            lottie: getLottieFace(this.message.content, this.message.time),
            lottieResult: getLottieFace(this.message.content, this.message.time, true),
            tgLogo: `file://${__static}/tg.svg`,
            copyButton: `file://${__static}/Copy.svg`,
            copyLinkButton: `file://${__static}/bx--link.svg`,
            replyButton: `file://${__static}/reply.svg`,
            recallInfoText: '',
        }
    },

    computed: {
        isMessageHover() {
            return this.editedMessage._id === this.message._id || this.hoverMessageId === this.message._id
        },
        isImage() {
            return isImageFile(this.message.file)
        },
        orderedMessageParts() {
            return getOrderedMessageParts(this.message)
        },
        isVideo() {
            return this.checkVideoType(this.message.file)
        },
        isAudio() {
            return this.checkAudioType(this.message.file)
        },
        isAudioDecoding() {
            return (
                this.isAudio &&
                this.message.file &&
                (this.message.file.name === 'decoding' || this.message.file.url === 'decoding')
            )
        },
        audioPath() {
            if (this.isAudioDecoding) return ''
            if (this.message.file.url === this.message.file.name) {
                return this.recordPath + '/' + this.message.file.name
            }
            return this.message.file.url
        },
        isCheckmarkVisible() {
            return (
                this.message.senderId === this.currentUserId &&
                !this.message.deleted &&
                (this.message.saved || this.message.distributed || this.message.seen)
            )
        },
        avatar() {
            if (this.message.mirai && this.message.mirai.eqq.avatarMd5) {
                return getImageUrlByMd5(this.message.mirai.eqq.avatarMd5)
            }
            if (this.message.mirai && this.message.mirai.eqq.avatarUrl) {
                return this.message.mirai.eqq.avatarUrl
            }
            if (
                (this.$route.name === 'history-page' || this.$route.name === 'member-history-page') &&
                this.message.head_img
            )
                return this.message.head_img
            return getAvatarUrl(this.message.senderId)
        },
        msgSystemParts() {
            if (!this.message.system) return []
            if (this.message.content.includes('<ica:img>')) {
                const res = []
                const parts = this.message.content.split('<ica:img>')
                let imgCount = 0
                for (let i = 0; i < parts.length; i++) {
                    res.push({ type: 'text', content: parts[i] })
                    if (i < parts.length - 1) {
                        res.push({ type: 'image', content: imgCount })
                        imgCount++
                    }
                }
                return res
            } else {
                return [
                    {
                        type: 'text',
                        content: this.message.content,
                    },
                ]
            }
        },
        canPlusOne() {
            // +1 功能支持普通消息、图片和可复用协议资源的语音
            const type = this.message.file?.type
            return (
                !this.message.markdown &&
                !this.message.flash &&
                (!type || type.startsWith('image/') || type.startsWith('audio/'))
            )
        },
    },

    watch: {
        'message.recallInfo': {
            handler(newValue) {
                if (newValue) {
                    const info = JSON.parse(newValue)
                    const date = new Date(info.time).toLocaleString()
                    this.recallInfoText = `消息于 ${date} 被 ${info.operator_id} 撤回`
                }
            },
            immediate: true,
        },
    },

    mounted() {
        if (!messagesValid(this.message)) {
            throw new Error(
                'Messages object is not valid! Must contain _id[String, Number], content[String, Number] and senderId[String, Number]',
            )
        }
        if (this.message.deleted && this.message.recallInfo) {
            const info = JSON.parse(this.message.recallInfo)
            const date = new Date(info.time).toLocaleString()
            this.recallInfoText = `消息于 ${date} 被 ${info.operator_id} 撤回`
        }
    },

    methods: {
        selectMessage(event) {
            if (!this.showForwardPanel) return
            const nextSelected = !this.selected
            console.log('selectMessage', nextSelected)
            this.$emit(nextSelected ? 'add-msg-to-forward' : 'del-msg-to-forward', this.message)
            event.preventDefault()
        },
        onHoverMessage() {
            this.imageHover = true
            this.messageHover = true
            if (this.canEditMessage()) this.hoverMessageId = this.message._id
        },
        canEditMessage() {
            return !this.message.deleted
        },
        onLeaveMessage() {
            this.imageHover = false
            if (!this.optionsOpened && !this.emojiOpened) this.messageHover = false
            this.hoverMessageId = null
        },
        openFile(action) {
            if (this.showForwardPanel) return
            this.$emit('open-file', { message: this.message, action })
        },
        messageActionHandler(action) {
            this.messageHover = false
            this.hoverMessageId = null

            setTimeout(() => {
                this.$emit('message-action-handler', {
                    action,
                    message: this.message,
                })
            }, 300)
        },
        checkVideoType(file) {
            if (!file) return
            const { type } = file
            return type.toLowerCase().includes('video/')
        },
        checkAudioType(file) {
            if (!file) return
            const { type } = file
            return type.toLowerCase().includes('audio/')
        },
        panguSpacing: (text) => pangu.spacing(text),
        copy() {
            navigator.clipboard.writeText(this.message.content)
            new Audio(`file://${__static}/action_menu_select.wav`).play()
        },
        copyLink() {
            navigator.clipboard.writeText(this.message.files[0].url)
            new Audio(`file://${__static}/action_menu_select.wav`).play()
        },
        plusOne() {
            ipc.sendMessage(createPlusOneMessage(this.message))
            new Audio(`file://${__static}/action_menu_select.wav`).play()
        },
    },
}
</script>

<style lang="scss" scoped>
.el-avatar {
    margin-left: 3px;
    margin-bottom: 2px;
}

.vac-card-info {
    border-radius: 4px;
    text-align: center;
    margin: 10px auto;
    font-size: 12px;
    padding: 4px;
    display: block;
    overflow-wrap: break-word;
    position: relative;
    white-space: normal;
    box-shadow:
        0 1px 1px -1px rgba(0, 0, 0, 0.1),
        0 1px 1px -1px rgba(0, 0, 0, 0.11),
        0 1px 2px -1px rgba(0, 0, 0, 0.11);
}

.vac-card-date {
    max-width: 150px;
    font-weight: 500;
    text-transform: uppercase;
    color: var(--chat-message-color-date);
    background: var(--chat-message-bg-color-date);
}

.vac-card-system {
    width: fit-content;
    padding: 8px 20px;
    color: var(--chat-message-color-system);
    background: var(--chat-message-bg-color-system);
}

.vac-line-new {
    color: var(--chat-message-color-new-messages);
    position: relative;
    text-align: center;
    font-size: 13px;
    padding: 10px 0;
}

.vac-line-new:after,
.vac-line-new:before {
    border-top: 1px solid var(--chat-message-color-new-messages);
    content: '';
    left: 0;
    position: absolute;
    top: 50%;
    width: calc(50% - 60px);
}

.vac-line-new:before {
    left: auto;
    right: 0;
}

.vac-message-box {
    position: relative;
    display: flex;
    width: 100%;
    justify-content: flex-start;
    line-height: 1.4;
    align-items: flex-end;
}

.vac-message-box-lottie {
    .vac-message-container {
        max-width: 100%;
    }
}

.vac-message-sender-avatar {
    position: sticky;
    bottom: 0;
}

.vac-message-container {
    position: relative;
    padding: 2px 10px;
    align-items: end;
    min-width: 100px;
    max-width: var(--chat-message-max-width, min(85%, 800px));
    box-sizing: content-box;
}

.vac-message-container-offset {
    margin-top: 10px;
}

.vac-offset-current {
    justify-content: flex-end;
}

.vac-message-card {
    background: var(--chat-message-bg-color);
    color: var(--chat-message-color);
    border-radius: 8px;
    font-size: 14px;
    padding: 6px 9px 3px;
    //white-space: pre-line;3/19 删的，解决链接间距问题
    max-width: 100%;
    -webkit-transition-property: box-shadow, opacity;
    transition-property: box-shadow, opacity;
    transition: box-shadow 280ms cubic-bezier(0.4, 0, 0.2, 1);
    will-change: box-shadow;
    box-shadow:
        0 1px 1px -1px rgba(0, 0, 0, 0.1),
        0 1px 1px -1px rgba(0, 0, 0, 0.11),
        0 1px 2px -1px rgba(0, 0, 0, 0.11);
    -webkit-user-select: text;
}

.vac-message-highlight {
    box-shadow:
        0 1px 2px -1px rgba(0, 0, 0, 0.1),
        0 1px 2px -1px rgba(0, 0, 0, 0.11),
        0 1px 5px -1px rgba(0, 0, 0, 0.11);
}

.vac-message-current {
    background: var(--chat-message-bg-color-me) !important;
}

.vac-message-markdown {
    padding: 6px 9px 3px;
    border-radius: 8px;
}

.vac-message-deleted {
    color: var(--chat-message-color-deleted) !important;
    font-size: 13px !important;
    font-style: italic !important;
    background: var(--chat-message-bg-color-deleted) !important;
}

.vac-message-clickable {
    cursor: pointer;
}

.vac-message-selected {
    background-color: var(--chat-message-bg-color-selected) !important;
    transition: background-color 0.2s;
}

.vac-icon-deleted {
    height: 14px;
    width: 14px;
    vertical-align: middle;
    margin: -2px 2px 0 0;
    fill: var(--chat-message-color-deleted);
}

.vac-icon-hide {
    height: 14px;
    width: 14px;
    vertical-align: middle;
    margin: -2px 2px 0 0;
    fill: var(--chat-message-color-deleted);
}

.vac-video-container {
    width: 350px;
    max-width: 100%;
    margin: 4px auto 5px;

    video {
        border-radius: 4px;
    }
}

::v-deep .vac-message-image {
    position: relative;
    background-color: var(--chat-message-bg-color-image) !important;
    background-size: cover !important;
    background-position: center center !important;
    background-repeat: no-repeat !important;
    height: 250px;
    width: 250px;
    max-width: 100%;
    border-radius: 4px;
    margin: 4px auto 5px;
    transition: 0.4s filter linear;
}

.vac-text-username {
    font-size: 13px;
    color: var(--chat-message-color-username);
    margin-bottom: 2px;
}

.vac-username-reply {
    margin-bottom: 5px;
}

.vac-text-timestamp {
    font-size: 10px;
    color: var(--chat-message-color-timestamp);
    text-align: right;
}

.vac-text-markdown-badge {
    display: inline-block;
    margin-left: 6px;
    padding: 0 4px;
    border: 1px solid color-mix(in srgb, currentColor 40%, transparent);
    border-radius: 3px;
    font-size: 12px;
    line-height: 1.4;
    opacity: 0.85;
    vertical-align: middle;
}

.vac-audio-message {
    margin-top: 3px;
}

.vac-audio-decoding {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 180px;
    max-width: 300px;
    height: 40px;
    padding: 0 12px 0 10px;
    box-sizing: border-box;
    border-radius: 20px;
    background: var(--chat-message-bg-color-media, rgba(0, 0, 0, 0.06));
    color: var(--chat-message-color, inherit);
    user-select: none;
}

.vac-audio-decoding-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    flex-shrink: 0;
    background: rgba(25, 118, 210, 0.12);
    color: #1976d2;
    animation: vac-audio-decoding-pulse 1.6s ease-in-out infinite;
}

.vac-audio-decoding-wave {
    display: flex;
    align-items: center;
    gap: 3px;
    height: 18px;
    flex-shrink: 0;

    span {
        display: block;
        width: 3px;
        height: 100%;
        border-radius: 2px;
        background: currentColor;
        opacity: 0.55;
        transform-origin: center;
        animation: vac-audio-decoding-bar 1s ease-in-out infinite;

        &:nth-child(1) {
            animation-delay: 0s;
        }
        &:nth-child(2) {
            animation-delay: 0.12s;
        }
        &:nth-child(3) {
            animation-delay: 0.24s;
        }
        &:nth-child(4) {
            animation-delay: 0.36s;
        }
        &:nth-child(5) {
            animation-delay: 0.48s;
        }
    }
}

.vac-audio-decoding-text {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    font-size: 12px;
    line-height: 1;
    opacity: 0.85;
}

.vac-audio-decoding-title {
    white-space: nowrap;
}

.vac-audio-decoding-dots {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-left: 2px;

    i {
        width: 3px;
        height: 3px;
        border-radius: 50%;
        background: currentColor;
        opacity: 0.35;
        animation: vac-audio-decoding-dot 1.2s ease-in-out infinite;

        &:nth-child(1) {
            animation-delay: 0s;
        }
        &:nth-child(2) {
            animation-delay: 0.2s;
        }
        &:nth-child(3) {
            animation-delay: 0.4s;
        }
    }
}

@keyframes vac-audio-decoding-bar {
    0%,
    100% {
        transform: scaleY(0.35);
        opacity: 0.35;
    }
    50% {
        transform: scaleY(1);
        opacity: 0.9;
    }
}

@keyframes vac-audio-decoding-dot {
    0%,
    80%,
    100% {
        opacity: 0.25;
        transform: translateY(0);
    }
    40% {
        opacity: 1;
        transform: translateY(-1px);
    }
}

@keyframes vac-audio-decoding-pulse {
    0%,
    100% {
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(25, 118, 210, 0.18);
    }
    50% {
        transform: scale(1.04);
        box-shadow: 0 0 0 4px rgba(25, 118, 210, 0);
    }
}

.vac-file-message {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    margin-top: 3px;

    span {
        max-width: 100%;
    }

    .vac-icon-file svg {
        margin-right: 5px;
    }
}

.vac-icon-edited {
    -webkit-box-align: center;
    align-items: center;
    display: -webkit-inline-box;
    display: inline-flex;
    justify-content: center;
    letter-spacing: normal;
    line-height: 1;
    text-indent: 0;
    vertical-align: middle;
    margin: 0 4px 2px;

    svg {
        height: 12px;
        width: 12px;
    }
}

.vac-icon-check {
    height: 14px;
    width: 14px;
    vertical-align: middle;
    margin: -3px -3px 0 3px;
}

@media only screen and (max-width: 768px) {
    .vac-message-container {
        padding: 2px 3px 1px;
    }

    .vac-message-container-offset {
        margin-top: 10px;
    }
}

.vrButtons {
    display: flex;
    gap: 6px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.03);
    position: absolute;
    bottom: 0;
    left: 100%;
    padding: 6px;

    &.self {
        right: 100%;
        left: unset;
    }

    div {
        background: rgba(255, 255, 255, 0.7);
        border-radius: 4px;
        width: 28px;
        height: 28px;
        display: flex;
        justify-content: center;
        align-items: center;

        img {
            width: 24px;
            height: 24px;
            object-fit: contain;
        }
    }

    svg {
        fill: #1976d2;
    }
}
</style>
