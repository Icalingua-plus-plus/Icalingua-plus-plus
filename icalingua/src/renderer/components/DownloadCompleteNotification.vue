<template>
    <div class="download-complete-notification">
        <span class="download-complete-file" :title="fileName">{{ fileName }}</span>
        <el-button type="primary" size="mini" @click="$emit('open')">打开</el-button>
    </div>
</template>

<script>
export default {
    name: 'DownloadCompleteNotification',
    props: {
        fileName: { type: String, required: true },
    },
}
</script>

<style scoped>
.download-complete-notification {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-width: 0;
}

.download-complete-file {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>

<style>
.el-notification-download-complete .el-notification__group {
    flex: 1;
    min-width: 0;
}
</style>
