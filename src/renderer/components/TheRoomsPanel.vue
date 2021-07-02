<template>
	<div class="root">
		<div class="head">
			<el-input
				v-model="input"
				placeholder="Search"
				prefix-icon="el-icon-search"
				class="input"
				clearable
			/>
		</div>
		<div class="content">
			<RoomEntry
				v-for="room in sortedRooms"
				:key="room.roomId"
				:room="room"
				:selected="room.roomId === selected.roomId"
				:priority="priority"
				@click="$emit('chroom', room)"
				@contextmenu="roomMenu"
			/>
		</div>
	</div>
</template>

<script type="ts">
import RoomEntry from './RoomEntry.vue'
import ipc from '../utils/ipc'

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
	},
	data() {
		return {
			input: '',
		}
	},
	methods: {
		roomMenu() {
			ipc.popupRoomMenu(room.roomId)
		},
	},
}
</script>

<style scoped>
.root {
	border-right: 1px solid #e1e4e8;
	height: 100vh;
	display: flex;
	flex-direction: column;
}

div.head {
	height: 64px;
	min-height: 64px;
	display: flex;
	align-items: center;
}

.content {
	overflow: auto;
}

.input {
	margin: 0 12px;
}
</style>
