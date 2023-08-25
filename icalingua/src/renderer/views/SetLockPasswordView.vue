<template>
    <div class="root">
        <el-input type="password" placeholder="口令" v-model="password" />
        <p :class="state">{{ displayState }}</p>
        <p><el-input type="checkbox"/ v-model="hashLockPassword">加密存储</p>
        <el-button @click="confirm" :disabled="!password">设置口令</el-button>
    </div>
</template>

<script>
import ipc from '../utils/ipc'

export default {
    data() {
        return {
            password: '',
            hashLockPassword: true,
        }
    },
    created() {
        document.title = '设置锁定口令'
    },
    methods: {
        confirm() {
            ipc.setLockPassword(this.password, this.hashLockPassword)
            window.close()
        },
    },
}
</script>

<style scoped>
.root {
    margin: 10px;
    text-align: center;
}
</style>
