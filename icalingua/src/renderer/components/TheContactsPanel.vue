<template>
    <div class="contacts-root">
        <div class="contacts-head-container">
            <div class="contacts-head">
                <el-input v-model="searchContext" placeholder="Search" prefix-icon="el-icon-search" clearable />
                <span class="el-icon-refresh-right icon-button" @click="refresh" />
            </div>
        </div>

        <div class="contacts-content">
            <el-tabs v-model="activeName" :stretch="true">
                <el-tab-pane label="Friends" name="friends" />
                <el-tab-pane label="Groups" name="groups" />
                <el-tab-pane label="Categories" name="categories" v-if="chatGroups != null" />
            </el-tabs>
            <VirtualList
                ref="list"
                :items="contactRows"
                item-key="key"
                :estimated-item-height="estimateRowHeight"
                :reset-key="activeName + ':' + searchContext"
            >
                <template #default="{ item, viewport }">
                    <VirtualContactGroup
                        v-if="item.members"
                        :title="item.title"
                        :items="item.members"
                        :expanded="item.expanded"
                        :contact="item.category ? categoryContact : friendContact"
                        :viewport="viewport"
                        @toggle="toggleGroup(item.index)"
                        @click="(id, name) => $emit('click', id, name)"
                        @dblclick="(id, name) => $emit('dblclick', id, name)"
                    />
                    <ContactEntry
                        v-else
                        :id="item.id"
                        :remark="item.remark"
                        :name="item.name"
                        :group-context="item.groupContext"
                        :removeEmotes="item.removeEmotes"
                        @click="$emit('click', item.id, item.chatName)"
                        @dblclick="$emit('dblclick', item.id, item.chatName)"
                    />
                </template>
            </VirtualList>
        </div>
    </div>
</template>

<script>
import { ipcRenderer } from 'electron'
import ContactEntry from './ContactEntry.vue'
import VirtualList from './VirtualList.vue'
import VirtualContactGroup from './VirtualContactGroup.vue'
import PinyinMatch from 'pinyin-match'

export default {
    components: { ContactEntry, VirtualList, VirtualContactGroup },
    props: {
        removeGroupNameEmotes: Boolean,
        chatGroups: Array,
    },
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
            friendsFallback: [],
            activeChatGroups: [0, 1],
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
        filteredFriendGroups() {
            return this.friendsAll.map((group, index) => ({
                ...group,
                index,
                friends: this.searchContext
                    ? group.friends.filter((friend) => friend.sc.includes(this.searchContext))
                    : group.friends,
            }))
        },
        contactInfo() {
            const info = new Map()
            for (const group of this.friendsAll) {
                for (const friend of group.friends) info.set(friend.uin, friend)
            }
            for (const friend of this.friendsFallback) info.set(friend.uin, friend)
            for (const group of this.groupsAll) info.set(-group.group_id, group)
            return info
        },
        contactRows() {
            const rows = []
            if (this.activeName === 'friends') {
                for (const group of this.filteredFriendGroups) {
                    if (!group.friends.length) continue
                    const expanded = this.activeFriendGroup.includes(group.index)
                    rows.push({
                        key: `friend-group:${group.index}`,
                        index: group.index,
                        title: `${group.name} (${group.friends.length})`,
                        expanded,
                        members: group.friends,
                    })
                }
                for (const friend of this.friendsFallback) {
                    if (friend.sc.includes(this.searchContext)) rows.push(this.friendRow(friend, 'fallback'))
                }
            } else if (this.activeName === 'groups') {
                for (const group of this.groupsAll) {
                    if (
                        this.searchContext &&
                        !group.sc.includes(this.searchContext) &&
                        !PinyinMatch.match(group.sc, this.searchContext)
                    )
                        continue
                    rows.push({
                        key: `group:${group.group_id}`,
                        id: -group.group_id,
                        name: group.group_name,
                        remark: group.group_remark || group.group_name,
                        chatName: group.group_name,
                        groupContext: { groupId: group.group_id, ownerId: group.owner_id },
                        removeEmotes: this.removeGroupNameEmotes,
                    })
                }
            } else {
                for (const [index, group] of (this.chatGroups || []).entries()) {
                    const expanded = this.activeChatGroups.includes(index)
                    rows.push({
                        key: `category:${index}`,
                        index,
                        title: group.name,
                        expanded,
                        category: true,
                        members: group.rooms.filter((id) => id !== -1),
                    })
                }
            }
            return rows
        },
    },
    watch: {
        searchContext() {
            const matches = this.filteredFriendGroups
                .filter((group) => group.friends.length)
                .map((group) => group.index)
            this.activeFriendGroup = matches.length > 3 ? [] : [...new Set([...this.activeFriendGroup, ...matches])]
        },
    },
    created() {
        this.loadContacts()
    },
    methods: {
        async loadContacts() {
            const { friends, groups, friendsFallback } = await ipcRenderer.invoke('getFriendsAndGroups')
            if (this._isDestroyed) return
            this.friendsAll = Object.freeze(friends || [])
            this.groupsAll = Object.freeze(groups || [])
            this.friendsFallback = Object.freeze(friendsFallback || [])
        },
        async refresh() {
            this.friendsAll = this.groupsAll = this.friendsFallback = []
            this.$refs.list.resetScroll()
            await this.loadContacts()
            if (!this._isDestroyed) this.$message.success('已刷新')
        },
        estimateRowHeight(item) {
            return item.members ? 49 + (item.expanded ? item.members.length * 71 : 0) : 71
        },
        friendContact(friend) {
            return { id: friend.uin, name: friend.nick, remark: friend.remark, chatName: friend.remark }
        },
        categoryContact(id) {
            const remark = this.getRemark(id)
            return { id, name: this.getName(id), remark, chatName: remark }
        },
        friendRow(friend, group) {
            return {
                key: `friend:${group}:${friend.uin}`,
                id: friend.uin,
                name: friend.nick,
                remark: friend.remark,
                chatName: friend.remark,
            }
        },
        toggleGroup(index) {
            const field = this.activeName === 'friends' ? 'activeFriendGroup' : 'activeChatGroups'
            const expanded = this[field]
            this[field] = expanded.includes(index) ? expanded.filter((value) => value !== index) : [...expanded, index]
        },
        getRemark(uin) {
            if (uin == -1) return ''
            const target = this.contactInfo.get(uin)
            if (!target) return 'null'
            return target.remark || target.name || target.group_remark || target.group_name
        },
        getName(uin) {
            if (uin == -1) return ''
            const target = this.contactInfo.get(uin)
            if (!target) return 'null'
            return target.nick || target.name || target.group_name
        },
    },
}
</script>

<style>
.contacts-root .el-tabs__header {
    margin: unset !important;
    position: sticky;
    top: 0;
    z-index: 10;
    background-color: var(--panel-background);
}

:where(.contacts-root) .el-tabs__item {
    padding: 0;
}

.contacts-root {
    height: 75vh;
    display: flex;
    flex-direction: column;
}

.contacts-head-container {
    background-color: var(--panel-header-bg);
}

.contacts-head {
    margin-right: 12px;
    display: flex;
    align-items: center;
}

.contacts-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
}

.icon-button {
    cursor: pointer;
    font-size: larger;
    color: #909399;
    margin-left: 10px;
}
</style>
