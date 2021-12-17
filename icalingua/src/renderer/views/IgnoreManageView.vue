<template>
    <div class="root">
        <div class="title">
            <p v-if="ignoredChats.length">点击可删除</p>
            <p v-else>暂无屏蔽会话</p>
        </div>
        <GroupEntry
            v-for="chat in ignoredChats"
            :key="chat.id"
            :chat="chat"
            @click="rm(chat)"
        />
    </div>
</template>

<script>
import GroupEntry from '../components/GroupEntry'
import ipc from '../utils/ipc'

export default {
    components: {
        GroupEntry,
    },
    data() {
        return {
            ignoredChats: [],
        }
    },
    name: 'IgnoreManageView',
    methods: {
        rm({id}) {
            this.ignoredChats = this.ignoredChats.filter(e => e.id !== id)
            ipc.removeIgnoredChat(id)
        },
    },
    async created() {
        document.title = '管理屏蔽的会话'
        this.ignoredChats = await ipc.getIgnoredChats()
    },
}
</script>

<style scoped>
.root {
    padding: 10px;
}
</style>
