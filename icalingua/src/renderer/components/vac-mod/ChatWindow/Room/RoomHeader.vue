<template>
    <div class="vac-room-header vac-app-border-b">
        <slot name="room-header" v-bind="{ room, typingUsers }">
            <div class="vac-room-wrapper">
                <div v-show="showSinglePanel" class="vac-svg-button vac-room-back" @click="$emit('back-contact')">
                    <i class="el-icon-back"></i>
                </div>
                <div
                    v-if="!singleRoom"
                    class="vac-svg-button vac-toggle-button"
                    :class="{ 'vac-rotate-icon': !showRoomsList && !isMobile }"
                    @click="$emit('toggle-rooms-list')"
                >
                    <slot name="toggle-icon">
                        <svg-icon name="toggle" />
                    </slot>
                </div>
                <div
                    class="vac-info-wrapper"
                    :class="{ 'vac-item-clickable': roomInfo }"
                    @click="$emit('room-info', room)"
                >
                    <slot name="room-header-avatar" v-bind="{ room }">
                        <a @dblclick="$emit('pokefriend')">
                            <div
                                v-if="roomAvatar"
                                class="vac-room-avatar"
                                :style="{ 'background-image': `url('${roomAvatar}')` }"
                            />
                        </a>
                    </slot>
                    <slot name="room-header-info" v-bind="{ room, typingUsers, roomInfo }">
                        <div class="vac-text-ellipsis">
                            <div class="vac-room-name vac-text-ellipsis">
                                {{ roomName }}
                            </div>
                            <div
                                v-if="membersCount"
                                class="vac-room-info vac-text-ellipsis"
                                @dblclick="$emit('open-group-member-panel')"
                            >
                                {{ membersCount }} 名成员
                            </div>
                        </div>
                    </slot>
                </div>
                <slot v-if="room.roomId" name="room-options">
                    <div class="vac-room-actions-group">
                        <div v-if="room.roomId < 0" class="vac-room-actions">
                            <button
                                type="button"
                                class="vac-svg-button vac-room-action"
                                title="群公告"
                                aria-label="打开群公告"
                                @click="$emit('open-group-announcements')"
                            >
                                <svg-icon name="loudspeaker" />
                            </button>
                            <button
                                type="button"
                                class="vac-svg-button vac-room-action"
                                title="群文件"
                                aria-label="打开群文件"
                                @click="$emit('open-group-files')"
                            >
                                <svg-icon name="folder" />
                            </button>
                            <button
                                type="button"
                                class="vac-svg-button vac-room-action"
                                title="群相册"
                                aria-label="打开群相册"
                                @click="$emit('open-group-album')"
                            >
                                <svg-icon name="album" />
                            </button>
                            <button
                                type="button"
                                class="vac-svg-button vac-room-action"
                                title="群精华"
                                aria-label="打开群精华"
                                @click="$emit('open-group-essence')"
                            >
                                <svg-icon name="message-star" />
                            </button>
                        </div>
                        <div class="vac-svg-button vac-room-options" @click="$emit('room-menu', $event)" title="菜单">
                            <slot name="menu-icon">
                                <svg-icon name="menu" />
                            </slot>
                        </div>
                    </div>
                    <transition v-if="menuActions.length" name="vac-slide-left">
                        <div v-if="menuOpened" v-click-outside="closeMenu" class="vac-menu-options">
                            <div class="vac-menu-list">
                                <div v-for="action in menuActions" :key="action.name">
                                    <div class="vac-menu-item" @click="menuActionHandler(action)">
                                        {{ action.title }}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </transition>
                </slot>
            </div>
        </slot>
    </div>
</template>

<script>
// allow: SIZE_OK - 房间头部的模板、交互与主题样式必须由同一个 Vue SFC 共同封装
import vClickOutside from 'v-click-outside'

import SvgIcon from '../../components/SvgIcon'

import typingText from '../../utils/typingText'
import getAvatarUrl from '../../../../../utils/getAvatarUrl'
import removeGroupNameEmotes from '../../../../../utils/removeGroupNameEmotes'

