<template>
	<div
		v-show="showRoomsList"
		class="vac-rooms-container vac-app-border-r"
		:class="{ 'vac-rooms-container-full': isMobile }"
	>
		<slot name="rooms-header" />

		<rooms-search
			:rooms="rooms"
			:loading-rooms="loadingRooms"
			:text-messages="textMessages"
			:show-add-room="showAddRoom"
			@search-room="searchRoom"
			@add-room="$emit('add-room')"
		>
			<template v-for="(index, name) in $scopedSlots" #[name]="data">
				<slot :name="name" v-bind="data" />
			</template>
		</rooms-search>

		<loader :show="loadingRooms" />

		<div v-if="!loadingRooms && !rooms.length" class="vac-rooms-empty">
			<slot name="rooms-empty">
				{{ textMessages.ROOMS_EMPTY }}
			</slot>
		</div>

		<div v-if="!loadingRooms" class="vac-room-list">
			<div
				v-for="fRoom in filteredRooms"
				:id="fRoom.roomId"
				:key="fRoom.roomId"
				class="vac-room-item"
				:class="{ 'vac-room-selected': selectedRoomId === fRoom.roomId }"
				@click="openRoom(fRoom)"
			>
				<room-content
					:current-user-id="currentUserId"
					:room="fRoom"
					:text-formatting="textFormatting"
					:text-messages="textMessages"
					:room-actions="roomActions"
					@room-action-handler="$emit('room-action-handler', $event)"
				>
					<template v-for="(index, name) in $scopedSlots" #[name]="data">
						<slot :name="name" v-bind="data" />
					</template>
				</room-content>
			</div>
			<transition name="vac-fade-message">
				<infinite-loading
					v-if="rooms.length && !loadingRooms"
					spinner="spiral"
					@infinite="loadMoreRooms"
				>
					<div slot="spinner">
						<loader :show="true" :infinite="true" />
					</div>
					<div slot="no-results" />
					<div slot="no-more" />
				</infinite-loading>
			</transition>
		</div>
	</div>
</template>

<script>
import InfiniteLoading from 'vue-infinite-loading'

import Loader from '../../components/Loader'

import RoomsSearch from './RoomsSearch'
import RoomContent from './RoomContent'

import filteredUsers from '../../utils/filterItems'

export default {
	name: 'RoomsList',
	components: {
		InfiniteLoading,
		Loader,
		RoomsSearch,
		RoomContent
	},

	props: {
		currentUserId: { type: [String, Number], required: true },
		textMessages: { type: Object, required: true },
		showRoomsList: { type: Boolean, required: true },
		showAddRoom: { type: Boolean, required: true },
		textFormatting: { type: Boolean, required: true },
		isMobile: { type: Boolean, required: true },
		rooms: { type: Array, required: true },
		loadingRooms: { type: Boolean, required: true },
		roomsLoaded: { type: Boolean, required: true },
		room: { type: Object, required: true },
		roomActions: { type: Array, required: true }
	},

	data() {
		return {
			filteredRooms: this.rooms || [],
			infiniteState: null,
			loadingMoreRooms: false,
			selectedRoomId: ''
		}
	},

	watch: {
		rooms(newVal, oldVal) {
			this.filteredRooms = newVal

			if (
				this.infiniteState &&
				(newVal.length !== oldVal.length || this.roomsLoaded)
			) {
				this.infiniteState.loaded()
				this.loadingMoreRooms = false
			}
		},

		loadingRooms(val) {
			if (val) this.infiniteState = null
		},

		loadingMoreRooms(val) {
			this.$emit('loading-more-rooms', val)
		},

		room: {
			immediate: true,
			handler(val) {
				if (val && !this.isMobile) this.selectedRoomId = val.roomId
			}
		}
	},

	methods: {
		searchRoom(ev) {
			this.filteredRooms = filteredUsers(
				this.rooms,
				'roomName',
				ev.target.value
			)
		},
		openRoom(room) {
			if (room.roomId === this.room.roomId && !this.isMobile) return
			if (!this.isMobile) this.selectedRoomId = room.roomId
			this.$emit('fetch-room', { room })
		},
		loadMoreRooms(infiniteState) {
			if (this.loadingMoreRooms) return

			if (this.roomsLoaded) {
				this.loadingMoreRooms = false
				return infiniteState.complete()
			}

			this.infiniteState = infiniteState
			this.$emit('fetch-more-rooms')
			this.loadingMoreRooms = true
		}
	}
}
</script>

<style lang="scss" scoped>
.vac-rooms-container {
	display: flex;
	flex-flow: column;
	flex: 0 0 25%;
	min-width: 260px;
	max-width: 500px;
	position: relative;
	background: var(--chat-sidemenu-bg-color);
	height: 100%;
	border-top-left-radius: var(--chat-container-border-radius);
	border-bottom-left-radius: var(--chat-container-border-radius);
}

.vac-rooms-container-full {
	flex: 0 0 100%;
	max-width: 100%;
}

.vac-rooms-empty {
	font-size: 14px;
	color: #9ca6af;
	font-style: italic;
	text-align: center;
	margin: 40px 0;
	line-height: 20px;
	white-space: pre-line;
}

.vac-room-list {
	flex: 1;
	position: relative;
	max-width: 100%;
	cursor: pointer;
	padding: 0 10px 5px;
	overflow-y: auto;
}

.vac-room-item {
	border-radius: 8px;
	align-items: center;
	display: flex;
	flex: 1 1 100%;
	margin-bottom: 5px;
	padding: 0 14px;
	position: relative;
	min-height: 71px;

	&:hover {
		background: var(--chat-sidemenu-bg-color-hover);
		transition: background-color 0.3s cubic-bezier(0.25, 0.8, 0.5, 1);
	}

	&:not(:hover) {
		transition: background-color 0.3s cubic-bezier(0.25, 0.8, 0.5, 1);
	}
}

.vac-room-selected {
	color: var(--chat-sidemenu-color-active) !important;
	background: var(--chat-sidemenu-bg-color-active) !important;

	&:hover {
		background: var(--chat-sidemenu-bg-color-active) !important;
	}
}

@media only screen and (max-width: 768px) {
	.vac-room-list {
		padding: 0 7px 5px;
	}

	.vac-room-item {
		min-height: 60px;
		padding: 0 8px;
	}
}
</style>
