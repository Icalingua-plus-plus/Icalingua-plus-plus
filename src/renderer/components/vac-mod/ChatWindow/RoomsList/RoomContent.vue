<template>
	<div class="vac-room-container">
		<slot name="room-list-item" v-bind="{ room }">
			<div
				v-if="room.avatar"
				class="vac-room-avatar"
				:style="{ 'background-image': `url('${room.avatar}')` }"
			/>
			<div class="vac-name-container vac-text-ellipsis">
				<div class="vac-title-container">
					<div
						v-if="userStatus"
						class="vac-state-circle"
						:class="{ 'vac-state-online': userStatus === 'online' }"
					/>
					<div class="vac-room-name vac-text-ellipsis">
						{{ room.roomName }}
					</div>
					<div v-if="room.lastMessage" class="vac-text-date">
						{{ room.lastMessage.timestamp }}
					</div>
				</div>
				<div
					class="vac-text-last"
					:class="{
						'vac-message-new':
							room.lastMessage && room.lastMessage.new && !typingUsers
					}"
				>
					<span v-if="isMessageCheckmarkVisible">
						<slot name="checkmark-icon" v-bind="room.lastMessage">
							<svg-icon
								:name="
									room.lastMessage.distributed
										? 'double-checkmark'
										: 'checkmark'
								"
								:param="room.lastMessage.seen ? 'seen' : ''"
								class="vac-icon-check"
							/>
						</slot>
					</span>
					<div
						v-if="
							room.lastMessage &&
								!room.lastMessage.deleted &&
								room.lastMessage.file &&
								room.lastMessage.file.audio
						"
						class="vac-text-ellipsis"
					>
						<slot name="microphone-icon">
							<svg-icon name="microphone" class="vac-icon-microphone" />
						</slot>
						{{ formattedDuration }}
					</div>
					<format-message
						v-else-if="room.lastMessage"
						:content="getLastMessage"
						:deleted="!!room.lastMessage.deleted && !typingUsers"
						:users="room.users"
						:linkify="false"
						:text-formatting="textFormatting"
						:single-line="true"
					>
						<template #deleted-icon="data">
							<slot name="deleted-icon" v-bind="data" />
						</template>
					</format-message>
					<div
						v-if="!room.lastMessage && typingUsers"
						class="vac-text-ellipsis"
					>
						{{ typingUsers }}
					</div>
					<div class="vac-room-options-container">
						<div v-if="room.unreadCount" class="vac-room-badge">
							{{ room.unreadCount }}
						</div>
						<slot name="room-list-options" v-bind="{ room }">
							<div
								v-if="roomActions.length"
								class="vac-svg-button vac-list-room-options"
								@click.stop="roomMenuOpened = room.roomId"
							>
								<slot name="room-list-options-icon">
									<svg-icon name="dropdown" param="room" />
								</slot>
							</div>
							<transition v-if="roomActions.length" name="vac-slide-left">
								<div
									v-if="roomMenuOpened === room.roomId"
									v-click-outside="closeRoomMenu"
									class="vac-menu-options"
								>
									<div class="vac-menu-list">
										<div v-for="action in roomActions" :key="action.name">
											<div
												class="vac-menu-item"
												@click.stop="roomActionHandler(action)"
											>
												{{ action.title }}
											</div>
										</div>
									</div>
								</div>
							</transition>
						</slot>
					</div>
				</div>
			</div>
		</slot>
	</div>
</template>

<script>
import vClickOutside from 'v-click-outside'

import SvgIcon from '../../components/SvgIcon'
import FormatMessage from '../../components/FormatMessage'

import typingText from '../../utils/typingText'

