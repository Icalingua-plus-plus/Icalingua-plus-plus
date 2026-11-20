<template>
    <el-popover
        v-model="open"
        trigger="click"
        placement="bottom-start"
        :width="288"
        :tabindex="-1"
        :visible-arrow="false"
        @hide="$emit('close')"
    >
        <span slot="reference" class="reaction-anchor" :style="{ left: x + 'px', top: y + 'px' }" />
        <div ref="panel" tabindex="-1" class="reaction-picker" @keydown.esc.stop.prevent="$emit('close')">
            <el-tabs v-model="tab" stretch>
                <el-tab-pane label="QQ 表情" name="qq" />
                <el-tab-pane label="Emoji" name="emoji" />
            </el-tabs>
            <div :key="tab" class="reaction-grid">
                <button
                    v-for="item in choices"
                    :key="item.id"
                    type="button"
                    class="reaction-option"
                    :class="{ 'reaction-option-selected': selected.has(item.id) }"
                    :aria-label="item.label"
                    :aria-pressed="String(selected.has(item.id))"
                    :title="item.label"
                    @click="$emit('pick', item)"
                >
                    <img v-if="item.url" :src="item.url" alt="" draggable="false" loading="lazy" decoding="async" />
                    <span v-else>{{ item.label }}</span>
                </button>
            </div>
        </div>
    </el-popover>
</template>

<script>
import { describeReaction, qqReactionFaceIds, unicodeReactionIds } from '@/utils/reactionEmoji'

export default {
    name: 'MessageReactionPicker',
    props: {
        x: { type: Number, required: true },
        y: { type: Number, required: true },
        reactions: { type: Array, default: () => [] },
    },
    data() {
        return { open: false, tab: 'qq' }
    },
    computed: {
        type() {
            return this.tab === 'qq' ? 1 : 2
        },
        choices() {
            const ids = this.type === 1 ? qqReactionFaceIds : unicodeReactionIds
            return ids.map((id) => ({ id, type: this.type, ...describeReaction(id, this.type) }))
        },
        selected() {
            return new Set(
                this.reactions.filter((item) => item.type === this.type && item.is_clicked).map((item) => item.id),
            )
        },
    },
    mounted() {
        this.open = true
        this.$nextTick(() => this.$refs.panel?.focus())
    },
}
</script>

<style scoped>
.reaction-anchor {
    position: fixed;
    pointer-events: none;
}

.reaction-picker {
    outline: none;
}

.reaction-picker ::v-deep .el-tabs__header {
    margin-bottom: 6px;
}

.reaction-picker ::v-deep .el-tabs__item {
    padding: 0;
}

.reaction-grid {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    max-height: min(218px, 55vh);
    overflow: auto;
}

.reaction-option {
    display: grid;
    place-items: center;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font-size: 19px;
    cursor: pointer;
}

.reaction-option:hover,
.reaction-option:focus-visible,
.reaction-option-selected {
    background: var(--chat-message-bg-color-reaction-me, rgba(64, 158, 255, 0.18));
}

.reaction-option img {
    width: 22px;
    height: 22px;
    object-fit: contain;
}
</style>
