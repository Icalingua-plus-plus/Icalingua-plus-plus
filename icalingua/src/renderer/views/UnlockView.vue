<template>
    <div class="root">
        <el-input type="password" placeholder="口令" v-model="password" @keydown.enter.native="unlock" />
        <p :class="state">{{ displayState }}</p>
        <el-button @click="unlock">解锁</el-button>
    </div>
</template>

<script>
import ipc from '../utils/ipc'
import { createRendererLifecycleScope } from '../utils/rendererLifecycleScope'

const displayStates = {
    failed: '解锁失败',
    succeeded: '解锁成功',
    none: '',
}

export default {
    data() {
        return {
            password: '',
            state: 'none',
        }
    },
    created() {
        this.lifecycleScope = createRendererLifecycleScope()
        document.title = 'Icalingua++ 已锁定'
        this.lifecycleScope.onIpc('unlock-fail', () => {
            this.state = 'failed'
        })
        this.lifecycleScope.onIpc('unlock-succeed', () => {
            this.password = ''
            this.state = 'succeeded'
        })
    },
    beforeDestroy() {
        this.lifecycleScope?.dispose()
    },
    methods: {
        unlock() {
            ipc.unlock(this.password)
        },
    },
    computed: {
        displayState() {
            return displayStates[this.state]
        },
    },
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
