<template>
    <div>
        <div v-if="showDate" class="vac-card-info vac-card-date">
            {{ message.date }}
        </div>

        <div v-if="newMessage._id === message._id" class="vac-line-new">
            {{ textMessages.NEW_MESSAGES }}
        </div>

        <div v-if="message.system" class="vac-card-info vac-card-system">
            {{ message.content }}
        </div>

        <div
            v-else
            :id="message._id"
            class="vac-message-box"
            :class="{ 'vac-offset-current': message.senderId === currentUserId }"
            @click="selectMessage"
        >
            <slot name="message" v-bind="{ message }">
                <div
                    class="vac-message-sender-avatar"
                    @click.right="$emit('avatar-ctx')"
                    @dblclick="$emit('poke')"
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
                    @click.right="$emit('ctx')"
                >
                    <div
                        class="vac-message-card"
                        :class="{
                            'vac-message-highlight': isMessageHover,
                            'vac-message-current': message.senderId === currentUserId,
                            'vac-message-deleted': message.deleted || message.hide,
                            'vac-message-clickable': showForwardPanel,
                            'vac-message-selected': selected,
                        }"
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
                            <span style="width: 100%">{{ message.username }}</span>
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
                            :room-users="roomUsers"
                            :linkify="linkify"
                            :showForwardPanel="showForwardPanel"
                            :forward-res-id="forwardResId"
                            @open-forward="$emit('open-forward', $event)"
                            @scroll-to-message="$emit('scroll-to-message', $event)"
                        />

                        <div v-if="message.deleted && !message.reveal">
                            <slot name="deleted-icon">
                                <svg-icon name="deleted" class="vac-icon-deleted" />
                            </slot>
                            <span>{{ textMessages.MESSAGE_DELETED }}</span>
                        </div>

                        <div v-else-if="message.hide && !message.reveal && !message.deleted">
                            <slot name="deleted-icon">
                                <svg-icon name="hide" class="vac-icon-hide" />
                            </slot>
                            <span>{{ textMessages.MESSAGE_HIDE }}</span>
                        </div>

                        <LottieAnimation v-else-if="lottie" :path="lottie" :height="250" :width="250" />

                        <message-image
                            v-else-if="isImage && message.files"
                            v-for="(file, i) in message.files"
                            :key="i"
                            :current-user-id="currentUserId"
                            :file="file"
                            :flash="message.flash"
                            :content="message.content"
                            :room-users="roomUsers"
                            :text-formatting="textFormatting"
                            :image-hover="imageHover"
                            :showForwardPanel="showForwardPanel"
                            @open-file="openFile"
                            :hide-chat-image-by-default="hideChatImageByDefault"
                        >
                            <template v-for="(i, name) in $scopedSlots" #[name]="data">
                                <slot :name="name" v-bind="data" />
                            </template>
                        </message-image>

                        <message-image
                            v-else-if="isImage"
                            :current-user-id="currentUserId"
                            :file="message.file"
                            :flash="message.flash"
                            :content="message.content"
                            :room-users="roomUsers"
                            :text-formatting="textFormatting"
                            :image-hover="imageHover"
                            :showForwardPanel="showForwardPanel"
                            :hide-chat-image-by-default="hideChatImageByDefault"
                            @open-file="openFile"
                        >
                            <template v-for="(i, name) in $scopedSlots" #[name]="data">
                                <slot :name="name" v-bind="data" />
                            </template>
                        </message-image>

                        <div v-else-if="isVideo" class="vac-video-container">
                            <video width="100%" height="100%" controls :src="message.file.url">
                                <source :src="message.file.url" />
                            </video>
                        </div>

                        <div v-else-if="isAudio" class="vac-audio-message">
                            <div id="vac-audio-player">
                                <audio controls controlslist="nodownload noremoteplayback novolume nomute">
                                    <source :src="message.file.url" />
                                </audio>
                            </div>
                        </div>

                        <div v-else-if="message.file" class="vac-file-message">
                            <div class="vac-svg-button vac-icon-file" @click.stop="openFile('download')">
                                <slot name="document-icon">
                                    <svg-icon name="document" />
                                </slot>
                            </div>
                        </div>

                        <format-message
                            v-if="(!message.deleted && !message.hide) || message.reveal"
                            :content="message.content"
                            :users="roomUsers"
                            :text-formatting="textFormatting"
                            :linkify="linkify"
                            :showForwardPanel="showForwardPanel"
                            :forward-res-id="forwardResId"
                            @open-forward="$emit('open-forward', $event)"
                        >
                            <template #deleted-icon="data">
                                <slot name="deleted-icon" v-bind="data" />
                            </template>
                        </format-message>

                        <div class="vac-text-timestamp">
                            <span>{{ message.timestamp }}</span>
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

import getLottieFace from '../../../../utils/getLottieFace'

const { isImageFile } = require('../../utils/mediaFile')
const { messagesValid } = require('../../utils/roomValidation')

