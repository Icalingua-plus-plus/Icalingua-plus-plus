<template>
	<div class="contacts-root">
		<el-input
			placeholder="Search Name"
			v-model="searchContext"
			style="margin-top:5px"
		/>

		<el-tabs v-model="activeName" :stretch="true">
			<el-tab-pane label="Friends" name="friends">
				<div
					class="contacts-panel"
					v-show="activeName === 'friends'"
				>
					<ContactEntry
						v-for="i in friendsAll"
						:key="i.user_id"
						:id="i.user_id"
						:remark="i.remark"
						:name="i.nickname"
						v-show="i.sc.includes(searchContext)"
						@dblclick="$emit('dblclick', i.user_id, i.remark)"
					/>
				</div>
			</el-tab-pane>
			<el-tab-pane label="Groups" name="groups">
				<div
					class="contacts-panel"
					v-show="activeName === 'groups'"
				>
					<ContactEntry
						v-for="i in groupsAll"
						:key="i.group_id"
						:id="-i.group_id"
						:remark="i.group_name"
						v-show="i.sc.includes(searchContext)"
						@dblclick="$emit('dblclick', -i.group_id, i.group_name)"
					/>
				</div>
			</el-tab-pane>
		</el-tabs>
	</div>
</template>

<script>
import {remote} from "electron";
import ContactEntry from "./ContactEntry.vue";

const bot = remote.getGlobal("bot");

export default {
	components: {ContactEntry},
	data() {
		return {
			activeName: "friends",
			groupsAll: [],
			friendsAll: [],
			searchContextEdit: "",
		};
	},
	computed: {
		searchContext : {
			get(){
				return this.searchContextEdit;
			},
			set(val){
				this.searchContextEdit = val.toUpperCase();
			}
		}
	},
	created() {
		setTimeout(() => {
			const friends = bot.fl.values();
			let t = friends.next();
			const friendsAll = []
			while (!t.done) {
				const f = {...t.value}
				//这样搜索的时候就不需要三个值里判断了
				f.sc = (f.nickname + f.remark + f.user_id).toUpperCase()
				friendsAll.push(f);
				t = friends.next();
			}
			const groups = bot.gl.values();
			t = groups.next();
			const groupsAll = []
			while (!t.done) {
				const f = {...t.value}
				f.sc = (f.group_name + f.group_id).toUpperCase()
				groupsAll.push(f);
				t = groups.next();
			}

			this.friendsAll = Object.freeze(friendsAll)
			this.groupsAll = Object.freeze(groupsAll)
		}, 0)
	},
};
</script>

<style>
.contacts-root {
	overflow-y: auto;
	height: 100vh;
}

.contacts-panel {
	overflow-y: auto;
	height: calc(100vh - 100px);
}
</style>
