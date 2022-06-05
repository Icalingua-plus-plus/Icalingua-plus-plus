<template>
    <transition name="vac-slide-up">
        <div v-if="showForwardPanel" class="vac-forward-container">
            <div class="vac-forward-box">
                <el-button-group
                    title="发送到群聊请选择群聊模式，发送到私聊请选择私聊模式，否则部分客户端无法加载图片。"
                >
                    <el-button type="primary" @click="stopForward(true, false)" :disabled="msgstoForward.length === 0"
                        >合并转发 {{ msgstoForward.length }} 条消息(群聊模式)</el-button
                    >
                    <el-button type="primary" @click="stopForward(true, true)" :disabled="msgstoForward.length === 0"
                        >(私聊模式)</el-button
                    >
                </el-button-group>
            </div>

            <div class="vac-icon-forward">
                <div class="vac-svg-button" @click="stopForward(false, false)">
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
        stopForward(isCreate, dm) {
            if (isCreate) {
                if (this.msgstoForward.length <= 0) {
                    console.log('No Message Selected.')
                    return
                }
                const ForwardMessages = []

                this.messages.forEach((message) => {
                    this.msgstoForward.forEach((msgId) => {
                        if (message._id === msgId) {
                            ForwardMessages.push(message)
                        }
                    })
                })
                const TextMessages = []
                ForwardMessages.forEach((msg) => {
                    const singleMessage = {
                        user_id: 0,
                        message: [],
                        nickname: '',
                        time: 0,
                    }
                    if (msg) {
                        singleMessage.user_id = msg.senderId
                        singleMessage.message.push({
                            type: 'text',
                            data: {
                                text: msg.content,
                            },
                        })
                        if (msg.files) {
                            msg.files.forEach((file) => {
                                if (file.type.startsWith('image/'))
                                    singleMessage.message.push({
                                        type: 'image',
                                        data: {
                                            file: file.url.startsWith('data:image\\') ? 'base64://' + file.url.replace(/^data:.+;base64,/, '') :file.url,
                                            type: 'image',
                                        },
                                    })
                            })
                        }
                        singleMessage.nickname = msg.senderId !== this.account ? msg.username : this.username
                        singleMessage.time = Math.floor(msg.time / 1000)
                        TextMessages.push(singleMessage)
                    }
                })
                if (typeof this.roomId !== 'string' && this.roomId < 0) {
                    ipc.makeForward(TextMessages, dm, -this.roomId)
                } else if (typeof this.roomId === 'string') {
                    ipc.makeForward(TextMessages, dm, Math.abs(parseInt(this.roomId)))
                } else {
                    ipc.makeForward(TextMessages, dm)
                }
            }
            this.$emit('close-forward-panel')
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
