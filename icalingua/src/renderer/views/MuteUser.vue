<template>
    <div class="settings">
        <p>设定 <b>{{ $route.params.groupName }} ({{ gin }})</b> 中 <b>{{ $route.params.userName }} ({{ uin }})</b> 的禁言时常为：</p>
        <el-input v-model="muteTime" @input="muteTime = muteTime.replace(/[^\d]/g,'')" />
        <p>分钟（为0分钟时取消禁言）</p>
        <div class="dialog-footer">
            <el-button type="danger" @click="confirm">确认</el-button>
            <el-button @click="cancel">取消</el-button>
        </div>
    </div>
</template>

<script>
import ipc from '../utils/ipc'

export default {
    name: 'MuteUser',
    data() {
        return {
            uin: 0,
            gin: 0,
            muteTime: '',
        }
    },
    created() {
        document.title = '操作确认'
        this.gin = Number(this.$route.params.gin)
        this.uin = Number(this.$route.params.uin)
    },
    methods: {
        confirm() {
            if(this.muteTime != ''){
                ipc.setGroupBan(this.gin, this.uin, parseInt(this.muteTime))
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
    padding: 0 16px;
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
