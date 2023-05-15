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
                <el-tab-pane label="Friends" name="friends">
                    <el-collapse v-model="activeFriendGroup">
                        <el-collapse-item
                            v-for="(v, i) in friendsAll"
                            :title="`${v.name} ` + `(${searchFriendResults[i]})`"
                            :name="i"
                            :key="i"
                            ref="friendItems"
                            v-show="searchFriendResults[i] > 0"
                        >
                            <ContactEntry
                                v-for="i in v.friends"
                                :key="i.uin"
                                :id="i.uin"
                                :remark="i.remark"
                                :name="i.nick"
                                v-show="i.sc.includes(searchContext)"
                                @click="$emit('click', i.uin, i.remark)"
                                @dblclick="$emit('dblclick', i.uin, i.remark)"
                            />
                        </el-collapse-item>
                        <ContactEntry
                            v-for="i in friendsFallback"
                            :key="i.uin"
                            :id="i.uin"
                            :remark="i.remark"
                            :name="i.nick"
                            v-show="i.sc.includes(searchContext)"
                            @click="$emit('click', i.uin, i.remark)"
                            @dblclick="$emit('dblclick', i.uin, i.remark)"
                        />
                    </el-collapse>
                </el-tab-pane>
                <el-tab-pane label="Groups" name="groups">
                    <ContactEntry
                        v-for="i in groupsAll"
                        :key="i.group_id"
                        :id="-i.group_id"
                        :remark="i.group_name"
                        :group="i"
                        :removeEmotes="removeGroupNameEmotes"
                        v-show="i.sc.includes(searchContext) || PinyinMatch(i.sc, searchContext)"
                        @click="$emit('click', -i.group_id, i.group_name)"
                        @dblclick="$emit('dblclick', -i.group_id, i.group_name)"
                    />
                </el-tab-pane>
            </el-tabs>
        </div>
    </div>
</template>

<script>
import { ipcRenderer } from 'electron'
import ContactEntry from './ContactEntry.vue'
import PinyinMatch from 'pinyin-match'

export default {
    components: { ContactEntry },
    props: {
        removeGroupNameEmotes: Boolean,
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
        searchFriendResults() {
            if (!this.searchContextEdit) return this.friendsAll.map((friendGroup) => friendGroup.friends.length)
            return this.friendsAll.map(
                (friendGroup) => friendGroup.friends.filter((f) => f.sc.includes(this.searchContextEdit)).length,
            )
        },
    },
    watch: {
        searchContext(newResults, oldResults) {
            let self = this
            let resultIndexArray = new Array(this.searchFriendResults.length)
                .fill(1)
                .map((e, i) => i)
                .filter((e) => this.searchFriendResults[e] > 0)
            if (resultIndexArray.length > 3) {
                self.$refs.friendItems
                    .filter((item) => item.$el.className.includes('is-active'))
                    .forEach((item) => {
                        item.dispatch('ElCollapse', 'item-click', item)
                    })
                return
            }
            resultIndexArray
                .filter((i) => !self.$refs.friendItems[i].$el.className.includes('is-active'))
                .forEach((i) => {
                    self.$refs.friendItems[i].dispatch('ElCollapse', 'item-click', self.$refs.friendItems[i])
                })
        },
    },
    created() {
        ipcRenderer.invoke('getFriendsAndGroups').then(({ friends, groups, friendsFallback }) => {
            this.friendsAll = friends ? Object.freeze(friends) : null
            this.groupsAll = Object.freeze(groups)
            friendsFallback && (this.friendsFallback = Object.freeze(friendsFallback))
        })
    },
    methods: {
        refresh() {
            this.friendsAll = this.groupsAll = this.friendsFallback = []
            ipcRenderer.invoke('getFriendsAndGroups').then(({ friends, groups, friendsFallback }) => {
                this.friendsAll = friends ? Object.freeze(friends) : null
                this.groupsAll = Object.freeze(groups)
                friendsFallback && (this.friendsFallback = Object.freeze(friendsFallback))
                this.$message.success('已刷新')
            })
        },
        PinyinMatch: PinyinMatch.match,
    },
}
</script>

<style>
.el-collapse {
    border: none;
}
.el-collapse-item__header {
    padding-left: 12px;
    border-bottom: var(--chat-border-style);
    background-color: var(--panel-background);
    color: var(--panel-color-name);
}

.el-collapse-item__content {
    padding-bottom: 0;
    background-color: var(--panel-background);
}

.el-collapse-item__wrap {
    background: unset;
    border-bottom: var(--chat-border-style);
}

.el-collapse-item__wrap > div > div:last-child > div > div {
    border-bottom: unset !important;
}

.el-tabs__header {
    margin: unset !important;
}

.el-tabs__item {
    padding: 0;
    color: var(--panel-color-name);
}

.el-tabs__nav-wrap::after {
    background-color: var(--panel-color-navi-bottom-bar);
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
    overflow: auto;
}

.icon-button {
    cursor: pointer;
    font-size: larger;
    color: #909399;
    margin-left: 10px;
}
</style>
