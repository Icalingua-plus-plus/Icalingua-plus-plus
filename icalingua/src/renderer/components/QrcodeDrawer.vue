<template>
    <el-drawer
        title="二维码登录"
        :visible="drawerVisible"
        direction="btt"
        :close-on-press-escape="false"
        :show-close="false"
        :wrapper-closable="false"
        size="100%"
    >
        <img :src="image" alt="">
    </el-drawer>
</template>

<script>
import {ipcRenderer} from 'electron'
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
        ipcRenderer.on('qrcodeLogin', async (_, uin) => {
            console.log(uin)
            const STORE_PATH = await ipc.getStorePath()
            this.image = `file://${STORE_PATH}/data/${uin}/qrcode.png`
            this.drawerVisible = true
        })
    },
}
</script>

<style scoped>

</style>
