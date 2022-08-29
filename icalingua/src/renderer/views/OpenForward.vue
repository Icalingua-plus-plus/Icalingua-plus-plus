<template>
    <div class="settings">
        <p>输入 Res ID 和 m_fileName</p>
        <el-input placeholder="Res ID" v-model="res" />
        <el-input placeholder="m_fileName" v-model="m_fileName" />
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
            m_fileName: '',
        }
    },
    created() {
        document.title = '查看合并转发消息'
    },
    methods: {
        view() {
            ipc.openForward(this.res, this.m_fileName)
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
