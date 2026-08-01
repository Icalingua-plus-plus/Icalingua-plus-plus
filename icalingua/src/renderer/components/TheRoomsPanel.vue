<template>
    <div class="root">
        <div
            ref="head"
            class="head"
            :class="{ 'compact-search-active': compactRoomSearch && roomSearchExpanded }"
            v-show="!roomPanelAvatarOnly || disableChatGroups"
        >
            <el-popover
                placement="right-end"
                :title="username"
                trigger="hover"
                :content="`${account}`"
                v-if="disableChatGroups && !(compactRoomSearch && roomSearchExpanded)"
            >
                <a slot="reference" @click="$emit('chroom', account)" style="cursor: pointer">
                    <el-avatar :src="getAvatarUrl(account)" />
                </a>
            </el-popover>
            <el-input
                v-show="!compactRoomSearch || roomSearchExpanded"
                ref="roomSearchInput"
                class="more input"
                v-model="input"
                placeholder="Search"
                prefix-icon="el-icon-search"
                clearable
                @blur="collapseRoomSearch"
            />
            <span
                v-if="compactRoomSearch && !roomSearchExpanded"
                class="more el-icon-search icon-button room-search-toggle"
                :class="{ 'has-query': input }"
                :title="input ? `当前搜索：${input}` : '搜索会话'"
                aria-label="搜索会话"
                role="button"
                tabindex="0"
                @click="expandRoomSearch"
                @keydown.enter.space.prevent="expandRoomSearch"
            ></span>
            <span
                v-show="!(compactRoomSearch && roomSearchExpanded)"
                class="more icon-button persistent-head-action global-message-search-icon"
                title="搜索全部聊天记录"
                aria-label="搜索全部聊天记录"
                role="button"
                tabindex="0"
                @click="openGlobalMessageSearch"
            >
                <i class="el-icon-chat-line-square" aria-hidden="true"></i>
                <i class="el-icon-search search-mark" aria-hidden="true"></i>
            </span>
            <span
                v-show="!(compactRoomSearch && roomSearchExpanded)"
                class="more el-icon-user icon-button persistent-head-action"
                @click="$emit('show-contacts')"
                title="联系人"
            ></span>
            <span
                v-show="!(compactRoomSearch && roomSearchExpanded)"
                class="more el-icon-delete icon-button persistent-head-action"
                @click="clearRooms"
                title="清理会话"
                v-if="clearRoomsBehavior !== 'disabled'"
            ></span>
        </div>
        <div class="content-wrapper">
            <div class="content" ref="scrollContainer" @scroll.passive="onScroll">
                <div :style="{ height: totalHeight + 'px', position: 'relative' }">
                    <div
                        :style="{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            transform: `translateY(${offsetY}px)`,
                        }"
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
            <div
                v-show="showScrollbar"
                class="custom-scrollbar"
                :class="{ 'is-dragging': isDragging }"
                @mousedown.prevent="onTrackMouseDown"
            >
                <div
                    ref="scrollbarThumb"
                    class="custom-scrollbar-thumb"
                    :style="{ height: thumbHeight + 'px' }"
                    @mousedown.prevent.stop="onThumbMouseDown"
                />
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
        scrollHeight() {
            return this.sortedRooms.length * this.itemHeight
        },
        showScrollbar() {
            return this.scrollHeight > this.containerHeight && this.containerHeight > 0
        },
        thumbHeight() {
            if (this.scrollHeight <= 0) return 0
            const ratio = this.containerHeight / this.scrollHeight
            return Math.max(20, ratio * this.containerHeight)
        },
        trackHeight() {
            return this.containerHeight - this.scrollbarPadding * 2
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
            compactRoomSearch: false,
            roomSearchExpanded: false,
            // 虚拟滚动
            scrollTop: 0,
            containerHeight: 0,
            itemHeight: 70, // RoomEntry 固定高度
            bufferSize: 5, // 上下额外渲染的条目数
            // 自定义滚动条
            scrollbarPadding: 3, // 避免滑块圆角超出边界
            isDragging: false,
        }
    },
    methods: {
        updateHeaderLayout() {
            const head = this.$refs.head
            if (!head || head.clientWidth <= 0) return

            const headStyle = window.getComputedStyle(head)
            const horizontalPadding =
                (Number.parseFloat(headStyle.paddingLeft) || 0) + (Number.parseFloat(headStyle.paddingRight) || 0)
            const measuredActionsWidth = Array.from(head.querySelectorAll('.persistent-head-action')).reduce(
                (width, action) => width + action.getBoundingClientRect().width,
                0,
            )
            if (measuredActionsWidth > 0) this._persistentActionsWidth = measuredActionsWidth

            const actionsWidth = this._persistentActionsWidth || 48
            const avatarWidth = this.disableChatGroups ? 40 : 0
            const availableInputWidth = head.clientWidth - horizontalPadding - avatarWidth - actionsWidth - 10
            const shouldCompact = availableInputWidth < 96
            const inputElement = this.$refs.roomSearchInput?.$el
            const inputFocused = inputElement?.contains(document.activeElement)

            if (shouldCompact && !this.compactRoomSearch && inputFocused) this.roomSearchExpanded = true
            if (!shouldCompact) this.roomSearchExpanded = false
            this.compactRoomSearch = shouldCompact
        },
        expandRoomSearch() {
            if (this._roomSearchBlurTimer) {
                clearTimeout(this._roomSearchBlurTimer)
                this._roomSearchBlurTimer = null
            }
            this.roomSearchExpanded = true
            this.$nextTick(() => this.$refs.roomSearchInput?.focus())
        },
        collapseRoomSearch() {
            if (!this.compactRoomSearch) return
            if (this._roomSearchBlurTimer) clearTimeout(this._roomSearchBlurTimer)
            this._roomSearchBlurTimer = setTimeout(() => {
                this.roomSearchExpanded = false
                this._roomSearchBlurTimer = null
            }, 0)
        },
        onScroll(e) {
            const scrollTop = e.target.scrollTop
            this._pendingScrollTop = scrollTop

            if (!this._scrollFrame) {
                this._scrollFrame = requestAnimationFrame(() => {
                    this._scrollFrame = null
                    this._updateScrollbarPosition(this._pendingScrollTop)
                })
            }

            const h = this.containerHeight || window.innerHeight
            const start = Math.max(0, Math.floor(scrollTop / this.itemHeight) - this.bufferSize)
            const end = Math.min(
                this.sortedRooms.length,
                Math.ceil((scrollTop + h) / this.itemHeight) + this.bufferSize,
            )
            const renderRange = `${start}:${end}`
            if (renderRange !== this._renderRange) {
                this._renderRange = renderRange
                this.scrollTop = scrollTop
            }
        },
        _updateScrollbarPosition(scrollTop) {
            const thumb = this.$refs.scrollbarThumb
            if (!thumb) return

            const maxScroll = this.scrollHeight - this.containerHeight
            if (maxScroll <= 0 || this.containerHeight <= 0) {
                thumb.style.transform = `translateY(${this.scrollbarPadding}px)`
                return
            }

            const maxOffset = Math.max(0, this.trackHeight - this.thumbHeight)
            const ratio = Math.max(0, Math.min(1, scrollTop / maxScroll))
            thumb.style.transform = `translateY(${this.scrollbarPadding + ratio * maxOffset}px)`
        },
        roomMenu(room, e) {
            ipc.popupRoomMenu(room.roomId, e)
        },
        openInNewWindow(room) {
            ipc.openRoomInNewWindow(room.roomId)
        },
        openGlobalMessageSearch() {
            ipc.openGlobalMessageSearch()
        },
        onThumbMouseDown(e) {
            this.isDragging = true
            this._dragStartY = e.clientY
            this._dragStartScrollTop = this.$refs.scrollContainer?.scrollTop || 0
            this._onMouseMove = (ev) => this.onThumbMouseMove(ev)
            this._onMouseUp = () => this.onThumbMouseUp()
            document.addEventListener('mousemove', this._onMouseMove)
            document.addEventListener('mouseup', this._onMouseUp)
        },
        onThumbMouseMove(e) {
            const delta = e.clientY - this._dragStartY
            const maxScroll = this.scrollHeight - this.containerHeight
            const maxOffset = this.trackHeight - this.thumbHeight
            this.$refs.scrollContainer.scrollTop = this._dragStartScrollTop + (delta / maxOffset) * maxScroll
        },
        onThumbMouseUp() {
            document.removeEventListener('mousemove', this._onMouseMove)
            document.removeEventListener('mouseup', this._onMouseUp)
            this._onMouseMove = null
            this._onMouseUp = null
            this.isDragging = false
        },
        onTrackMouseDown(e) {
            const rect = this.$refs.scrollContainer.getBoundingClientRect()
            const clickY = e.clientY - rect.top
            const ratio = (clickY - this.scrollbarPadding) / this.trackHeight
            const maxScroll = this.scrollHeight - this.containerHeight
            this.$refs.scrollContainer.scrollTop = ratio * maxScroll - this.thumbHeight / 2
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
            this.updateHeaderLayout()
        }
        this._updateContainerHeight()
        this.$nextTick(() => this._updateScrollbarPosition(this.$refs.scrollContainer?.scrollTop || 0))
        this._resizeObserver = new ResizeObserver(this._updateContainerHeight)
        this._resizeObserver.observe(this.$refs.scrollContainer)
        this._resizeObserver.observe(this.$refs.head)
    },
    watch: {
        sortedRooms: {
            handler() {
                this.$emit('update-sorted-rooms', this.sortedRooms)
                this.$nextTick(() => this._updateScrollbarPosition(this.$refs.scrollContainer?.scrollTop || 0))
            },
            immediate: true,
        },
        clearRoomsBehavior() {
            this.$nextTick(() => this.updateHeaderLayout())
        },
        disableChatGroups() {
            this.$nextTick(() => this.updateHeaderLayout())
        },
    },
    beforeDestroy() {
        if (this._resizeObserver) {
            this._resizeObserver.disconnect()
            this._resizeObserver = null
        }
        if (this._scrollFrame) {
            cancelAnimationFrame(this._scrollFrame)
            this._scrollFrame = null
        }
        if (this._roomSearchBlurTimer) {
            clearTimeout(this._roomSearchBlurTimer)
            this._roomSearchBlurTimer = null
        }
        if (this._onMouseUp) this.onThumbMouseUp()
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
    min-width: 0;
    display: flex;
    align-items: center;
    padding: 0 10px;
}

