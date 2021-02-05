<template>
	<div class="vac-card-window" :style="[{ height }, cssVars]">
		<div class="vac-chat-container">
			<rooms-list
				v-if="!singleRoom"
				:current-user-id="currentUserId"
				:rooms="orderedRooms"
				:loading-rooms="loadingRooms"
				:rooms-loaded="roomsLoaded"
				:room="room"
				:room-actions="roomActions"
				:text-messages="t"
				:show-add-room="showAddRoom"
				:show-rooms-list="showRoomsList"
				:text-formatting="textFormatting"
				:is-mobile="isMobile"
				@fetch-room="fetchRoom"
				@fetch-more-rooms="fetchMoreRooms"
				@loading-more-rooms="loadingMoreRooms = $event"
				@add-room="addRoom"
				@room-action-handler="roomActionHandler"
			>
				<template v-for="(index, name) in $scopedSlots" v-slot:[name]="data">
					<slot :name="name" v-bind="data"></slot>
				</template>
			</rooms-list>

			<room
				:current-user-id="currentUserId"
				:rooms="rooms"
				:room-id="room.roomId || ''"
				:load-first-room="loadFirstRoom"
				:messages="messages"
				:room-message="roomMessage"
				:messages-loaded="messagesLoaded"
				:menu-actions="menuActions"
				:message-actions="messageActions"
				:show-send-icon="showSendIcon"
				:show-files="showFiles"
				:show-audio="showAudio"
				:show-emojis="showEmojis"
				:show-reaction-emojis="showReactionEmojis"
				:show-new-messages-divider="showNewMessagesDivider"
				:show-footer="showFooter"
				:text-messages="t"
				:single-room="singleRoom"
				:show-rooms-list="showRoomsList"
				:text-formatting="textFormatting"
				:is-mobile="isMobile"
				:loading-rooms="loadingRooms"
				:room-info="$listeners.roomInfo"
				:textarea-action="$listeners.textareaActionHandler"
				:accepted-files="acceptedFiles"
				@toggle-rooms-list="toggleRoomsList"
				@room-info="roomInfo"
				@fetch-messages="fetchMessages"
				@send-message="sendMessage"
				@edit-message="editMessage"
				@delete-message="deleteMessage"
				@open-file="openFile"
				@open-user-tag="openUserTag"
				@menu-action-handler="menuActionHandler"
				@message-action-handler="messageActionHandler"
				@send-message-reaction="sendMessageReaction"
				@typing-message="typingMessage"
				@textarea-action-handler="textareaActionHandler"
				@pokefriend="$emit('pokefriend')"
			>
				<template v-for="(index, name) in $scopedSlots" v-slot:[name]="data">
					<slot :name="name" v-bind="data"></slot>
				</template>
			</room>
		</div>
	</div>
</template>

<script>
import RoomsList from './RoomsList/RoomsList'
import Room from './Room/Room'

import locales from '../locales'
import { defaultThemeStyles, cssThemeVars } from '../themes'
const { roomsValid, partcipantsValid } = require('../utils/roomValidation')

