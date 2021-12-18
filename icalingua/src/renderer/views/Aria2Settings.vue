<template>
    <div class="settings">
        <el-form v-model="aria2" label-width="50px">
            <el-form-item label="启用">
                <el-switch v-model="aria2.enabled" />
            </el-form-item>
            <el-form-item label="主机">
                <el-input v-model="aria2.host" />
            </el-form-item>
            <el-form-item label="端口">
                <el-input-number v-model.number="aria2.port" />
            </el-form-item>
            <el-form-item label="安全">
                <el-switch v-model="aria2.secure" />
            </el-form-item>
            <el-form-item label="密钥">
                <el-input v-model="aria2.secret" />
            </el-form-item>
            <el-form-item label="路径">
                <el-input v-model="aria2.path" />
            </el-form-item>
        </el-form>
        <div slot="footer" class="dialog-footer">
            <el-button type="primary" @click="closeAria">保存</el-button>
        </div>
    </div>
</template>

<script>
import ipc from '../utils/ipc'

export default {
    name: 'Aria2Settings',
    data() {
        return {
            /**
             * @type Aria2Config
             */
            aria2: null,
        }
    },
    async created() {
        document.title = 'Aria2 下载管理器设置'
        this.aria2 = await ipc.getAria2Settings()
    },
    methods: {
        closeAria() {
            ipc.setAria2Config(this.aria2)
            window.close()
        },
    },
}
</script>

<style scoped>
.settings {
    padding: 16px
}

.dialog-footer {
    text-align: center
}
</style>
