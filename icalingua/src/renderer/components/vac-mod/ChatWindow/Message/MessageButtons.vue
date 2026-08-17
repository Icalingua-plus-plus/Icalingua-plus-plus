<template>
    <div v-if="visibleRows.length" class="vac-message-buttons" @click.stop>
        <div v-for="(row, rowIndex) in visibleRows" :key="rowIndex" class="vac-message-button-row">
            <a
                v-for="(button, buttonIndex) in row"
                :key="buttonIndex"
                class="vac-markdown-button vac-message-button"
                :class="{ 'vac-message-button-external': isExternalButton(button) }"
                :href="safeUrl(button) || undefined"
                target="_blank"
                rel="noopener noreferrer"
                :title="buttonTitle(button, rowIndex, buttonIndex)"
                @click="handleClick($event, button, rowIndex, buttonIndex)"
            >
                <i
                    v-if="isExternalButton(button)"
                    class="el-icon-link vac-message-button-link-icon"
                    aria-hidden="true"
                ></i>
                {{ buttonLabel(button, rowIndex, buttonIndex) }}
            </a>
        </div>
    </div>
</template>

<script>
import {
    isExternalMessageUrl,
    parseMessageMarkdownInlineCommand,
    sanitizeMessageUrl,
} from '../../utils/messageMarkdown'

export default {
    name: 'MessageButtons',

    props: {
        rows: { type: Array, default: () => [] },
        showForwardPanel: { type: Boolean, default: false },
    },

    data() {
        return {
            visitedButtons: Object.create(null),
        }
    },

    computed: {
        visibleRows() {
            return this.rows
                .map((row) => (Array.isArray(row) ? row.filter((button) => button) : []))
                .filter((row) => row.length)
        },
    },

    methods: {
        buttonKey(rowIndex, buttonIndex) {
            return `${rowIndex}:${buttonIndex}`
        },
        buttonLabel(button, rowIndex, buttonIndex) {
            const key = this.buttonKey(rowIndex, buttonIndex)
            if (
                this.visitedButtons[key] &&
                typeof button.visited_label === 'string' &&
                button.visited_label.length > 0
            ) {
                return button.visited_label
            }
            return button.label || ''
        },
        buttonTitle(button, rowIndex, buttonIndex) {
            const label = this.buttonLabel(button, rowIndex, buttonIndex)
            const url = this.safeUrl(button)
            return this.isExternalUrl(url) ? `${label} (${url})` : label
        },
        safeUrl(button) {
            return sanitizeMessageUrl(String((button && button.url) || '')) || ''
        },
        isExternalUrl(url) {
            return isExternalMessageUrl(url)
        },
        isExternalButton(button) {
            return this.isExternalUrl(this.safeUrl(button))
        },
        handleClick(event, button, rowIndex, buttonIndex) {
            const url = this.safeUrl(button)
            const key = this.buttonKey(rowIndex, buttonIndex)

            if (this.showForwardPanel || !url) {
                event.preventDefault()
                return
            }

            this.$set(this.visitedButtons, key, true)

            const inlineCommand = parseMessageMarkdownInlineCommand(url)
            if (inlineCommand) {
                event.preventDefault()
                event.stopPropagation()
                this.$emit('inline-command', inlineCommand)
                return
            }

            if (this.isExternalUrl(url)) {
                event.preventDefault()
                event.stopPropagation()
                this.confirmExternalUrl(url)
                return
            }

            event.stopPropagation()
        },
        confirmExternalUrl(url) {
            this.$confirm(`确定打开外部链接？\n${url}`, '打开外部链接', {
                confirmButtonText: '打开',
                cancelButtonText: '取消',
                type: 'warning',
            })
                .then((action) => {
                    if (action !== 'confirm') return
                    window.open(url, '_blank')
                })
                .catch(() => {})
        },
    },
}
</script>

<style lang="scss">
.vac-message-buttons {
    display: flex;
    width: 100%;
    margin: 8px 0;
    flex-direction: column;
    gap: 6px;
}

.vac-message-button-row {
    display: flex;
    width: 100%;
    min-width: 0;
    gap: 6px;
}

.vac-message-button {
    position: relative;
    flex: 1 1 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.vac-message-button-external {
    padding-left: 24px;
}

.vac-message-button-link-icon {
    position: absolute;
    top: 5px;
    left: 7px;
    font-size: 12px;
    line-height: 1;
    opacity: 0.75;
    pointer-events: none;
}
</style>