export default {
    name: 'RoomHeader',
    components: {
        SvgIcon,
    },

    directives: {
        clickOutside: vClickOutside.directive,
    },

    props: {
        currentUserId: { type: [String, Number], required: true },
        textMessages: { type: Object, required: true },
        singleRoom: { type: Boolean, required: true },
        showRoomsList: { type: Boolean, required: true },
        isMobile: { type: Boolean, required: true },
        roomInfo: { type: Function, default: null },
        menuActions: { type: Array, required: true },
        room: { type: Object, required: true },
        membersCount: { type: Number, default: 0 },
        showSinglePanel: { type: Boolean, require: false, default: false },
        removeEmotes: { type: Boolean, require: false, default: false },
    },

    data() {
        return {
            menuOpened: false,
        }
    },

    computed: {
        typingUsers() {
            return typingText(this.room, this.currentUserId, this.textMessages)
        },
        roomAvatar() {
            return getAvatarUrl(this.room.roomId)
        },
        roomName() {
            return this.removeEmotes ? removeGroupNameEmotes(this.room.roomName) : this.room.roomName
        },
    },

    methods: {
        menuActionHandler(action) {
            this.closeMenu()
            this.$emit('menu-action-handler', action)
        },
        closeMenu() {
            this.menuOpened = false
        },
    },
}
</script>

<style lang="scss">
.vac-room-header {
    position: absolute;
    display: flex;
    align-items: center;
    height: 64px;
    width: 100%;
    z-index: 10;
    background: var(--chat-header-bg-color);
    border-top-right-radius: var(--chat-container-border-radius);
}

.vac-room-wrapper {
    display: flex;
    align-items: center;
    min-width: 0;
    height: 100%;
    width: 100%;
    padding: 0 16px;
}

.vac-toggle-button {
    margin-right: 15px;

    svg {
        height: 26px;
        width: 26px;
    }
}

.vac-rotate-icon {
    transform: rotate(180deg) !important;
}

.vac-info-wrapper {
    display: flex;
    align-items: center;
    min-width: 0;
    width: 100%;
    height: 100%;
}

.vac-room-name {
    font-size: 17px;
    font-weight: 500;
    line-height: 22px;
    color: var(--chat-header-color-name);
}

.vac-room-info {
    font-size: 13px;
    line-height: 18px;
    color: var(--chat-header-color-info);
}

.vac-room-options {
    display: flex;
    width: 32px;
    height: 32px;
    align-items: center;
    justify-content: center;
    max-height: none;
}

.vac-room-options svg {
    display: block;
    height: 20px;
    width: 20px;
}

.vac-room-actions {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 8px;
}

.vac-room-actions-group {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
}

.vac-room-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    outline: none;
    color: var(--chat-icon-color-menu);
    background: transparent;
    transition:
        transform 0.2s,
        opacity 0.2s;
}

.vac-room-action svg {
    height: 20px;
    width: 20px;
}

.vac-room-action svg path {
    fill: currentColor;
}

.vac-room-action:active {
    transform: scale(0.93);
}

.vac-room-action:focus-visible {
    outline: 2px solid var(--chat-icon-color-file);
    outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
    .vac-room-action {
        transition: none;
    }

    .vac-room-action:hover,
    .vac-room-action:active {
        transform: none;
    }
}

.vac-room-back {
    padding-right: 0.6rem;
    padding-left: 0.2rem;
    width: 1.5rem;
    font-size: 1.5rem;
}

@media only screen and (max-width: 768px) {
    .vac-room-header {
        height: 50px;

        .vac-room-wrapper {
            padding: 0 10px;
        }

        .vac-room-name {
            font-size: 16px;
            line-height: 22px;
        }

        .vac-room-info {
            font-size: 12px;
            line-height: 16px;
        }

        .vac-room-avatar {
            height: 37px;
            width: 37px;
            min-height: 37px;
            min-width: 37px;
        }
    }
}
</style>
