<template>
    <div class="settings">
        <p>
            修改我在 <b>{{ groupName }}</b> 的群昵称
        </p>
        <el-input v-model="nick" />
        <div class="dialog-footer">
            <el-button type="primary" @click="save">保存</el-button>
        </div>
    </div>
</template>

<script>
import ipc from '../utils/ipc'

export default {
    name: 'GroupNickEdit',
    data() {
        return {
            groupName: '',
            nick: '',
            gin: 0,
        }
    },
    created() {
        document.title = '群昵称'
        this.groupName = this.$route.params.gn
        this.nick = this.$route.params.nick
        this.gin = Number(this.$route.params.gin)
    },
    methods: {
        save() {
            ipc.setGroupNick(this.gin, this.nick)
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
