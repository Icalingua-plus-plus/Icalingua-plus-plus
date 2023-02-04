<template>
    <div class="root">
        <el-input type="password" placeholder="口令" v-model="password" />
        <p :class="state">{{ displayState }}</p>
        <el-button @click="unlock">解锁</el-button>
    </div>
</template>

<script>
import { ipcRenderer } from 'electron'
import ipc from '../utils/ipc'

const displayStates = {
    failed: '解锁失败',
    succeeded: '解锁成功',
    none: ''
}

export default {
    data() {
        return {
            password: '',
            state: 'none'
        }
    },
    created() {
        document.title = 'Icalingua++ 已锁定'
    },
    methods: {
        unlock() {
            ipc.unlock(this.password)
            ipcRenderer.on('unlock-fail', () => {
                this.state = 'failed'
            })
            ipcRenderer.on('unlock-succeed', () => {
                this.password = ''
                this.state = 'succeeded'
            })
        }
    },
    computed: {
        displayState() {
            return displayStates[this.state]
        }
    }
}
</script>

<style scoped>
.root {
    margin: 10px;
    text-align: center;
}

.failed {
    color: red;
}
.succeeded {
    color: greenyellow;
}
</style>
