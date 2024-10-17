<template>
    <div style="overflow-x: hidden" ondragstart="return false">
        <h1 style="text-align: center">登录设备管理</h1>
        <h3 v-if="!devices.length" style="text-align: center">获取已登录的设备列表失败</h3>
        <div class="item" v-for="item in devices" :key="item.flag">
            <div class="info">
                <div style="flex-direction: column">
                    <div>
                        <span>{{ item.name }} ({{ item.model }})</span>
                    </div>
                    <div>
                        <span>{{ dateFormat(item.time) }}</span>
                    </div>
                    <div>
                        <span> {{ item.location }} | {{ item.self ? '本机' : item.online ? '在线' : '离线' }} </span>
                    </div>
                </div>
            </div>
            <el-button-group>
                <el-button v-if="!item.self" @click="deleteDevice(item.flag)" class="el-button--danger">删除</el-button>
            </el-button-group>
        </div>
    </div>
</template>

<script>
import ipc from '../utils/ipc'
import { ipcRenderer } from 'electron'

export default {
    name: 'DeviceManager',
    data: function () {
        return {
            devices: [],
        }
    },

    async created() {
        document.title = '登录设备管理'
        this.devices = await ipc.getLoginDevices()
        console.log(this.devices)
    },

    methods: {
        deleteDevice(flag) {
            //警告是否删除
            this.$confirm('删除设备后，该设备登录需要重新进行验证, 是否确认删除?', '警告', {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning',
            })
                .then(() => {
                    ipc.deleteLoginDevice(flag)
                    this.devices = this.devices.filter((item) => item.flag !== flag)
                })
                .catch(() => {})
        },
        dateFormat(timestamp) {
            const date = new Date(timestamp * 1000)
            return `${date.getFullYear()}-${
                date.getMonth() + 1
            }-${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`
        },
    },
}
</script>

<style scoped lang="scss">
span {
    margin: 0 6px;
}

.item {
    display: flex;
    margin: 0 20px;
    padding: 10px 0;
    align-items: center;

    &:not(:last-child) {
        border-bottom: 1px solid #e4e7ed;
    }
}

.info {
    display: flex;
    margin-right: 20px;
    flex-grow: 1;
}
</style>
