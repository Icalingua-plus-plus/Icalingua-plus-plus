<template>
	<div class="contacts-root">
		<div class="contacts-head">
			<el-input
				v-model="searchContext"
				placeholder="Search"
				prefix-icon="el-icon-search"
				clearable
			/>
		</div>

		<div class="contacts-content">
			<el-tabs v-model="activeName" :stretch="true">
				<el-tab-pane label="Friends" name="friends">
					<div
						class="contacts-panel"
						v-show="activeName === 'friends'"
					>
						<el-collapse v-model="activeFriendGroup">
							<el-collapse-item v-for="(v, i) in friendsAll"
							                  :title="`${v.name} (${v.friends.filter(e=>e.sc.includes(searchContext)).length})`"
							                  :name="i" :key="i">
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
	</div>
</template>

<script>
import {ipcRenderer} from 'electron'
import ContactEntry from './ContactEntry.vue'

export default {
	components: {ContactEntry},
	data() {
		return {
			activeName: 'friends',
			groupsAll: [],
			/**
			 * @type GroupOfFriend[]
			 */
			friendsAll: [],
			searchContextEdit: '',
			activeFriendGroup: [],
		}
	},
	computed: {
		searchContext: {
			get() {
				return this.searchContextEdit
			},
			set(val) {
				this.searchContextEdit = val.toUpperCase()
			},
		},
	},
	created() {
		ipcRenderer.invoke('getFriendsAndGroups')
			.then(({friends, groups}) => {
				this.friendsAll = Object.freeze(friends)
				this.groupsAll = Object.freeze(groups)
			})
	},
}
</script>

<style>
.contacts-panel {
	margin: 0 12px;
}

.contacts-root {
	border-right: 1px solid #e1e4e8;
	height: 100vh;
	display: flex;
	flex-direction: column;
}

.contacts-head {
	margin: 12px 12px 0;
	height: 64px;
	min-height: 64px;
	display: flex;
	align-items: center;
}

.contacts-content {
	overflow: auto;
}

.el-tabs__header {
	margin: unset !important;
}
</style>
