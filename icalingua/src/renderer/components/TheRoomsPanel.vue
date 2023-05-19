<template>
    <div class="root">
        <div class="head" v-show="!roomPanelAvatarOnly || disableChatGroups">
            <el-popover
                placement="right-end"
                :title="username"
                trigger="hover"
                :content="`${account}`"
                v-if="disableChatGroups"
            >
                <a slot="reference" @click="$emit('chroom', account)" style="cursor: pointer">
                    <el-avatar :src="getAvatarUrl(account)" />
                </a>
            </el-popover>
            <el-input class="more input" v-model="input" placeholder="Search" prefix-icon="el-icon-search" clearable />
            <span class="more el-icon-user icon-button" @click="$emit('show-contacts')" title="联系人"></span>
            <span
                class="more el-icon-delete icon-button"
                @click="clearRooms"
                title="清理会话"
                v-if="clearRoomsBehavior !== 'disabled'"
            ></span>
        </div>
        <div class="content">
            <RoomEntry
                v-for="room in sortedRooms"
                :key="room.roomId"
                :room="room"
                :selected="room.roomId === selected.roomId"
                :priority="priority"
                :removeEmotes="room.roomId < 0 && removeGroupNameEmotes"
                @click="
                    input = ''
                    $emit('chroom', room)
                "
                @contextmenu="roomMenu(room)"
            />
        </div>
    </div>
</template>

<script>
import RoomEntry from './RoomEntry.vue'
import ipc from '../utils/ipc'
import { ipcRenderer } from 'electron'
import getAvatarUrl from '../../utils/getAvatarUrl'
import PinyinMatch from 'pinyin-match'

export default {
    name: 'TheRoomsPanel',
    components: { RoomEntry },
    computed: {
        sortedRooms() {
            this.input = this.input.toUpperCase()
            let tmpr = [...this.rooms]
            if (this.input)
                tmpr = tmpr.filter(
                    (e) => PinyinMatch.match(e.roomName, this.input) || String(e.roomId).includes(this.input),
                )
            return tmpr.sort((a, b) => b.index - a.index)
        },
    },
    props: {
        rooms: Array,
        selected: Object,
        priority: Number,
        account: Number,
        username: String,
        allRooms: Array,
        disableChatGroups: Boolean,
        roomPanelAvatarOnly: Boolean,
        removeGroupNameEmotes: Boolean,
    },
    data() {
        return {
            input: '',
            clearRoomsBehavior: '',
        }
    },
    methods: {
        roomMenu(room) {
            ipc.popupRoomMenu(room.roomId)
        },
        async clearRooms() {
            console.log(this.allRooms)
            console.log(this.clearRoomsBehavior)
            const now = Date.now()
            this.allRooms.forEach((r) => {
                if (
                    (this.clearRoomsBehavior === '1HourAgo' && now - r.utime > 3600000) ||
                    (this.clearRoomsBehavior === '1DayAgo' && now - r.utime > 86400000) ||
                    (this.clearRoomsBehavior === '1WeekAgo' && now - r.utime > 604800000) ||
                    (this.clearRoomsBehavior === 'AllUnpined' && !r.index)
                )
                    ipc.removeChat(r.roomId)
            })
        },
        getAvatarUrl,
    },
    async created() {
        this.clearRoomsBehavior = await ipcRenderer.invoke('getClearRoomsBehavior')

        ipcRenderer.on('setClearRoomsBehavior', (_, behavior) => {
            this.clearRoomsBehavior = behavior
        })
    },
    watch: {
        sortedRooms: {
            handler() {
                this.$emit('update-sorted-rooms', this.sortedRooms)
            },
            immediate: true,
        },
    },
}
</script>

<style scoped lang="scss">
.root {
    border-right: var(--chat-border-style);
    height: 100vh;
    display: flex;
    flex-direction: column;
}

.head {
    background-color: var(--panel-header-bg);
    height: 64px;
    min-height: 64px;
    display: flex;
    align-items: center;
    padding: 0 10px;
}

.rooms-panel.avatar-only .head {
    padding: 0 17px;
}

.rooms-panel.avatar-only .more {
    display: none;
}

.content {
    overflow: overlay;
}

.input {
    margin-left: 10px;
}
</style>
