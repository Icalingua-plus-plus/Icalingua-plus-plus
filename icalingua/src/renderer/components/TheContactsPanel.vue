<template>
    <div class="contacts-root">
        <div class="contacts-head-container">
            <div class="contacts-head">
                <el-input v-model="searchContext" placeholder="Search" prefix-icon="el-icon-search" clearable />
                <span class="el-icon-refresh-right contacts-refresh" @click="refresh" />
            </div>
        </div>

        <div class="contacts-content">
            <el-tabs v-model="activeName" :stretch="true">
                <el-tab-pane label="Friends" name="friends">
                    <el-collapse v-model="activeFriendGroup">
                        <el-collapse-item
                            v-for="(v, i) in friendsAll"
                            :title="`${v.name} ` + `(${v.friends.filter((e) => e.sc.includes(searchContext)).length})`"
                            :name="i"
                            :key="i"
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
                        v-show="i.sc.includes(searchContext)"
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

export default {
    components: { ContactEntry },
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
    },
}
</script>

<style>
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

.contacts-refresh {
    cursor: pointer;
    font-size: larger;
    color: #909399;
    margin-left: 10px;
}
</style>
