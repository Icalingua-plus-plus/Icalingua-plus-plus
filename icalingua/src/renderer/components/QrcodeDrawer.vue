<template>
    <el-drawer
        title="二维码登录 扫码设备需与登录设备同一个网络"
        :visible="drawerVisible"
        direction="btt"
        :close-on-press-escape="false"
        :show-close="false"
        :wrapper-closable="false"
        size="100%"
    >
        <img :src="image" alt="" />
        <center>
            <el-button @click="$emit('login')" type="primary"> 已扫码 </el-button>
        </center>
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
