<template>
	<div class="title">
		<p>Ignored chats</p>
	</div>
	<GroupEntry
		v-for="chat in ignoredChats"
		:key="chat.id"
		:chat="chat"
		@click="$emit('remove', chat)"
	/>

</template>

<script>
import GroupEntry from '../components/GroupEntry'

export default {
	components:{
		GroupEntry
	},
	name: 'IgnoreManageView',
}
</script>

<style scoped>

</style>
