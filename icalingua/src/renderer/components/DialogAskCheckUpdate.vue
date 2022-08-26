<template>
    <el-dialog
        title="是否需要自动检查更新"
        :visible="show"
        width="50%"
        :close-on-click-modal="false"
        :close-on-press-escape="false"
        :show-close="false"
    >
        <p>开启后，将在登录之后从 GitHub Release 获取最新的版本信息</p>
        <p>以后可以从选项菜单更改此选项</p>
        <span slot="footer" class="dialog-footer">
            <el-button @click="save(true)"> 是 </el-button>
            <el-button @click="save(false)"> 否 </el-button>
        </span>
    </el-dialog>
</template>

<script>
import ipc from '../utils/ipc'

export default {
    name: 'DialogAskCheckUpdate',
    props: {
        show: Boolean,
    },
    methods: {
        save(enabled) {
            ipc.setCheckUpdate(enabled)
            this.$emit('update:show', false)
        },
    },
}
</script>