export default {
	name: 'chat-container',
	components: {
		RoomsList,
		Room
	},

	props: {
		height: { type: String, default: '600px' },
		theme: { type: String, default: 'light' },
		styles: { type: Object, default: () => ({}) },
		responsiveBreakpoint: { type: Number, default: 900 },
		singleRoom: { type: Boolean, default: false },
		textMessages: { type: Object, default: null },
		currentUserId: { type: [String, Number], default: '' },
		rooms: { type: Array, default: () => [] },
		loadingRooms: { type: Boolean, default: false },
		roomsLoaded: { type: Boolean, default: false },
		roomId: { type: [String, Number], default: null },
		loadFirstRoom: { type: Boolean, default: true },
		messages: { type: Array, default: () => [] },
		messagesLoaded: { type: Boolean, default: false },
		roomActions: { type: Array, default: () => [] },
		menuActions: { type: Array, default: () => [] },
		messageActions: {
			type: Array,
			default: () => [
				{ name: 'replyMessage', title: 'Reply' },
				{ name: 'editMessage', title: 'Edit Message', onlyMe: true },
				{ name: 'deleteMessage', title: 'Delete Message', onlyMe: true }
			]
		},
		showAddRoom: { type: Boolean, default: true },
		showSendIcon: { type: Boolean, default: true },
		showFiles: { type: Boolean, default: true },
		showAudio: { type: Boolean, default: true },
		showEmojis: { type: Boolean, default: true },
		showReactionEmojis: { type: Boolean, default: true },
		showNewMessagesDivider: { type: Boolean, default: true },
		showFooter: { type: Boolean, default: true },
		textFormatting: { type: Boolean, default: true },
		newMessage: { type: Object, default: null },
		roomMessage: { type: String, default: '' },
		acceptedFiles: { type: String, default: '*' }
	},

	data() {
		return {
			room: {},
			loadingMoreRooms: false,
			showRoomsList: true,
			isMobile: false
		}
	},

	watch: {
		rooms: {
			immediate: true,
			handler(newVal, oldVal) {
				if (
					!newVal[0] ||
					!newVal.find(room => room.roomId === this.room.roomId)
				) {
					this.showRoomsList = true
				}

				if (
					!this.loadingMoreRooms &&
					this.loadFirstRoom &&
					newVal[0] &&
					(!oldVal || newVal.length !== oldVal.length)
				) {
					if (this.roomId) {
						const room = newVal.find(r => r.roomId === this.roomId)
						this.fetchRoom({ room })
					} else if (!this.isMobile || this.singleRoom) {
						this.fetchRoom({ room: this.orderedRooms[0] })
					} else {
						this.showRoomsList = true
					}
				}
			}
		},

		loadingRooms(val) {
			if (val) this.room = {}
		},

		roomId: {
			immediate: true,
			handler(val) {
				if (val && !this.loadingRooms && this.rooms.length) {
					const room = this.rooms.find(r => r.roomId === val)
					this.fetchRoom({ room })
				} else if (!val) {
					this.room = {}
				}
			}
		},

		room(val) {
			if (!val) return

			if (Object.entries(val).length === 0) return

			if (!roomsValid(val)) {
				throw 'Rooms object is not valid! Must contain roomId[String, Number], roomName[String] and users[Array]'
			}

			val.users.forEach(user => {
				if (!partcipantsValid(user)) {
					throw 'Participants object is not valid! Must contain _id[String, Number] and username[String]'
				}
			})
		},

		newMessage(val) {
			this.$set(this.messages, val.index, val.message)
		}
	},

	created() {
		this.updateResponsive()
		window.addEventListener('resize', ev => {
			if (ev.isTrusted) this.updateResponsive()
		})
	},

	computed: {
		t() {
			return {
				...locales,
				...this.textMessages
			}
		},
		cssVars() {
			const defaultStyles = defaultThemeStyles[this.theme]
			const customStyles = {}

			Object.keys(defaultStyles).map(key => {
				customStyles[key] = {
					...defaultStyles[key],
					...(this.styles[key] || {})
				}
			})

			return cssThemeVars(customStyles)
		},
		orderedRooms() {
			return this.rooms.slice().sort((a, b) => {
				const aVal = a.index || 0
				const bVal = b.index || 0

				return aVal > bVal ? -1 : bVal > aVal ? 1 : 0
			})
		}
	},

	methods: {
		updateResponsive() {
			this.isMobile = window.innerWidth < this.responsiveBreakpoint
		},
		toggleRoomsList() {
			this.showRoomsList = !this.showRoomsList
			if (this.isMobile) this.room = {}
			this.$emit('toggle-rooms-list', { opened: this.showRoomsList })
		},
		fetchRoom({ room }) {
			this.room = room
			this.fetchMessages({ reset: true })
			if (this.isMobile) this.showRoomsList = false
		},
		fetchMoreRooms() {
			this.$emit('fetch-more-rooms')
		},
		roomInfo() {
			this.$emit('room-info', this.room)
		},
		addRoom() {
			this.$emit('add-room')
		},
		fetchMessages(options) {
			this.$emit('fetch-messages', { room: this.room, options })
		},
		sendMessage(message) {
			this.$emit('send-message', { ...message, roomId: this.room.roomId })
		},
		editMessage(message) {
			this.$emit('edit-message', { ...message, roomId: this.room.roomId })
		},
		deleteMessage(messageId) {
			this.$emit('delete-message', { messageId, roomId: this.room.roomId })
		},
		openFile({ message, action }) {
			this.$emit('open-file', { message, action })
		},
		openUserTag({ user }) {
			this.$emit('open-user-tag', { user })
		},
		menuActionHandler(ev) {
			this.$emit('menu-action-handler', {
				action: ev,
				roomId: this.room.roomId
			})
		},
		roomActionHandler({ action, roomId }) {
			this.$emit('room-action-handler', {
				action,
				roomId
			})
		},
		messageActionHandler(ev) {
			this.$emit('message-action-handler', {
				...ev,
				roomId: this.room.roomId
			})
		},
		sendMessageReaction(messageReaction) {
			this.$emit('send-message-reaction', {
				...messageReaction,
				roomId: this.room.roomId
			})
		},
		typingMessage(message) {
			this.$emit('typing-message', {
				message,
				roomId: this.room.roomId
			})
		},
		textareaActionHandler(message) {
			this.$emit('textarea-action-handler', {
				message,
				roomId: this.room.roomId
			})
		}
	}
}
</script>

<style lang="scss">
@import '../styles/index.scss';

.vac-card-window {
	width: 100%;
	display: block;
	max-width: 100%;
	background: var(--chat-content-bg-color);
	color: var(--chat-color);
	overflow-wrap: break-word;
	position: relative;
	white-space: normal;
	border: var(--chat-container-border);
	border-radius: var(--chat-container-border-radius);
	box-shadow: var(--chat-container-box-shadow);
	-webkit-tap-highlight-color: transparent;

	* {
		font-family: inherit;
	}

	a {
		color: #0d579c;
		font-weight: 500;
	}

	.vac-chat-container {
		height: 100%;
		display: flex;

		input {
			min-width: 10px;
		}

		textarea,
		input[type='text'],
		input[type='search'] {
			-webkit-appearance: none;
		}
	}
}
</style>
