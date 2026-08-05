<template>
    <div :class="{ 'vac-text-ellipsis': singleLine }" @dblclick.stop>
        <div v-if="textFormatting" :class="{ 'vac-text-ellipsis': singleLine }">
            <template v-for="(message, i) in linkifiedMessage">
                <component
                    :is="message.href ? 'a' : 'span'"
                    v-if="message.type !== 'face' && (!isForwardMessage(message) || !hasForwardCard)"
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
                    <span class="vac-message-content">{{ formatPartValue(message) }}</span>
                </component>
                <span v-if="message.type === 'face'" :key="i">
                    <img
                        class="face"
                        :src="'file://' + facepath + preZeroFill(Number(message.value), 3)"
                        :alt="message.value"
                    />
                </span>
                <forward-message-card
                    v-if="hasForwardCard && isForwardMessage(message)"
                    :key="i"
                    :preview="forwardCard"
                    :clickable="!showForwardPanel"
                    @open="openForwardCard(message)"
                />
            </template>
        </div>
        <div v-else class="vac-message-content">
            {{ content }}
        </div>
    </div>
</template>

<script>
import SvgIcon from './SvgIcon'
import ForwardMessageCard from './ForwardMessageCard'

const path = require('path')

import { parseForwardCard, parseForwardResource, stripForwardPreview } from '../utils/forwardMessage'
import { formatMessageParts, padFaceId } from '../utils/messageFormatting'

export default {
    name: 'FormatMessage',
    components: { SvgIcon, ForwardMessageCard },

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
            return formatMessageParts(this.displayContent, {
                linkify: this.linkify,
                disableQLottie: this.disableQLottie,
                usePanguJs: this.usePanguJs,
            })
        },
        displayContent() {
            return stripForwardPreview(String(this.content), this.forwardCard)
        },
        forwardCard() {
            return parseForwardCard(this.code)
        },
        forwardResource() {
            return parseForwardResource(this.code)
        },
        hasForwardCard() {
            return Boolean(this.code && this.code.trim())
        },
        isForwardHistory() {
            return this.$route && this.$route.name === 'history-page' && Boolean(this.forwardResId)
        },
    },

    methods: {
        isForwardMessage(message) {
            return message.type === 'forward' || message.type === 'nestedforward'
        },
        formatPartValue(message) {
            if (message.type === 'forward') return `[Forward: ${message.value}]`
            if (message.type === 'nestedforward') return `[NestedForward: ${message.value}]`
            return message.value
        },
        openForwardCard(message) {
            if (this.showForwardPanel || !this.isForwardMessage(message)) return
            this.$emit('open-forward', this.createForwardEvent(message))
        },
        createForwardEvent(message) {
            const { messages, resId, fileName } = this.forwardResource
            const useNested = Boolean(this.forwardResId && (this.isForwardHistory || message.type === 'nestedforward'))
            if (!useNested) return { resId: messages ?? resId ?? message.value }

            const event = {
                resId: this.forwardResId,
                fileName: fileName || message.value,
            }
            if (resId) event.fallbackResId = resId
            return event
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
