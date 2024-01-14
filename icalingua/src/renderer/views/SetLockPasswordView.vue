<template>
    <div class="root">
        <el-input type="password" placeholder="口令" v-model="password" />
        <p :class="state">{{ displayState }}</p>
        <el-button @click="close">关闭</el-button>
        <el-button @click="confirm" :disabled="!password" type="primary">设置口令</el-button>
    </div>
</template>

<script>
import ipc from '../utils/ipc'

export default {
    data() {
        return {
            password: '',
        }
    },
    created() {
        document.title = '设置锁定口令'
    },
    methods: {
        confirm() {
            ipc.setLockPassword(this.password)
            window.close()
        },
        close() {
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
