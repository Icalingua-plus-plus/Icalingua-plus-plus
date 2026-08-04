<template>
    <div
        class="vac-forward-card"
        :class="{ 'vac-forward-card-clickable': clickable }"
        :role="clickable ? 'button' : null"
        :tabindex="clickable ? 0 : -1"
        :title="preview.footer"
        @click="open"
        @keydown.enter.prevent="open"
        @keydown.space.prevent="open"
    >
        <div class="vac-forward-card-body">
            <div class="vac-forward-card-title">{{ preview.title || fallbackLabel }}</div>
            <div v-if="preview.messages.length" class="vac-forward-card-messages">
                <div v-for="(message, index) in preview.messages" :key="index" class="vac-forward-card-message">
                    {{ message }}
                </div>
            </div>
        </div>
        <div class="vac-forward-card-footer">{{ preview.footer || fallbackLabel }}</div>
    </div>
</template>

<script>
export default {
    name: 'ForwardMessageCard',

    props: {
        preview: { type: Object, required: true },
        clickable: { type: Boolean, default: true },
    },

    data() {
        return {
            fallbackLabel: '聊天记录',
        }
    },

    methods: {
        open() {
            if (this.clickable) this.$emit('open')
        },
    },
}
</script>

<style lang="scss" scoped>
.vac-forward-card {
    display: block;
    width: 360px;
    max-width: 100%;
    margin: 2px 0 3px;
    padding: 0;
    overflow: hidden;
    background: var(--chat-message-bg-color-media, rgba(0, 0, 0, 0.06));
    color: var(--chat-message-color, inherit);
    text-align: left;
    border: 0;
    border-radius: 9px;
    box-shadow:
        0 1px 1px -1px rgba(0, 0, 0, 0.1),
        0 1px 2px -1px rgba(0, 0, 0, 0.14);
    box-sizing: border-box;
    font: inherit;
    user-select: none;
}

.vac-forward-card-clickable {
    cursor: pointer;
    transition:
        transform 160ms ease,
        box-shadow 160ms ease;
    will-change: transform;
}

.vac-forward-card-clickable:hover {
    transform: translateY(-2px);
    box-shadow:
        0 4px 10px -3px rgba(0, 0, 0, 0.2),
        0 2px 4px -2px rgba(0, 0, 0, 0.16);
}

.vac-forward-card-clickable:active {
    transform: translateY(0) scale(0.99);
}

.vac-forward-card-clickable:focus-visible {
    outline: 2px solid var(--chat-border-color-input-selected, #1976d2);
    outline-offset: 2px;
}

.vac-forward-card-body {
    padding: 12px 16px 8px;
}

.vac-forward-card-title {
    overflow: hidden;
    font-size: 18px;
    font-weight: 600;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.vac-forward-card-messages {
    max-height: 5.8em;
    margin-top: 4px;
    overflow: hidden;
    color: var(--chat-message-color-forward-content, var(--chat-message-color, #666));
    font-size: 13px;
    line-height: 1.45;
    opacity: 0.62;
}

.vac-forward-card-message {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.vac-forward-card-footer {
    padding: 6px 16px 7px;
    overflow: hidden;
    color: var(--chat-message-color-forward-content, var(--chat-message-color, #666));
    font-size: 12px;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
    border-top: 1px solid color-mix(in srgb, currentColor 26%, transparent);
    opacity: 0.72;
}

@media only screen and (max-width: 768px) {
    .vac-forward-card-body {
        padding: 10px 14px 7px;
    }

    .vac-forward-card-title {
        font-size: 16px;
    }

    .vac-forward-card-messages {
        font-size: 12px;
    }

    .vac-forward-card-footer {
        padding: 5px 14px 6px;
    }
}
</style>
