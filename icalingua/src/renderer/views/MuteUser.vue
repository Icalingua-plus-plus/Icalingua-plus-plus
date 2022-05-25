<template>
    <div class="settings">
        <p>
            设定 <b>{{ $route.params.groupName }} ({{ gin }})</b> 中
            <b>{{ $route.params.userName }} ({{ uin }})</b> 的禁言时长为：
        </p>
        <el-input
            placeholder="留空或设置0分钟取消禁言"
            v-model="muteTime"
            @input="muteTime = muteTime.replace(/[^\d]/g, '')"
        >
            <template slot="append">分钟</template>
        </el-input>
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
            const time = parseInt(this.muteTime) * 60 || 0
            if (this.uin != 80000000) {
                ipc.setGroupBan(this.gin, this.uin, time)
            } else {
                ipc.setGroupAnonymousBan(this.gin, this.$route.params.anonymousflag, time)
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
