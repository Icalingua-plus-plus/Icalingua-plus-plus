<template>
    <div class="settings">
        <p>输入 Res ID</p>
        <el-input v-model="res" />
        <div class="dialog-footer">
            <el-button type="primary" @click="view">打开</el-button>
        </div>
    </div>
</template>

<script>
import ipc from '../utils/ipc'

export default {
    name: 'OpenForward',
    data() {
        return {
            res: '',
        }
    },
    created() {
        document.title = '查看合并转发消息'
    },
    methods: {
        view() {
            ipc.openForward(this.res)
            window.close()
        },
    },
}
</script>

<style scoped>
.settings {
    padding: 0 16px;
}

.dialog-footer {
    margin-top: 14px;
    text-align: center;
}
</style>
