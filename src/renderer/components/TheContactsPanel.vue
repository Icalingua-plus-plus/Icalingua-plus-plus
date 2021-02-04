<template>
	<div class="root">
		<el-tabs v-model="activeName" :stretch="true">
			<el-tab-pane label="Friends" name="friends"></el-tab-pane>
			<el-tab-pane label="Groups" name="groups"></el-tab-pane>
		</el-tabs>
		<div v-show="activeName == 'friends'">
			<ContactEntry
				v-for="i in friends"
				:key="i.user_id"
				:id="i.user_id"
				:remark="i.remark"
				:name="i.nickname"
				@dblclick="$emit('dblclick', i.user_id, i.remark)"
			/>
		</div>
		<div v-show="activeName == 'groups'">
			<ContactEntry
				v-for="i in groups"
				:key="i.group_id"
				:id="-i.group_id"
				:remark="i.group_name"
				@dblclick="$emit('dblclick', -i.group_id, i.group_name)"
			/>
		</div>
	</div>
</template>

<script>
	import { remote } from 'electron'
	import ContactEntry from './ContactEntry.vue'

	const bot = remote.getGlobal("bot")

	export default {
		components: { ContactEntry },
		data() {
			return {
				activeName: 'friends',
				groups: [],
				friends: [],
			}
		},
		created() {
			bot.getFriendList().data.forEach(e => this.friends.push(e))
			bot.getGroupList().data.forEach(e => this.groups.push(e))
		}
	}
</script>

<style scoped>
	.root {
		overflow-y: auto;
        height: 100%;
	}
</style>