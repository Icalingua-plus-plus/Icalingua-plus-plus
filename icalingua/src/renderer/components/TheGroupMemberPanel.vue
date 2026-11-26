<template>
    <div class="groupmember-root">
        <div class="groupmember-head-container">
            <div class="groupmember-head">
                <el-input v-model="searchContext" placeholder="Search" prefix-icon="el-icon-search" clearable />
                <span class="el-icon-refresh-right groupmember-refresh" @click="refresh" />
            </div>
        </div>

        <VirtualList
            ref="list"
            class="groupmember-content"
            :items="filteredMembers"
            item-key="user_id"
            :estimated-item-height="71"
            :reset-key="searchContext"
        >
            <template #default="{ item }">
                <ContactEntry
                    :id="item.user_id"
                    :remark="item.card"
                    :group-context="item.group_id ? { groupId: item.group_id } : undefined"
                    :role="item.role"
                    type="groupmember"
                    :name="item.name"
                    @dblclick="$emit('dblclick', item.user_id, item.card)"
                />
            </template>
        </VirtualList>
    </div>
</template>

<script>
import { ipcRenderer } from 'electron'
import ContactEntry from './ContactEntry.vue'
import VirtualList from './VirtualList.vue'
import PinyinMatch from 'pinyin-match'

export default {
    components: { ContactEntry, VirtualList },
    props: {
        groupmemberShown: { type: Boolean, required: true },
        gin: { type: Number, required: true },
    },
    data() {
        return {
            groupmembers: [],
            searchContextEdit: '',
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
        filteredMembers() {
            if (!this.searchContext) return this.groupmembers
            return this.groupmembers.filter((member) => PinyinMatch.match(member.sc, this.searchContext))
        },
    },
    async created() {
        const ownerMembers = []
        const adminMembers = []
        const normalMembers = []
        const memberinfo = await ipcRenderer.invoke('getGroupMembers', this.gin)
        if (this._isDestroyed) return
        if (memberinfo) {
            for (const element of memberinfo) {
                const member = {
                    user_id: element.user_id,
                    group_id: element.group_id,
                    name: element.nickname,
                    card: element.card || element.nickname,
                    sc: (element.card + element.nickname + element.user_id.toString()).toUpperCase(),
                    role: element.role,
                }
                if (member.role === 'owner') ownerMembers.push(member)
                else if (member.role === 'admin') adminMembers.push(member)
                else normalMembers.push(member)
            }
            this.groupmembers = Object.freeze([...ownerMembers, ...adminMembers, ...normalMembers])
        }
    },
    methods: {
        async refresh() {
            this.groupmembers = []
            this.$refs.list.resetScroll()
            const ownerMembers = []
            const adminMembers = []
            const normalMembers = []
            const memberinfo = await ipcRenderer.invoke('getGroupMembers', this.gin)
            if (this._isDestroyed) return
            if (memberinfo) {
                for (const element of memberinfo) {
                    const member = {
                        user_id: element.user_id,
                        group_id: element.group_id,
                        name: element.nickname,
                        card: element.card || element.nickname,
                        sc: (element.card + element.nickname + element.user_id.toString()).toUpperCase(),
                        role: element.role,
                    }
                    if (member.role === 'owner') ownerMembers.push(member)
                    else if (member.role === 'admin') adminMembers.push(member)
                    else normalMembers.push(member)
                }
                this.groupmembers = Object.freeze([...ownerMembers, ...adminMembers, ...normalMembers])
            }
            this.$message.success('已刷新')
        },
    },
}
</script>

<style>
.groupmember-root {
    height: 75vh;
    display: flex;
    flex-direction: column;
}

.groupmember-head-container {
    background-color: var(--panel-header-bg);
}

.groupmember-head {
    margin-right: 12px;
    display: flex;
    align-items: center;
}

.groupmember-content {
    overflow: auto;
}

.groupmember-refresh {
    cursor: pointer;
    font-size: larger;
    color: #909399;
    margin-left: 10px;
}
</style>
