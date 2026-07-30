<template>
    <div :class="{ 'vac-text-ellipsis': singleLine }" @dblclick.stop>
        <div v-if="textFormatting" :class="{ 'vac-text-ellipsis': singleLine }">
            <template v-for="(message, i) in linkifiedMessage">
                <component
                    :is="message.href ? 'a' : 'span'"
                    v-if="message.type !== 'face' && message.type !== 'forward' && message.type !== 'nestedforward'"
                    :key="i"
                    :class="{
                        'vac-text-ellipsis': singleLine,
                        'vac-text-italic': deleted,
                        'vac-text-at': message.type === 'at',
                    }"
                    :href="message.href"
                    :target="message.href ? '_blank' : null"
                    :title="message.title"
                    @dragstart="
                        (a) => {
                            if (message.type === 'at') a.preventDefault()
                        }
                    "
                    style="word-break: break-word"
                >
                    <slot name="deleted-icon" v-bind="{ deleted }">
                        <svg-icon v-if="deleted" name="deleted" class="vac-icon-deleted" />
                    </slot>
                    <br v-if="message.type === 'breakLine'" />
                    <span class="vac-message-content">{{ message.value }}</span>
                </component>
                <span v-if="message.type === 'face'" :key="i">
                    <img
                        class="face"
                        :src="'file://' + facepath + preZeroFill(Number(message.value), 3)"
                        :alt="message.value"
                    />
                </span>
                <a
                    v-if="message.type === 'forward'"
                    style="cursor: pointer"
                    :key="i"
                    :title="forwardPreview"
                    @click="openForward(message)"
                >
                    View Forwarded Messages
                </a>
                <a
                    v-if="message.type === 'nestedforward'"
                    style="cursor: pointer"
                    :key="i"
                    :title="forwardPreview"
                    @click="openNested(message)"
                >
                    View Forwarded Messages
                </a>
            </template>
        </div>
        <div v-else class="vac-message-content">
            {{ content }}
        </div>
    </div>
</template>

<script>
import SvgIcon from './SvgIcon'

const path = require('path')

import { parseForwardPreview, resolveForwardResource } from '../utils/forwardMessage'
import { formatMessageParts, padFaceId } from '../utils/messageFormatting'

export default {
    name: 'FormatMessage',
    components: { SvgIcon },

    props: {
        content: { type: [String, Number], required: true },
        deleted: { type: Boolean, default: false },
        linkify: { type: Boolean, default: true },
        singleLine: { type: Boolean, default: false },
        textFormatting: { type: Boolean, required: true },
        showForwardPanel: { type: Boolean, required: true },
        forwardResId: { type: String, required: false },
        code: { type: String, required: false },
        disableQLottie: { type: Boolean, required: false },
        usePanguJs: { type: Boolean, required: false, default: false },
    },

    data() {
        return {
            facepath: path.join(__static, '/face/'),
        }
    },

    computed: {
        linkifiedMessage() {
            return formatMessageParts(String(this.content), {
                linkify: this.linkify,
                disableQLottie: this.disableQLottie,
                usePanguJs: this.usePanguJs,
            })
        },
        forwardPreview() {
            return parseForwardPreview(this.code)
        },
    },

    methods: {
        openForward(message) {
            if (this.showForwardPanel) return
            if (message.type !== 'forward') return

            this.$emit('open-forward', { resId: resolveForwardResource(this.code, message.value) })
        },
        openNested(message) {
            if (this.showForwardPanel) return
            if (message.type !== 'nestedforward') return
            this.$emit('open-forward', { resId: this.forwardResId, fileName: message.value })
        },
        preZeroFill(num, size) {
            return padFaceId(num, size)
        },
    },
}
</script>

<style>
.vac-message-content {
    white-space: pre-wrap;
}

.vac-icon-deleted {
    height: 14px;
    width: 14px;
    vertical-align: middle;
    margin: -3px 1px 0 0;
    fill: var(--chat-room-color-message);
}

.vac-text-ellipsis {
    width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

img.face {
    width: 18px;
    height: 18px;
    margin-bottom: -4px;
}

.vac-text-at {
    text-decoration: none;
}
</style>
