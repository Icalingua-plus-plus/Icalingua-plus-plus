<template>
    <div class="settings">
        <p>
            设定 <b>{{ $route.params.groupName }} ({{ gin }})</b> 中
            <b>{{ uin === 0 ? '全体成员' : $route.params.userName || '未知用户' }} ({{ uin }})</b>
            <span v-if="uin === 0">的全员禁言状态：</span>
            <span v-else>的禁言时长为：</span>
        </p>
        <el-input
            v-if="uin !== 0"
            placeholder="留空或设置0分钟取消禁言"
            v-model="muteTime"
            @input="muteTime = muteTime.replace(/[^\d]/g, '')"
        >
            <template slot="append">分钟</template>
        </el-input>
        <div v-if="uin !== 0" class="dialog-footer">
            <el-button type="danger" @click="confirm">确认</el-button>
            <el-button @click="cancel">取消</el-button>
        </div>
        <div v-else class="dialog-footer">
            <el-button type="danger" @click="setWholeBan(true)">开启全员禁言</el-button>
            <el-button @click="setWholeBan(false)">关闭全员禁言</el-button>
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
        setWholeBan(enable) {
            ipc.setGroupBan(this.gin, 0, enable ? 1 : 0)
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
