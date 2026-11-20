<template>
    <div class="vac-message-reactions" :class="{ 'vac-reactions-end': alignEnd }" aria-label="表情回应">
        <component
            v-for="reaction in visibleReactions"
            :is="interactive ? 'button' : 'span'"
            :key="reaction.type + ':' + reaction.id"
            class="vac-reaction"
            :class="{ 'vac-reaction-selected': reaction.is_clicked, 'vac-reaction-button': interactive }"
            :type="interactive ? 'button' : null"
            :aria-pressed="interactive ? String(reaction.is_clicked) : null"
            @click="interactive && $emit('toggle', reaction)"
            @dblclick.stop
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
        </component>
    </div>
</template>

<script>
import { describeReaction } from '@/utils/reactionEmoji'

export default {
    name: 'MessageReactions',
    props: {
        reactions: { type: Array, required: true },
        alignEnd: { type: Boolean, default: false },
        interactive: { type: Boolean, default: false },
    },
    computed: {
        visibleReactions() {
            return this.reactions
                .filter(({ type, count }) => count > 0 && (type === 1 || type === 2))
                .map((reaction) => ({ ...reaction, ...describeReaction(reaction.id, reaction.type) }))
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

.vac-reaction-button {
    cursor: pointer;
    font-family: inherit;
}

.vac-reaction-button:hover,
.vac-reaction-button:focus-visible {
    background: var(--chat-message-bg-color-reaction-hover, var(--chat-message-bg-color-reaction));
    border: var(--chat-message-border-style-reaction-hover, var(--chat-message-border-style-reaction));
}

.vac-reaction-selected {
    border: var(--chat-message-border-style-reaction-me, 1px solid #409eff);
    background: var(--chat-message-bg-color-reaction-me, var(--chat-message-bg-color-me));
    color: var(--chat-message-color-reaction-counter-me, var(--chat-message-color));
}

.vac-reaction-button.vac-reaction-selected:hover,
.vac-reaction-button.vac-reaction-selected:focus-visible {
    background: var(--chat-message-bg-color-reaction-hover-me, var(--chat-message-bg-color-reaction-me));
    border: var(--chat-message-border-style-reaction-hover-me, var(--chat-message-border-style-reaction-me));
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
    text-box: trim-both cap alphabetic;
}
</style>
