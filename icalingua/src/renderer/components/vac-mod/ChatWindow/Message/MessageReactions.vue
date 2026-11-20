<template>
    <div class="vac-message-reactions" :class="{ 'vac-reactions-end': alignEnd }" aria-label="表情回应">
        <span
            v-for="reaction in visibleReactions"
            :key="reaction.type + ':' + reaction.id"
            class="vac-reaction"
            :class="{ 'vac-reaction-selected': reaction.is_clicked }"
            :title="reaction.label + ' · ' + reaction.count + ' 人' + (reaction.is_clicked ? '（你也贴了）' : '')"
        >
            <img
                v-if="reaction.url"
                class="vac-reaction-face"
                :src="reaction.url"
                :alt="reaction.label"
                draggable="false"
            />
            <span v-else class="vac-reaction-emoji">{{ reaction.label }}</span>
            <span class="vac-reaction-count">{{ reaction.count }}</span>
        </span>
    </div>
</template>

<script>
import faceNames from '../../../../../../static/faceNames'

const path = require('path')
const faceLabels = new Map(faceNames.map(([name, id]) => [id, name]))

export default {
    name: 'MessageReactions',
    props: {
        reactions: { type: Array, required: true },
        alignEnd: { type: Boolean, default: false },
    },
    computed: {
        visibleReactions() {
            return this.reactions
                .filter(({ type, count }) => count > 0 && (type === 1 || type === 2))
                .map((reaction) => {
                    const { id, type } = reaction
                    if (type === 1 && /^\d+$/.test(id)) {
                        const face = String(Number(id)).padStart(3, '0')
                        return {
                            ...reaction,
                            label: faceLabels.get(face) || 'QQ 表情 ' + id,
                            url: 'file://' + path.join(__static, 'face', face),
                        }
                    }

                    const code = Number(id)
                    const label =
                        type === 2 &&
                        /^\d+$/.test(id) &&
                        code > 0 &&
                        code <= 0x10ffff &&
                        (code < 0xd800 || code > 0xdfff)
                            ? String.fromCodePoint(code)
                            : id
                    return { ...reaction, label }
                })
        },
    },
}
</script>

<style scoped>
.vac-message-reactions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 5px;
}

.vac-reactions-end {
    justify-content: flex-end;
}

.vac-reaction {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 7px;
    min-height: 22px;
    border: var(--chat-message-border-style-reaction, 1px solid transparent);
    border-radius: 12px;
    background: var(--chat-message-bg-color-reaction, var(--chat-message-bg-color));
    color: var(--chat-message-color-reaction-counter, var(--chat-message-color));
    font-size: 12px;
    line-height: 1;
    user-select: none;
}

.vac-reaction-selected {
    border: var(--chat-message-border-style-reaction-me, 1px solid #409eff);
    background: var(--chat-message-bg-color-reaction-me, var(--chat-message-bg-color-me));
    color: var(--chat-message-color-reaction-counter-me, var(--chat-message-color));
}

.vac-reaction-face {
    width: 16px;
    height: 16px;
    object-fit: contain;
}

.vac-reaction-emoji {
    font-size: 14px;
}

.vac-reaction-count {
    font-variant-numeric: tabular-nums;
}
</style>