export default {
	name: 'RoomsContent',
	components: {
		SvgIcon,
		FormatMessage
	},

	directives: {
		clickOutside: vClickOutside.directive
	},

	props: {
		currentUserId: { type: [String, Number], required: true },
		room: { type: Object, required: true },
		textFormatting: { type: Boolean, required: true },
		textMessages: { type: Object, required: true },
		roomActions: { type: Array, required: true }
	},

	data() {
		return {
			roomMenuOpened: null
		}
	},

	computed: {
		getLastMessage() {
			const isTyping = this.typingUsers
			if (isTyping) return isTyping

			const content = this.room.lastMessage.deleted
				? this.textMessages.MESSAGE_DELETED
				: this.room.lastMessage.content

			if (this.room.users.length <= 2) {
				return content
			}

			const user = this.room.users.find(
				user => user._id === this.room.lastMessage.senderId
			)

			if (this.room.lastMessage.username) {
				return `${this.room.lastMessage.username} - ${content}`
			} else if (!user || user._id === this.currentUserId) {
				return content
			}

			return `${user.username} - ${content}`
		},
		userStatus() {
			if (!this.room.users || this.room.users.length !== 2) return

			const user = this.room.users.find(u => u._id !== this.currentUserId)
			if (user.status) return user.status.state

			return null
		},
		typingUsers() {
			return typingText(this.room, this.currentUserId, this.textMessages)
		},
		isMessageCheckmarkVisible() {
			return (
				!this.typingUsers &&
				this.room.lastMessage &&
				!this.room.lastMessage.deleted &&
				this.room.lastMessage.senderId === this.currentUserId &&
				(this.room.lastMessage.saved ||
					this.room.lastMessage.distributed ||
					this.room.lastMessage.seen)
			)
		},
		formattedDuration() {
			let s = Math.round(this.room.lastMessage.file.duration)
			return (s - (s %= 60)) / 60 + (s > 9 ? ':' : ':0') + s
		}
	},

	methods: {
		roomActionHandler(action) {
			this.closeRoomMenu()
			this.$emit('room-action-handler', { action, roomId: this.room.roomId })
		},
		closeRoomMenu() {
			this.roomMenuOpened = null
		}
	}
}
</script>

<style lang="scss" scoped>
.vac-room-container {
	display: flex;
	flex: 1;
	align-items: center;
}

.vac-name-container {
	flex: 1;
}

.vac-text-ellipsis {
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.vac-title-container {
	display: flex;
	align-items: center;
	line-height: 25px;
}

.vac-state-circle {
	width: 9px;
	height: 9px;
	border-radius: 50%;
	background-color: var(--chat-room-color-offline);
	margin-right: 6px;
	transition: 0.3s;
}

.vac-state-online {
	background-color: var(--chat-room-color-online);
}

.vac-room-name {
	flex: 1;
	color: var(--chat-room-color-username);
	font-weight: 500;
}

.vac-text-date {
	margin-left: 5px;
	font-size: 11px;
	color: var(--chat-room-color-timestamp);
}

.vac-text-last {
	display: flex;
	align-items: center;
	font-size: 12px;
	line-height: 19px;
	color: var(--chat-room-color-message);
}

.vac-message-new {
	color: var(--chat-room-color-username);
	font-weight: 500;
}

.vac-icon-check {
	display: flex;
	vertical-align: middle;
	height: 14px;
	width: 14px;
	margin-top: -2px;
	margin-right: 2px;
}

.vac-icon-microphone {
	height: 15px;
	width: 15px;
	vertical-align: middle;
	margin: -3px 1px 0 -2px;
	fill: var(--chat-room-color-message);
}

.vac-room-options-container {
	display: flex;
	margin-left: auto;
}

.vac-room-badge {
	background-color: var(--chat-room-bg-color-badge);
	color: var(--chat-room-color-badge);
	font-size: 11px;
	font-weight: 500;
	height: 13px;
	width: auto;
	min-width: 13px;
	margin-left: 5px;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 3px;
}

.vac-list-room-options {
	height: 19px;
	width: 19px;
	align-items: center;
	margin-left: 5px;
}

@media only screen and (max-width: 768px) {
}
</style>
