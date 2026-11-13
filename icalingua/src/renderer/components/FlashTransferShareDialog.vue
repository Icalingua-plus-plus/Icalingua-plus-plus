<template>
    <el-dialog
        title="分享闪传"
        :visible="visible"
        top="5vh"
        class="dialog"
        :close-on-click-modal="!sending"
        :close-on-press-escape="!sending"
        :show-close="!sending"
        @close="close"
    >
        <TheContactsPanel
            v-if="visible"
            v-loading="sending"
            :removeGroupNameEmotes="removeGroupNameEmotes"
            @click="send"
        />
    </el-dialog>
</template>

<script>
import ipc from '../utils/ipc'
import TheContactsPanel from './TheContactsPanel.vue'
import { requestFlashTransfer } from '../utils/flashTransfer'

export default {
    name: 'FlashTransferShareDialog',
    components: { TheContactsPanel },
    props: { visible: Boolean, record: Object },
    data() {
        return { sending: false, alive: true, removeGroupNameEmotes: false }
    },
    async created() {
        try {
            const settings = await ipc.getSettings()
            if (this.alive) this.removeGroupNameEmotes = settings.removeGroupNameEmotes
        } catch (error) {
            if (this.alive) this.$message.error(error.message)
        }
    },
    beforeDestroy() {
        this.alive = false
    },
    methods: {
        close() {
            if (!this.sending) this.$emit('update:visible', false)
        },
        async send(id) {
            if (this.sending || !this.record) return
            this.sending = true
            try {
                await requestFlashTransfer({
                    action: 'send',
                    fileset_id: this.record.fileset_id,
                    target: Math.abs(id),
                    group: id < 0,
                })
                if (!this.alive) return
                this.$emit('sent', this.record)
                this.$emit('update:visible', false)
                this.$message.success('闪传已发送')
            } catch (error) {
                if (this.alive) this.$message.error(error.message)
            } finally {
                if (this.alive) this.sending = false
            }
        },
    },
}
</script>
