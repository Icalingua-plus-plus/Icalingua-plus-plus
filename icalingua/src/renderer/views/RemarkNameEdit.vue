<template>
    <div class="settings">
        <p>
            修改 <b>{{ name }} ({{ uin || gin }})</b> 的备注名
        </p>
        <el-input v-model="remark" />
        <div class="dialog-footer">
            <el-button @click="remark = name">当前名称</el-button>
            <el-button type="primary" @click="save">保存</el-button>
        </div>
    </div>
</template>

<script>
import ipc from '../utils/ipc'

export default {
    name: 'RemarkNameEdit',
    data() {
        return {
            name: '',
            remark: '',
            uin: 0,
            gin: 0,
        }
    },
    created() {
        this.name = this.$route.params.name
        this.remark = this.$route.params.remark
        this.uin = Number(this.$route.params.uin)
        this.gin = Number(this.$route.params.gin)
        document.title = this.gin ? '群备注' : '好友备注'
    },
    methods: {
        save() {
            if (this.gin) {
                ipc.setGroupRemark(this.gin, this.remark)
            } else {
                ipc.setFriendRemark(this.uin, this.remark)
            }
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
