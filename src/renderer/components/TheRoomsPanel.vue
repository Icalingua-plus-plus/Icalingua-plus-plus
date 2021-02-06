<template>
	<div class="root">
		<div class="head">
			<el-input
				v-model="input"
				placeholder="Search"
				prefix-icon="el-icon-search"
				class="input"
			/>
		</div>
		<div class="content">
			<RoomEntry
				v-for="room in sortedRooms"
				:key="room.roomId"
				:room="room"
				:selected="room == selected"
				:mute-all-groups="muteAllGroups"
				@click="$emit('chroom', room)"
				@contextmenu="$emit('contextmenu', room)"
			/>
		</div>
	</div>
</template>

<script>
	import RoomEntry from './RoomEntry.vue'
	export default {
		name: 'TheRoomsPanel',
		components: { RoomEntry },
		computed: {
			sortedRooms() {
				this.input=this.input.toUpperCase()
				var tmpr = [...this.rooms]
				if (this.input)
					tmpr = tmpr.filter(e => e.roomName.toUpperCase().includes(this.input) || String(e.roomId).includes(this.input))
				return tmpr.sort((a, b) => b.index - a.index)
			}
		},
		props: [
			'rooms',
			'selected',
			'muteAllGroups'
		],
		data() {
			return {
				input: '',
			}
		}
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