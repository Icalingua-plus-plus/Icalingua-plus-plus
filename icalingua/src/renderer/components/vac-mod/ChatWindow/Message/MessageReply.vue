<template>
    <div class="vac-reply-message">
        <div class="vac-reply-username" v-if="message.replyMessage.username">
            {{ message.replyMessage.username }}
            <div style="float: right; width: 15px; height: 15px; cursor: pointer" @click="scrollToOrigin">
                <svg
                    width="15"
                    height="15"
                    viewBox="0 0 48 48"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    style="stroke: var(--chat-message-color)"
                >
                    <path
                        d="M24.0083 14.1005V42"
                        stroke-width="5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    ></path>
                    <path d="M12 26L24 14L36 26" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"></path>
                    <path d="M12 6H36" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
            </div>
        </div>

        <div v-if="isImage" class="vac-image-reply-container" @click="openImage">
            <el-image
                :src="message.replyMessage.file.url"
                fit="cover"
                referrer-policy="no-referrer"
                class="vac-message-image-reply"
            >
                <div slot="error" class="image-slot">
                    <i class="el-icon-picture-outline"></i>
                </div>
            </el-image>
        </div>

        <div class="vac-reply-content">
            <format-message
                :content="message.replyMessage.content"
                :users="roomUsers"
                :text-formatting="true"
                :reply="true"
                :linkify="linkify"
                :showForwardPanel="showForwardPanel"
                @open-forward="$emit('open-forward', $event)"
            />
        </div>
    </div>
</template>

<script>
import FormatMessage from '../../components/FormatMessage'
import { ipcRenderer } from 'electron'

const { isImageFile } = require('../../utils/mediaFile')

export default {
    name: 'MessageReply',
    components: { FormatMessage },

    props: {
        linkify: { type: Boolean, default: true },
        message: { type: Object, required: true },
        roomUsers: { type: Array, required: true },
        showForwardPanel: { type: Boolean, required: true },
    },

    computed: {
        isImage() {
            return isImageFile(this.message.replyMessage.file)
        },
    },

    methods: {
        scrollToOrigin() {
            if (this.showForwardPanel) return
            const originMessage = document.getElementById(this.message.replyMessage._id)
            if (originMessage) {
                originMessage.scrollIntoView({
                    behavior: 'smooth',
                })
            } else {
                this.$message.error('被回复的消息太远啦')
            }
        },
        openImage(e) {
            if (this.showForwardPanel) return
            ipcRenderer.send('openImage', this.message.replyMessage.file.url, false)
            e.stopPropagation()
        },
    },
}
</script>

<style lang="scss">
.vac-reply-message {
    background: var(--chat-message-bg-color-reply);
    border-radius: 4px;
    margin: -1px -5px 8px;
    padding: 8px 10px;

    .vac-reply-username {
        color: var(--chat-message-color-reply-username);
        font-size: 12px;
        line-height: 15px;
        margin-bottom: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .vac-image-reply-container {
        width: 70px;

        .vac-message-image-reply {
            height: 70px;
            width: 70px;
            margin: 4px auto 3px;
            cursor: pointer;
        }
    }

    .vac-reply-content {
        font-size: 12px;
        color: var(--chat-message-color-reply-content);
    }
}
</style>
