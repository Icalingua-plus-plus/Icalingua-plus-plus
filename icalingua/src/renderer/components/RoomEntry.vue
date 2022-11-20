<template>
    <a @click="$emit('click')" @click.right="$emit('contextmenu')">
        <div class="root" :class="{ selected }">
            <div class="entry">
                <div class="left">
                    <el-badge value="@" :type="room.at === 'all' ? 'warning' : undefined" :hidden="!room.at">
                        <el-avatar size="large" :src="roomAvatar" />
                    </el-badge>
                </div>
                <div class="right" :title="desc">
                    <div class="flex l1" :class="{ withoutdesc: !desc }">
                        <div class="name">
                            {{ room.roomName }}
                        </div>
                        <div class="icon" v-show="room.priority < priority">
                            <i class="el-icon-close-notification"></i>
                        </div>
                        <div class="icon" v-show="room.index === 1">
                            <i class="el-icon-arrow-up"></i>
                        </div>
                        <div class="timestamp">
                            {{ timestamp }}
                        </div>
                    </div>
                    <div class="flex">
                        <div class="desc">
                            {{ desc }}
                        </div>
                        <div v-show="room.unreadCount !== 0">
                            <el-badge :value="room.unreadCount" :type="room.priority < priority ? 'info' : undefined" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </a>
</template>

<script>
import getAvatarUrl from '../../utils/getAvatarUrl'

export default {
    name: 'RoomEntry',
    props: {
        room: Object,
        selected: Boolean,
        priority: Number,
    },
    computed: {
        desc() {
            let d = ''
            if (this.room.roomId < 0 && this.room.lastMessage.username) {
                d += this.room.lastMessage.username + ': '
            }
            d += this.room.lastMessage.content
            return d
        },
        timestamp() {
            const now = new Date()
            const time = new Date(this.room.utime)
            if (
                now.getFullYear() === time.getFullYear() &&
                now.getMonth() === time.getMonth() &&
                now.getDate() === time.getDate()
            )
                return this.room.lastMessage.timestamp

            now.setTime(now.getTime() - 24 * 60 * 60 * 1000)
            if (
                now.getFullYear() === time.getFullYear() &&
                now.getMonth() === time.getMonth() &&
                now.getDate() === time.getDate()
            )
                return '昨天'
            else return time.getDate() + '/' + (time.getMonth() + 1)
        },
        roomAvatar() {
            return getAvatarUrl(this.room.roomId)
        },
    },
}
</script>

<style scoped>
.root {
    padding: 0 15px;
    transition: background-color 0.3s;
    cursor: default;
    container-type: inline-size;
}

.root:not(.selected):hover {
    background-color: var(--panel-item-bg-hover);
}

div.entry {
    padding: 10px 0;
    height: 50px;
    display: flex;
    align-items: center;
    border-bottom: var(--chat-border-style);
}

.left {
    width: max-content;
    float: left;
    padding-top: 5px;
}

.right {
    margin-left: 15px;
    width: 100%;
}

.rooms-panel.avatar-only .right {
    display: none;
}

a {
    text-decoration: none;
}

.desc {
    color: var(--panel-color-desc);
    font-size: 12px;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    width: 0;
    flex: 1;
}

.icon {
    color: var(--panel-color-icon);
    font-size: 11px;
    margin-left: 2px;
}

.name {
    font-weight: bold;
    color: var(--panel-color-name);
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    width: 0;
    flex: 1;
    font-size: 16px;
}

.timestamp {
    margin-left: 5px;
    color: var(--panel-color-timestamp);
    font-size: 11px;
    white-space: nowrap;
}

.withoutdesc {
    margin-top: 10px;
    margin-bottom: 10px;
}

.flex {
    display: flex;
    height: 18px;
    justify-content: flex-end;
}

.l1 {
    height: 25px;
}

.selected {
    background-color: var(--panel-item-bg);
}

.el-badge {
    margin-top: -2px;
    margin-left: 2px;
}

::v-deep .el-badge * {
    font-family: msyh;
}

@container (max-width: 130px) {
    .name,
    .desc {
        display: none;
    }
}
</style>
