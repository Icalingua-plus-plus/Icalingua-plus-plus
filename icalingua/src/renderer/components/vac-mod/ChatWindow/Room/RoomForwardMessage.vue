<template>
    <transition name="vac-slide-up">
        <div v-if="showForwardPanel" class="vac-forward-container">
            <div class="vac-forward-box">
                <el-button type="primary" @click="stopForward(true)" :disabled="msgstoForward.length === 0"
                    >合并转发 {{ msgstoForward.length }} 条消息</el-button
                >
                <el-button type="primary" @click="recallMsgs" :disabled="msgstoForward.length === 0"
                    >撤回 {{ msgstoForward.length }} 条消息</el-button
                >
            </div>

            <div class="vac-icon-forward">
                <div class="vac-svg-button" @click="stopForward(false)">
                    <slot name="forward-close-icon">
                        <svg-icon name="close-outline" />
                    </slot>
                </div>
            </div>
        </div>
    </transition>
</template>

<script>
import SvgIcon from '../../components/SvgIcon'
import ipc from '../../../../utils/ipc'
export default {
    name: 'RoomForwardMessage',
    components: {
        SvgIcon,
    },

    props: {
        messages: { type: Array, required: true },
        msgstoForward: { type: Array, required: true },
        showForwardPanel: { type: Boolean, required: true },
        account: { type: Number, required: true },
        username: { type: String, required: true },
        roomId: { type: [String, Number], required: true },
    },
    methods: {
        stopForward(isCreate) {
            if (isCreate) this.$emit('choose-forward-target')
            else this.$emit('close-forward-panel')
        },
        recallMsgs() {
            this.msgstoForward.forEach((msg, index) => {
                setTimeout(() => {
                    ipc.deleteMessage(this.roomId, msg)
                }, index * 50)
            })
            this.stopForward(false)
        },
    },
}
</script>

<style lang="scss">
.vac-forward-container {
    position: relative;
    display: flex;
    padding: 10px 10px 0 10px;
    background: var(--chat-footer-bg-color);
    align-items: center;
    width: calc(100% - 20px);

    .vac-forward-box {
        width: 100%;
        overflow: hidden;
        background: var(--chat-footer-bg-color-forward);
        border-radius: 4px;
        padding: 8px 10px;
        display: flex;
    }

    .vac-forward-info {
        overflow: hidden;
    }

    .vac-forward-username {
        color: var(--chat-message-color-forward-username);
        font-size: 12px;
        line-height: 15px;
        margin-bottom: 2px;
    }

    .vac-forward-content {
        font-size: 12px;
        color: var(--chat-message-color-forward-content);
        white-space: pre-line;
    }

    .vac-icon-forward {
        margin-left: 10px;

        svg {
            height: 20px;
            width: 20px;
        }
    }

    .vac-image-forward {
        max-height: 100px;
        margin-right: 10px;
        border-radius: 4px;
    }
}

@media only screen and (max-width: 768px) {
    .vac-forward-container {
        padding: 5px 8px;
        width: calc(100% - 16px);
    }
}
</style>