.head > .icon-button {
    flex: 0 0 auto;
}

.rooms-panel.avatar-only .head {
    padding: 0 17px;
}

.rooms-panel.avatar-only .more {
    display: none;
}

.content-wrapper {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
}

.content {
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
}
.content::-webkit-scrollbar {
    width: 0;
    height: 0;
}

.custom-scrollbar {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 10px;
    z-index: 10;
    opacity: 0;
    transition: opacity 0.15s;
}
.content-wrapper:hover .custom-scrollbar,
.custom-scrollbar.is-dragging {
    opacity: 1;
}

.custom-scrollbar-thumb {
    width: 6px;
    margin: 0 2px;
    border-radius: 3px;
    background-color: #999;
    transition: background-color 0.15s;
    will-change: transform;
}
.custom-scrollbar:not(.is-dragging) .custom-scrollbar-thumb:hover,
.custom-scrollbar.is-dragging .custom-scrollbar-thumb {
    background-color: #dd5e89;
}

.input {
    flex: 1 1 0;
    width: 0;
    min-width: 0;
    margin-left: 10px;
    overflow: hidden;
}

.head.compact-search-active .input {
    margin-left: 0;
}

.room-search-toggle {
    margin-right: auto;

    &.has-query {
        color: #409eff;
    }
}

.global-message-search-icon {
    position: relative;
    display: inline-block;

    .search-mark {
        position: absolute;
        right: -0.32em;
        bottom: -0.22em;
        padding: 1px;
        border-radius: 50%;
        background: var(--panel-header-bg);
        font-size: 0.62em;
        font-weight: 600;
    }
}
</style>
