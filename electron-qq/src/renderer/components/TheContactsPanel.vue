<template>
	<div class="contacts-root">
		<el-input
			placeholder="Search Name"
			v-model="searchContext"
			style="margin-top:5px"
			clearable
		/>

		<el-tabs v-model="activeName" :stretch="true">
			<el-tab-pane label="Friends" name="friends">
				<div
					class="contacts-panel"
					v-show="activeName === 'friends'"
				>
					<el-collapse v-model="activeFriendGroup">
						<el-collapse-item v-for="(v, i) in friendsAll" :title="v.name" :name="i" :key="i">
							<ContactEntry
								v-for="i in v.friends"
								:key="i.uin"
								:id="i.uin"
								:remark="i.remark"
								:name="i.nick"
								v-show="i.sc.includes(searchContext)"
								@dblclick="$emit('dblclick', i.uin, i.remark)"
							/>
						</el-collapse-item>
					</el-collapse>
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
import {ipcRenderer} from "electron";
import ContactEntry from "./ContactEntry.vue";

export default {
	components: {ContactEntry},
	data() {
		return {
			activeName: "friends",
			groupsAll: [],
			/**
			 * @type GroupOfFriend[]
			 */
			friendsAll: [],
			searchContextEdit: "",
			activeFriendGroup: []
		};
	},
	computed: {
		searchContext: {
			get() {
				return this.searchContextEdit;
			},
			set(val) {
				this.searchContextEdit = val.toUpperCase();
			}
		}
	},
	created() {
		ipcRenderer.invoke('getFriendsAndGroups')
		.then(({friends, groups})=>{
			this.friendsAll = Object.freeze(friends)
			this.groupsAll = Object.freeze(groups)
		})
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
