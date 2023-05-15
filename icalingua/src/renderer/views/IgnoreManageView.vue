<template>
    <div class="root">
        <div class="title">
            <p v-if="ignoredChats.length" style="text-align: center">点击可删除</p>
            <p v-else style="text-align: center">暂无屏蔽会话</p>
        </div>
        <div class="groups">
            <b v-if="ignoredGroups.length">群组</b>
            <GroupEntry
                v-for="chat in ignoredGroups"
                :key="chat.id"
                :chat="chat"
                :removeEmotes="removeGroupNameEmotes"
                @click="rm(chat)"
            />
        </div>
        <div class="friends">
            <b v-if="ignoredFriends.length">好友</b>
            <GroupEntry v-for="chat in ignoredFriends" :key="chat.id" :chat="chat" @click="rm(chat)" />
        </div>
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
            removeGroupNameEmotes: false,
        }
    },
    computed: {
        ignoredFriends() {
            return this.ignoredChats.filter((chat) => chat.id > 0)
        },
        ignoredGroups() {
            return this.ignoredChats.filter((chat) => chat.id < 0)
        },
    },
    name: 'IgnoreManageView',
    methods: {
        rm({ id }) {
            this.ignoredChats = this.ignoredChats.filter((e) => e.id !== id)
            ipc.removeIgnoredChat(id)
        },
    },
    async created() {
        document.title = '管理屏蔽的会话'
        this.ignoredChats = await ipc.getIgnoredChats()
        this.removeGroupNameEmotes = (await ipc.getSettings()).removeGroupNameEmotes
    },
}
</script>

<style scoped>
.root {
    padding: 10px;
}
</style>
