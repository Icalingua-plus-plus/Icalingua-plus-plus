<template>
	<div class="root">
		<div class="head"></div>
		<div class="content">
			<RoomEntry
				v-for="room in sortedRooms"
				:key="room.roomId"
				:room="room"
				:selected="room == selected"
				:mute-all-groups="muteAllGroups"
				@click="$emit('chroom', room)"
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
				return [...this.rooms].sort((a, b) => b.index - a.index)
			}
		},
		props: [
			'rooms',
			'selected',
			'muteAllGroups'
		]
	}
</script>

<style scoped>
	.root {
		border-right: 1px solid #e1e4e8;
		height: 100vh;
	}
	div.head {
		height: 64px;
		/* border-bottom: 1px solid #e1e4e8 */
	}
</style>