import LottieAnimation from '../../../LottieAnimation'
import ipc from '../../../../utils/ipc'
import getImageUrlByMd5 from '../../../../../utils/getImageUrlByMd5'
import getAvatarUrl from '../../../../../utils/getAvatarUrl'

export default {
    name: 'Message',
    components: {
        SvgIcon,
        FormatMessage,
        MessageReply,
        MessageImage,
        LottieAnimation,
    },

    data() {
        return {
            selected: false,
        }
    },

    props: {
        currentUserId: { type: [String, Number], required: true },
        textMessages: { type: Object, required: true },
        index: { type: Number, required: true },
        message: { type: Object, required: true },
        messages: { type: Array, required: true },
        editedMessage: { type: Object, required: true },
        roomUsers: { type: Array, default: () => [] },
        roomFooterRef: { type: HTMLDivElement, default: null },
        newMessages: { type: Array, default: () => [] },
        showReactionEmojis: { type: Boolean, required: true },
        showNewMessagesDivider: { type: Boolean, required: true },
        textFormatting: { type: Boolean, required: true },
        emojisList: { type: Object, required: true },
        showForwardPanel: { type: Boolean, required: true },
        selectedMessage: { type: String, required: true },
        linkify: { type: Boolean, default: true },
        forwardResId: { type: String, required: false },
        msgstoForward: { type: Array, required: false },
        hideChatImageByDefault: { type: Boolean, required: true },
    },

    data() {
        return {
            hoverMessageId: null,
            imageHover: false,
            messageHover: false,
            optionsOpened: false,
            emojiOpened: false,
            newMessage: {},
            lottie: getLottieFace(this.message.content),
            tgLogo: `file://${__static}/tg.svg`,
        }
    },

    computed: {
        showDate() {
            return this.index > 0 && this.message.date !== this.messages[this.index - 1].date
        },
        messageOffset() {
            return this.index > 0 && this.message.senderId !== this.messages[this.index - 1].senderId
        },
        isMessageHover() {
            return this.editedMessage._id === this.message._id || this.hoverMessageId === this.message._id
        },
        isImage() {
            return isImageFile(this.message.file)
        },
        isVideo() {
            return this.checkVideoType(this.message.file)
        },
        isAudio() {
            return this.checkAudioType(this.message.file)
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
            return getAvatarUrl(this.message.senderId)
        },
    },

    watch: {
        newMessages(val) {
            if (!val.length || !this.showNewMessagesDivider) return
            this.newMessage = val.reduce((res, obj) => (obj.index < res.index ? obj : res))
        },
        showForwardPanel: {
            handler(newValue) {
                if (!newValue) {
                    this.selected = false
                } else if (this.message._id === this.selectedMessage || this.msgstoForward.includes(this.message._id)) {
                    this.selected = true
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
        if (!this.message.seen && this.message.senderId !== this.currentUserId) {
            this.$emit('add-new-message', {
                _id: this.message._id,
                index: this.index,
            })
        }
    },

    methods: {
        selectMessage(event) {
            if (!this.showForwardPanel) return
            this.selected = !this.selected
            console.log('selectMessage', this.selected)
            this.$emit(this.selected ? 'add-msg-to-forward' : 'del-msg-to-forward', this.message._id)
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
    box-shadow: 0 1px 1px -1px rgba(0, 0, 0, 0.1), 0 1px 1px -1px rgba(0, 0, 0, 0.11),
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
    max-width: 250px;
    padding: 8px 4px;
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
    flex: 0 0 50%;
    max-width: 50%;
    justify-content: flex-start;
    line-height: 1.4;
    align-items: flex-end;
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
    box-sizing: content-box;
}

.vac-message-container-offset {
    margin-top: 10px;
}

.vac-offset-current {
    margin-left: 50%;
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
    box-shadow: 0 1px 1px -1px rgba(0, 0, 0, 0.1), 0 1px 1px -1px rgba(0, 0, 0, 0.11),
        0 1px 2px -1px rgba(0, 0, 0, 0.11);
    -webkit-user-select: text;
}

.vac-message-highlight {
    box-shadow: 0 1px 2px -1px rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.11),
        0 1px 5px -1px rgba(0, 0, 0, 0.11);
}

.vac-message-current {
    background: var(--chat-message-bg-color-me) !important;
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

.selector:not(*:root),
#vac-audio-player {
    max-width: 250px;
    overflow: hidden;
    border-top-right-radius: 1em;
    border-bottom-right-radius: 2.5em 1em;

    audio {
        height: 40px;
        max-width: 100%;

        &::-webkit-media-controls-panel {
            height: 40px;
        }
    }
}

.vac-audio-message {
    margin-top: 3px;
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

    .vac-message-box {
        flex: 0 0 80%;
        max-width: 80%;
    }

    .vac-offset-current {
        margin-left: 20%;
    }
}
</style>
