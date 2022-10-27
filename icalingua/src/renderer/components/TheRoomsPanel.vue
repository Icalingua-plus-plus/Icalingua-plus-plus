<template>
    <div class="root">
        <div class="head">
            <el-popover placement="right-end" :title="username" trigger="hover" :content="`${account}`">
                <a slot="reference" @click="$emit('chroom', account)" style="cursor: pointer">
                    <el-avatar :src="getAvatarUrl(account)" />
                </a>
            </el-popover>
            <el-input class="more input" v-model="input" placeholder="Search" prefix-icon="el-icon-search" clearable />
            <span class="more el-icon-user contacts-refresh" @click="$emit('show-contacts')" />
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

<script type="ts">
import RoomEntry from './RoomEntry.vue'
import ipc from '../utils/ipc'
import getAvatarUrl from '../../utils/getAvatarUrl'

export default {
    name: 'TheRoomsPanel',
    components: {RoomEntry},
    computed: {
        sortedRooms() {
            this.input = this.input.toUpperCase()
            let tmpr = [...this.rooms]
            if (this.input)
                tmpr = tmpr.filter(
                    (e) =>
                        e.roomName.toUpperCase().includes(this.input) ||
                        String(e.roomId).includes(this.input),
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
        getAvatarUrl
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
