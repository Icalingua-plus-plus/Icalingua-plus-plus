<template>
    <el-drawer
        class="qrcode-drawer"
        title="二维码登录"
        :visible="drawerVisible"
        direction="btt"
        :close-on-press-escape="false"
        :show-close="false"
        :wrapper-closable="false"
        size="100%"
    >
        <p>扫码设备需与登录设备同一个网络</p>
        <img :src="image" alt="" />
        <el-button @click="$emit('login')" type="primary">已扫码</el-button>
    </el-drawer>
</template>

<script>
import { ipcRenderer } from 'electron'
import ipc from '../utils/ipc'

export default {
    name: 'QrcodeDrawer',
    data() {
        return {
            drawerVisible: false,
            image: '',
        }
    },
    created() {
        ipcRenderer.on('qrcodeLogin', async (_, url) => {
            console.log(url)
            this.image = url
            this.drawerVisible = true
        })
    },
}
</script>

<style scoped>
.qrcode-drawer {
    text-align: center;
}

.qrcode-drawer :deep(.el-drawer__body) {
    padding: 0 20px 20px;
}

.qrcode-drawer p {
    margin: 0 0 15px;
}

.qrcode-drawer img {
    display: block;
    margin: 0 auto 15px;
}
</style>
