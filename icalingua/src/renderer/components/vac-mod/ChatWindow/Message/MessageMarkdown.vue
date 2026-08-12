<template>
    <div class="vac-message-markdown-content" v-html="renderedMarkdown" @click="handleClick"></div>
</template>

<script>
import { ipcRenderer } from 'electron'
import { parseMessageMarkdownInlineCommand, renderMessageMarkdown } from '../../utils/messageMarkdown'

export default {
    name: 'MessageMarkdown',

    props: {
        content: { type: String, required: true },
        hideChatImageByDefault: { type: Boolean, default: false },
        localImageViewerByDefault: { type: Boolean, default: false },
        showForwardPanel: { type: Boolean, required: true },
    },

    computed: {
        renderedMarkdown() {
            return renderMessageMarkdown(this.content, { hideImages: this.hideChatImageByDefault })
        },
    },

    methods: {
        handleClick(event) {
            const target = event.target instanceof Element ? event.target : null
            if (!target) return

            const copyButton = target.closest('button.vac-markdown-code-copy')
            if (copyButton && this.$el.contains(copyButton)) {
                if (this.showForwardPanel) {
                    event.preventDefault()
                    return
                }

                event.preventDefault()
                event.stopPropagation()
                const code = copyButton.closest('.vac-markdown-code-container')?.querySelector('code')
                if (!code) return

                navigator.clipboard.writeText(code.textContent || '').then(() => {
                    copyButton.textContent = '已复制'
                    setTimeout(() => {
                        if (copyButton.isConnected) copyButton.textContent = '复制'
                    }, 1200)
                })
                return
            }

            const link = target.closest('a')
            if (link && this.$el.contains(link)) {
                if (this.showForwardPanel) {
                    event.preventDefault()
                    return
                }

                const inlineCommand = parseMessageMarkdownInlineCommand(link.href)
                if (inlineCommand) {
                    event.preventDefault()
                    event.stopPropagation()
                    this.$emit('inline-command', inlineCommand)
                    return
                }

                event.stopPropagation()
                return
            }

            const image = target.closest('img.vac-markdown-image')
            if (!image || !this.$el.contains(image)) return
            if (this.showForwardPanel) {
                event.preventDefault()
                return
            }

            event.preventDefault()
            event.stopPropagation()
            ipcRenderer.send('openImage', image.currentSrc || image.src, this.localImageViewerByDefault)
        },
    },
}
</script>

<style lang="scss">
.vac-message-markdown-content {
    min-width: 100px;
    max-width: 100%;
    overflow-wrap: anywhere;
    font-size: 15px;
    line-height: 1.45;

    h1,
    h2,
    p,
    blockquote,
    ol,
    ul {
        margin-top: 0;
    }

    h1 {
        margin-bottom: 8px;
        font-size: 21px;
        line-height: 1.3;
    }

    h2 {
        margin-bottom: 7px;
        font-size: 18px;
        line-height: 1.35;
    }

    p {
        margin-bottom: 7px;
    }

    p:last-child,
    blockquote:last-child,
    ol:last-child,
    ul:last-child {
        margin-bottom: 0;
    }

    strong {
        font-weight: 700;
    }

    .vac-markdown-math {
        white-space: pre-wrap;
    }

    .vac-markdown-math-display {
        display: block;
        width: fit-content;
        max-width: 100%;
        margin: 8px auto;
    }

    .vac-markdown-colorbox {
        display: inline-block;
        padding: 0.35em 0.85em;
        border-radius: 2px;
    }

    .vac-markdown-latex-tiny {
        font-size: 0.7em;
        line-height: 1.2;
    }

    .vac-markdown-underline {
        text-decoration: underline;
        text-underline-offset: 2px;
    }

    a {
        color: #1689e8;
        text-decoration: none;
        cursor: pointer;

        &:hover {
            text-decoration: underline;
        }
    }

    blockquote {
        margin-right: 0;
        margin-bottom: 9px;
        margin-left: 0;
        padding-left: 11px;
        border-left: 3px solid color-mix(in srgb, currentColor 20%, transparent);

        p {
            margin-bottom: 0;
        }
    }

    ol,
    ul {
        margin-bottom: 8px;
        padding-left: 1.7em;
    }

    li {
        margin: 2px 0;

        > ol,
        > ul {
            margin-top: 2px;
            margin-bottom: 2px;
        }
    }

    hr {
        height: 1px;
        margin: 10px 0;
        border: 0;
        background: color-mix(in srgb, currentColor 18%, transparent);
    }

    .vac-markdown-code-container {
        position: relative;
        width: 100%;
        min-width: 0;
        max-width: 100%;
        margin: 8px 0;
    }

    .vac-markdown-code-block {
        width: 100%;
        min-width: 0;
        max-width: 100%;
        max-height: min(480px, 60vh);
        margin: 0;
        padding: 34px 12px 10px;
        overflow: auto;
        border-radius: 5px;
        box-sizing: border-box;
        background: color-mix(in srgb, currentColor 8%, transparent);
        font-family: Consolas, 'Cascadia Mono', 'Microsoft YaHei Mono', monospace;
        font-size: 13px;
        line-height: 1.45;
        scrollbar-color: color-mix(in srgb, currentColor 24%, transparent) transparent;
        scrollbar-width: thin;
        tab-size: 4;
        white-space: pre;

        &::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }

        &::-webkit-scrollbar-track {
            background: transparent;
        }

        &::-webkit-scrollbar-thumb {
            border-radius: 8px;
            background: color-mix(in srgb, currentColor 24%, transparent);
        }

        code {
            display: block;
            width: max-content;
            min-width: 100%;
            font: inherit;
            white-space: inherit;
        }
    }

    .vac-markdown-code-copy {
        position: absolute;
        z-index: 1;
        top: 6px;
        right: 6px;
        height: 24px;
        padding: 0 8px;
        border: 0;
        border-radius: 4px;
        background: color-mix(in srgb, currentColor 10%, transparent);
        color: inherit;
        font-size: 12px;
        cursor: pointer;

        &:hover {
            background: color-mix(in srgb, currentColor 16%, transparent);
        }
    }

    .vac-markdown-spacer {
        height: 0.75em;
    }

    .vac-markdown-image-wrap,
    .vac-markdown-hidden-image {
        display: block;
        width: fit-content;
        max-width: min(460px, 30vw);
        margin: 7px 0 10px;
    }

    .vac-markdown-hidden-image summary {
        width: fit-content;
        cursor: pointer;
        font-size: 13px;
        opacity: 0.75;
    }

    .vac-markdown-image {
        display: block;
        max-width: 100%;
        height: auto;
        border-radius: 5px;
        object-fit: contain;
        cursor: pointer;
    }

    .vac-markdown-image-alt {
        opacity: 0.7;
    }

    .vac-markdown-action {
        margin: 8px 0;

        > a {
            display: flex;
            min-height: 38px;
            padding: 5px 12px;
            align-items: center;
            justify-content: center;
            border: 1px solid #1689e8;
            border-radius: 5px;
            box-sizing: border-box;
            text-align: center;

            &:hover {
                background: rgba(22, 137, 232, 0.08);
                text-decoration: none;
            }
        }
    }
}
</style>
