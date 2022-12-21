<template>
    <div class="root">
        <div class="head">
            <el-popover placement="right-end" :title="username" trigger="hover" :content="`${account}`">
                <a slot="reference" @click="$emit('chroom', account)" style="cursor: pointer">
                    <el-avatar :src="getAvatarUrl(account)" />
                </a>
            </el-popover>
            <el-input class="more input" v-model="input" placeholder="Search" prefix-icon="el-icon-search" clearable />
            <span class="more el-icon-user icon-button" @click="$emit('show-contacts')"></span>
            <span class="more el-icon-delete icon-button" @click="clearRooms"></span>
        </div>
        <div class="content">
            <RoomEntry
                v-for="room in sortedRooms"
                :key="room.roomId"
                :room="room"
                :selected="room.roomId === selected.roomId"
                :priority="priority"
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

let clearRoomsBehavior

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
    },
    data() {
        return {
            input: '',
        }
    },
    methods: {
        roomMenu(room) {
            ipc.popupRoomMenu(room.roomId)
        },
        async clearRooms() {
            console.log(this.rooms)
            console.log(clearRoomsBehavior)
            const now = Date.now()
            this.rooms.forEach((r) => {
                if (
                    (clearRoomsBehavior === '1HourAgo' && now - r.utime > 3600000) ||
                    (clearRoomsBehavior === '1DayAgo' && now - r.utime > 86400000) ||
                    (clearRoomsBehavior === '1WeekAgo' && now - r.utime > 604800000) ||
                    (clearRoomsBehavior === 'AllUnpined' && !r.index)
                )
                    ipc.removeChat(r.roomId)
            })
        },
        getAvatarUrl,
    },
    async created() {
        clearRoomsBehavior = await ipcRenderer.invoke('getClearRoomsBehavior')

        ipcRenderer.on('setClearRoomsBehavior', (_, behavior) => {
            clearRoomsBehavior = behavior
        })
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
