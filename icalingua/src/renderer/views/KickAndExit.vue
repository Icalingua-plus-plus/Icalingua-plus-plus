<template>
    <div class="settings">
        <p v-if="this.$route.params.action==='kick'">
            在 <b>{{ $route.params.groupName }}</b> 中踢出
            <b>{{ $route.params.userName }} ({{ uin }})</b>？
        </p>
        <p v-if="this.$route.params.action==='exit'">
            确认退出 <b>{{ $route.params.groupName }}</b>？
        </p>
        <p v-if="this.$route.params.action==='dismiss'">
            确认解散 <b>{{ $route.params.groupName }}</b>？
        </p>
        <div class="dialog-footer">
            <el-button type="danger" @click="confirm">确认</el-button>
            <el-button @click="cancel">取消</el-button>
        </div>
    </div>
</template>

<script>
import ipc from '../utils/ipc'

export default {
    name: 'KickAndExit',
    data() {
        return {
            uin: 0,
            gin: 0,
        }
    },
    created() {
        document.title = '操作确认'
        this.gin = Number(this.$route.params.gin)
        this.uin = Number(this.$route.params.uin)
    },
    methods: {
        confirm() {
            if (this.$route.params.action === 'kick') {
                ipc.setGroupKick(this.gin, this.uin)
            }
            else {
                ipc.setGroupLeave(this.gin)
            }
            window.close()
        },
        cancel() {
            window.close()
        },
    },
}
</script>

<style scoped>
.settings {
    padding: 0 16px
}

.dialog-footer {
    text-align: center;
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    margin: auto;
    padding-bottom: 20px;
}
</style>
