<template>
    <el-dialog :visible.sync="visible" :title="title" width="600px" top="10vh" @close="handleClose">
        <div v-if="loading" style="text-align: center; padding: 20px">
            <i class="el-icon-loading" style="font-size: 24px"></i>
            <p style="margin-top: 10px">正在查找共同群聊...</p>
        </div>
        <div v-else-if="commonGroups.length === 0" style="text-align: center; padding: 20px; color: #909399">
            <i class="el-icon-warning" style="font-size: 48px"></i>
            <p style="margin-top: 10px">未找到共同群聊</p>
            <p style="font-size: 12px">可能是因为群成员列表尚未缓存，请先打开一些群聊后再试</p>
        </div>
        <div v-else class="common-groups-list">
            <div
                v-for="group in commonGroups"
                :key="group.groupId"
                class="group-item"
                @click="openGroup(group.groupId)"
            >
                <el-avatar :src="getAvatarUrl(-group.groupId)" size="medium" />
                <div class="group-info">
                    <div class="group-name">
                        {{ removeEmotes ? removeGroupNameEmotes(group.groupName) : group.groupName }}
                    </div>
                    <div class="group-desc">
                        <span>群号: {{ group.groupId }}</span>
                        <span v-if="group.memberInfo.card" class="member-card">
                            · 群名片: {{ group.memberInfo.card }}
                        </span>
                    </div>
                </div>
                <div class="group-actions">
                    <el-button size="mini" type="text" icon="el-icon-chat-line-round">打开</el-button>
                </div>
            </div>
        </div>
        <div slot="footer" class="dialog-footer">
            <div style="float: left; font-size: 12px; color: #909399">
                找到 {{ commonGroups.length }} 个共同群聊
                <span v-if="cacheStats">(已缓存 {{ cacheStats.cachedGroups }} 个群)</span>
            </div>
            <el-button @click="handleClose">关闭</el-button>
        </div>
    </el-dialog>
</template>

<script>
import getAvatarUrl from '../../utils/getAvatarUrl'
import removeGroupNameEmotes from '../../utils/removeGroupNameEmotes'
import groupMemberCache from '../utils/groupMemberCache'
import { ipcRenderer } from 'electron'

export default {
    name: 'CommonGroupsDialog',
    data() {
        return {
            visible: false,
            loading: false,
            userId: 0,
            userName: '',
            commonGroups: [],
            cacheStats: null,
            removeEmotes: false,
        }
    },
    computed: {
        title() {
            return `与 ${this.userName} 的共同群聊`
        },
    },
    async created() {
        this.removeEmotes = (await ipcRenderer.invoke('getSettings')).removeGroupNameEmotes || false
        // 监听打开对话框事件
        ipcRenderer.on('showCommonGroups', async (_, userId, userName) => {
            await this.show(userId, userName)
        })
    },
    methods: {
        async show(userId, userName) {
            this.visible = true
            this.loading = true
            this.userId = userId
            this.userName = userName
            this.commonGroups = []

            try {
                // 查找共同群聊
                this.commonGroups = await groupMemberCache.findCommonGroups(userId)
                this.cacheStats = groupMemberCache.getStats()
            } catch (error) {
                console.error('Failed to find common groups:', error)
                this.$message.error('查找共同群聊失败')
            } finally {
                this.loading = false
            }
        },
        handleClose() {
            this.visible = false
            this.commonGroups = []
            this.userId = 0
            this.userName = ''
        },
        openGroup(groupId) {
            this.$emit('chroom', -groupId)
            this.handleClose()
        },
        getAvatarUrl,
        removeGroupNameEmotes,
    },
}
</script>

<style scoped lang="scss">
.common-groups-list {
    max-height: calc(80vh - 200px);
    overflow-y: auto;
}

.group-item {
    display: flex;
    align-items: center;
    padding: 12px;
    border-bottom: 1px solid var(--chat-border-color, #e4e7ed);
    cursor: pointer;
    transition: background-color 0.3s;

    &:hover {
        background-color: var(--panel-item-bg-hover, #f5f7fa);
    }

    &:last-child {
        border-bottom: none;
    }
}

.group-info {
    flex: 1;
    margin-left: 12px;
    min-width: 0;
}

.group-name {
    font-weight: bold;
    font-size: 14px;
    color: var(--panel-color-name, #303133);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.group-desc {
    font-size: 12px;
    color: var(--panel-color-desc, #909399);
    margin-top: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.member-card {
    margin-left: 4px;
}

.group-actions {
    margin-left: 12px;
}

.dialog-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
}
</style>
