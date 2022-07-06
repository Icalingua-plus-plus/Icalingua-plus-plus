<template>
    <div :class="{ 'vac-text-ellipsis': singleLine }" @dblclick.stop>
        <div v-if="textFormatting" :class="{ 'vac-text-ellipsis': singleLine }">
            <template v-for="(message, i) in linkifiedMessage">
                <component
                    :is="message.url ? 'a' : 'span'"
                    v-if="!message.face && !message.forward"
                    :key="i"
                    :class="{
                        'vac-text-ellipsis': singleLine,
                        'vac-text-bold': message.bold,
                        'vac-text-italic': deleted || message.italic,
                        'vac-text-strike': message.strike,
                        'vac-text-underline': message.underline,
                        'vac-text-inline-code': !singleLine && message.inline,
                        'vac-text-multiline-code': !singleLine && message.multiline,
                        'vac-text-tag': !singleLine && !reply && message.tag,
                        'vac-text-spoiler': !showSpoiler && message.spoiler,
                        'vac-text-spoiler-transition': message.spoiler,
                    }"
                    :href="message.href"
                    :target="message.href ? '_blank' : null"
                    @click="showSpoiler = true"
                    style="word-break: break-word"
                >
                    <slot name="deleted-icon" v-bind="{ deleted }">
                        <svg-icon v-if="deleted" name="deleted" class="vac-icon-deleted" />
                    </slot>
                    <template v-if="message.url && message.image">
                        <div class="vac-image-link-container">
                            <div
                                class="vac-image-link"
                                :style="{
                                    'background-image': `url('${message.value}')`,
                                    height: message.height,
                                }"
                            />
                        </div>
                        <div class="vac-image-link-message">
                            <span>{{ message.value }}</span>
                        </div>
                    </template>
                    <template v-else>
                        <br v-if="message.breakLine" />
                        <span class="vac-message-content">{{ message.value }}</span>
                    </template>
                </component>
                <img
                    class="face"
                    v-if="message.face"
                    :key="i"
                    :src="'file://' + facepath + preZeroFill(Number(message.value), 3)"
                    :alt="message.value"
                />
                <a v-if="message.forward" style="cursor: pointer" @click="openForward(message)">
                    View Forwarded Messages
                </a>
            </template>
        </div>
        <div v-else class="vac-message-content">
            {{ formattedContent }}
        </div>
    </div>
</template>

<script>
import SvgIcon from './SvgIcon'

const path = require('path')

import formatString from '../utils/formatString'

export default {
    name: 'FormatMessage',
    components: { SvgIcon },

    props: {
        content: { type: [String, Number], required: true },
        deleted: { type: Boolean, default: false },
        users: { type: Array, default: () => [] },
        linkify: { type: Boolean, default: true },
        singleLine: { type: Boolean, default: false },
        reply: { type: Boolean, default: false },
        textFormatting: { type: Boolean, required: true },
        showForwardPanel: { type: Boolean, required: true },
    },

    data() {
        return {
            facepath: path.join(__static, '/face/'),
            showSpoiler: false,
        }
    },

    computed: {
        linkifiedMessage() {
            const message = formatString(this.formatTags(this.content), this.linkify)

            message.forEach((m) => {
                m.url = this.checkType(m, 'url')
                m.bold = this.checkType(m, 'bold')
                m.italic = this.checkType(m, 'italic')
                m.strike = this.checkType(m, 'strike')
                m.underline = this.checkType(m, 'underline')
                m.inline = this.checkType(m, 'inline-code')
                m.multiline = this.checkType(m, 'multiline-code')
                m.tag = this.checkType(m, 'tag')
                m.face = this.checkType(m, 'face')
                m.forward = this.checkType(m, 'forward')
                m.breakLine = this.checkType(m, 'breakLine')
                m.spoiler = this.checkType(m, 'spoiler')
                m.image = this.checkImageType(m)
            })

            return message
        },
        formattedContent() {
            return this.formatTags(this.content)
        },
    },

    methods: {
        checkType(message, type) {
            return message.types.indexOf(type) !== -1
        },
        checkImageType(message) {
            let index = message.value.lastIndexOf('.')
            const slashIndex = message.value.lastIndexOf('/')
            if (slashIndex > index) index = -1

            const type = message.value.substring(index + 1, message.value.length)

            const isMedia = index > 0 && type.toLowerCase().startsWith('image/')

            if (isMedia) this.setImageSize(message)

            return isMedia
        },
        setImageSize(message) {
            const image = new Image()
            image.src = message.value

            image.addEventListener('load', onLoad)

            function onLoad(img) {
                const ratio = img.path[0].width / 150
                message.height = Math.round(img.path[0].height / ratio) + 'px'
                image.removeEventListener('load', onLoad)
            }
        },
        formatTags(content) {
            this.users.forEach((user) => {
                const index = content.indexOf(user._id)
                const isTag = content.substring(index - 9, index) === '<usertag>'
                if (isTag) content = content.replace(user._id, `@${user.username}`)
            })

            return content
        },
        openForward(message) {
            if (this.showForwardPanel) return
            if (!message.forward) return
            this.$emit('open-forward', message.value)
        },
        preZeroFill(num, size) {
            if (num >= Math.pow(10, size)) {
                //如果num本身位数不小于size位
                return num.toString()
            } else {
                var _str = Array(size + 1).join('0') + num
                return _str.slice(_str.length - size)
            }
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

.vac-image-link-container {
    background-color: var(--chat-message-bg-color-media);
    padding: 8px;
    margin: 2px auto;
    border-radius: 4px;
}

.vac-image-link {
    position: relative;
    background-color: var(--chat-message-bg-color-image) !important;
    background-size: contain;
    background-position: center center !important;
    background-repeat: no-repeat !important;
    height: 150px;
    width: 150px;
    max-width: 100%;
    border-radius: 4px;
    margin: 0 auto;
}

.vac-image-link-message {
    max-width: 166px;
    font-size: 12px;
}

img.face {
    width: 18px;
    height: 18px;
    margin-bottom: -4px;
}

.vac-text-spoiler {
    background-color: #0a0a0a;
    cursor: pointer;
}

.vac-text-spoiler-transition {
    transition: all 0.5s;
}
</style>
