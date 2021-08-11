<template>
	<div class="root">
		<div class="title">
			<p>Ignored chats</p>
		</div>
		<GroupEntry
			v-for="chat in ignoredChats"
			:key="chat.id"
			:chat="chat"
			@click="rm(chat)"
		/>
	</div>
</template>

<script>
import GroupEntry from '../components/GroupEntry'
import ipc from '../utils/ipc'

export default {
	components: {
		GroupEntry,
	},
	data() {
		return {
			ignoredChats: [],
		}
	},
	name: 'IgnoreManageView',
	methods: {
		rm({id}) {
			this.ignoredChats = this.ignoredChats.filter(e => e.id !== id)
			ipc.removeIgnoredChat(id)
		},
	},
	async created() {
		this.ignoredChats = await ipc.getIgnoredChats()
	},
}
</script>

<style scoped>
.root{
	max-height: 100vh;
	overflow: auto;
	margin: 10px;
	max-width: 100vw;
}
</style>
