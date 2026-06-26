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
        <div class="content" ref="scrollContainer" @scroll="onScroll">
            <div :style="{ height: totalHeight + 'px', position: 'relative' }">
                <div
                    :style="{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${offsetY}px)` }"
                >
                    <RoomEntry
                        v-for="room in visibleRooms"
                        :key="room.roomId"
                        :room="room"
                        :selected="room.roomId === selected.roomId"
                        :priority="priority"
                        :removeEmotes="room.roomId < 0 && removeGroupNameEmotes"
                        :usePanguJs="usePanguJs"
                        @click="
                            input = ''
                            $emit('chroom', room)
                        "
                        @dblclick="openInNewWindow(room)"
                        @contextmenu="roomMenu(room, $event)"
                    />
                </div>
            </div>
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
        totalHeight() {
            return this.sortedRooms.length * this.itemHeight
        },
        visibleRooms() {
            const h = this.containerHeight || window.innerHeight
            const start = Math.max(0, Math.floor(this.scrollTop / this.itemHeight) - this.bufferSize)
            const end = Math.min(
                this.sortedRooms.length,
                Math.ceil((this.scrollTop + h) / this.itemHeight) + this.bufferSize,
            )
            return this.sortedRooms.slice(start, end)
        },
        offsetY() {
            const start = Math.max(0, Math.floor(this.scrollTop / this.itemHeight) - this.bufferSize)
            return start * this.itemHeight
        },
        sortedRooms() {
            this.input = this.input.toUpperCase()
            let tmpr = [...this.rooms]
            if (this.input)
                tmpr = tmpr.filter(
                    (e) => PinyinMatch.match(e.roomName, this.input) || String(e.roomId).includes(this.input),
                )
            tmpr = tmpr.sort((a, b) => b.index - a.index)
            if (this.sortRoomsByPriority) {
                tmpr = [
                    ...tmpr.filter((e) => e.index),
                    ...tmpr.filter((e) => !e.index && e.priority === 5),
                    ...tmpr.filter((e) => !e.index && e.priority === 4),
                    ...tmpr.filter((e) => !e.index && e.priority === 3),
                    ...tmpr.filter((e) => !e.index && e.priority === 2),
                    ...tmpr.filter((e) => !e.index && e.priority === 1),
                ]
            }
            return tmpr
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
        usePanguJs: Boolean,
    },
    data() {
        return {
            input: '',
            clearRoomsBehavior: '',
            sortRoomsByPriority: false,
            // 虚拟滚动
            scrollTop: 0,
            containerHeight: 0,
            itemHeight: 70, // RoomEntry 固定高度
            bufferSize: 5, // 上下额外渲染的条目数
        }
    },
    methods: {
        onScroll(e) {
            this.scrollTop = e.target.scrollTop
        },
        roomMenu(room, e) {
            ipc.popupRoomMenu(room.roomId, e)
        },
        openInNewWindow(room) {
            ipc.openRoomInNewWindow(room.roomId)
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
        this.sortRoomsByPriority = (await ipc.getSettings()).sortRoomsByPriority || false
        ipcRenderer.on('setSortRoomsByPriority', (_, sortRoomsByPriority) => {
            this.sortRoomsByPriority = sortRoomsByPriority
        })

        ipcRenderer.on('setClearRoomsBehavior', (_, behavior) => {
            this.clearRoomsBehavior = behavior
        })
    },
    mounted() {
        // 虚拟滚动：DOM 就绪后初始化容器高度并监听大小变化
        this._updateContainerHeight = () => {
            if (this.$refs.scrollContainer) {
                this.containerHeight = this.$refs.scrollContainer.clientHeight
            }
        }
        this._updateContainerHeight()
        this._resizeObserver = new ResizeObserver(this._updateContainerHeight)
        this._resizeObserver.observe(this.$refs.scrollContainer)
    },
    watch: {
        sortedRooms: {
            handler() {
                this.$emit('update-sorted-rooms', this.sortedRooms)
            },
            immediate: true,
        },
    },
    beforeDestroy() {
        if (this._resizeObserver) {
            this._resizeObserver.disconnect()
            this._resizeObserver = null
        }
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
