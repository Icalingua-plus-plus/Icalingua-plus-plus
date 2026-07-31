<template>
    <el-dialog title="编辑分组" :visible.sync="dialogVisible" width="400px" @close="$emit('update:visible', false)">
        <div class="editor-content">
            <div class="group-help" role="note">
                <i class="el-icon-info"></i>
                <div>
                    <div class="group-help-title">分组说明</div>
                    <div>All Chats 显示全部会话；Group 仅显示群聊；Private 仅显示私聊。</div>
                    <div>打开会话后，右键对应自定义分组即可添加或移除当前会话。</div>
                    <div>开启开关后，该自定义分组会自动包含所有私聊。</div>
                </div>
            </div>
            <div class="group-list">
                <draggable
                    v-model="localGroups"
                    handle=".drag-handle"
                    animation="200"
                    ghost-class="ghost"
                    :force-fallback="true"
                    fallback-class="drag-fallback"
                >
                    <div v-for="(group, idx) in localGroups" :key="group._key" class="group-item">
                        <i class="el-icon-rank drag-handle"></i>
                        <div class="group-info">
                            <span v-if="editingIndex !== idx" class="group-name" @dblclick="startRename(idx)">
                                {{ group.name }}
                            </span>
                            <el-input
                                v-else
                                v-model="editingName"
                                size="mini"
                                class="rename-input"
                                ref="renameInput"
                                @keyup.enter.native="confirmRename(idx)"
                                @keyup.esc.native="cancelRename"
                                @blur="confirmRename(idx)"
                            />
                        </div>
                        <div class="group-actions">
                            <el-tooltip content="包含所有私聊" placement="top" :open-delay="500">
                                <el-switch v-model="group.includeAllPersonal" size="mini" active-color="#67C23A" />
                            </el-tooltip>
                            <el-button type="text" icon="el-icon-edit" size="mini" @click="startRename(idx)" />
                            <el-button
                                type="text"
                                icon="el-icon-delete"
                                size="mini"
                                class="delete-btn"
                                @click="removeGroup(idx)"
                            />
                        </div>
                    </div>
                </draggable>
                <div v-if="localGroups.length === 0" class="empty-tip">暂无分组</div>
            </div>
            <div class="add-group">
                <el-input
                    v-model="newGroupName"
                    placeholder="新分组名称"
                    size="small"
                    maxlength="10"
                    show-word-limit
                    @keyup.enter.native="addGroup"
                >
                    <el-button slot="append" icon="el-icon-plus" @click="addGroup">添加</el-button>
                </el-input>
            </div>
        </div>
        <span slot="footer">
            <el-button size="small" @click="dialogVisible = false">取消</el-button>
            <el-button type="primary" size="small" @click="save">保存</el-button>
        </span>
    </el-dialog>
</template>

<script>
import draggable from 'vuedraggable'
import ipc from '../utils/ipc'
let keyCounter = 0
export default {
    name: 'ChatGroupEditor',
    components: { draggable },
    props: {
        visible: Boolean,
        chatGroups: Array,
    },
    data() {
        return {
            localGroups: [],
            newGroupName: '',
            editingIndex: -1,
            editingName: '',
        }
    },
    computed: {
        dialogVisible: {
            get() {
                return this.visible
            },
            set(val) {
                this.$emit('update:visible', val)
            },
        },
    },
    watch: {
        visible(val) {
            if (val) {
                // 深拷贝一份用于编辑
                this.localGroups = this.chatGroups.map((g) => ({
                    name: g.name,
                    index: g.index,
                    rooms: [...g.rooms],
                    includeAllPersonal: !!g.includeAllPersonal,
                    _originalName: g.name,
                    _key: ++keyCounter,
                }))
                this.newGroupName = ''
                this.editingIndex = -1
            }
        },
    },
    methods: {
        startRename(idx) {
            this.editingIndex = idx
            this.editingName = this.localGroups[idx].name
            this.$nextTick(() => {
                const input = this.$refs.renameInput
                if (input) {
                    const el = Array.isArray(input) ? input[0] : input
                    el.focus()
                }
            })
        },
        confirmRename(idx) {
            if (this.editingIndex === -1) return
            const newName = this.editingName.trim()
            if (!newName) {
                this.cancelRename()
                return
            }
            if (['chats', 'group', 'private'].includes(newName)) {
                this.$message({ type: 'error', message: '不能使用保留名称' })
                this.cancelRename()
                return
            }
            // 检查重名
            const duplicate = this.localGroups.find((g, i) => i !== idx && g.name === newName)
            if (duplicate) {
                this.$message({ type: 'error', message: '分组名称重复' })
                this.cancelRename()
                return
            }
            this.localGroups[idx].name = newName
            this.editingIndex = -1
        },
        cancelRename() {
            this.editingIndex = -1
        },
        removeGroup(idx) {
            const name = this.localGroups[idx].name
            this.$confirm(`确定删除分组「${name}」？`, '提示', {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning',
            })
                .then(() => {
                    this.localGroups.splice(idx, 1)
                })
                .catch(() => {})
        },
        addGroup() {
            const name = this.newGroupName.trim()
            if (!name) return
            if (name.length > 10) {
                this.$message({ type: 'error', message: '分组名称不能超过10个字符' })
                return
            }
            if (['chats', 'group', 'private'].includes(name)) {
                this.$message({ type: 'error', message: '不能使用保留名称' })
                return
            }
            const duplicate = this.localGroups.find((g) => g.name === name)
            if (duplicate) {
                this.$message({ type: 'error', message: '分组名称重复' })
                return
            }
            this.localGroups.push({
                name,
                index: this.localGroups.length + 1,
                rooms: [-1],
                includeAllPersonal: false,
                _originalName: null,
                _key: ++keyCounter,
            })
            this.newGroupName = ''
        },
        save() {
            const oldNames = this.chatGroups.map((g) => g.name)
            const newNames = this.localGroups.map((g) => g.name)

            // 删除不在新列表中的分组
            for (const oldName of oldNames) {
                if (!this.localGroups.find((g) => g._originalName === oldName)) {
                    ipc.removeChatGroup(oldName)
                }
            }

            // 添加新分组 + 更新已有分组（重命名/重排序）
            this.localGroups.forEach((g, idx) => {
                const newIndex = idx + 1
                if (g._originalName === null) {
                    // 新增的分组
                    ipc.addChatGroup({
                        name: g.name,
                        index: newIndex,
                        rooms: g.rooms,
                        includeAllPersonal: g.includeAllPersonal,
                    })
                } else {
                    // 已有分组，更新名称和顺序
                    ipc.updateChatGroup(g._originalName, {
                        name: g.name,
                        index: newIndex,
                        rooms: g.rooms,
                        includeAllPersonal: g.includeAllPersonal,
                    })
                }
            })

            // 更新父组件的 chatGroups
            this.$emit(
                'saved',
                this.localGroups.map((g, idx) => ({
                    name: g.name,
                    index: idx + 1,
                    rooms: g.rooms,
                    includeAllPersonal: g.includeAllPersonal,
                })),
            )
            this.dialogVisible = false
            this.$message({ type: 'success', message: '分组已保存' })
        },
    },
}
</script>

<style scoped lang="scss">
.group-list {
    max-height: 300px;
    overflow-y: auto;
    margin-bottom: 16px;
}

.group-help {
    display: flex;
    gap: 8px;
    padding: 10px 12px;
    margin-bottom: 16px;
    color: #606266;
    font-size: 12px;
    line-height: 1.6;
    background-color: var(--panel-header-bg, #f5f7fa);
    border: 1px solid var(--chat-border-color, #ebeef5);
    border-radius: 4px;

    > i {
        flex-shrink: 0;
        margin-top: 3px;
        color: #409eff;
    }
}

.group-help-title {
    margin-bottom: 2px;
    color: #303133;
    font-weight: 600;
}

.group-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid var(--chat-border-color, #ebeef5);
    transition: background-color 0.2s;

    &:hover {
        background-color: var(--panel-header-bg, #f5f7fa);
    }

    &:last-child {
        border-bottom: none;
    }
}

.group-info {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;

    i {
        margin-right: 8px;
        color: #909399;
    }

    .group-name {
        cursor: default;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .rename-input {
        width: 120px;
    }
}

.group-actions {
    display: flex;
    align-items: center;
    margin-left: 8px;
    flex-shrink: 0;
    gap: 4px;

    .el-button {
        padding: 4px;
        margin-left: 0;
    }

    .el-switch {
        margin-right: 4px;
    }

    .delete-btn {
        color: #f56c6c;
    }
}

.empty-tip {
    text-align: center;
    color: #909399;
    padding: 20px;
}

.add-group {
    padding: 0 4px;
}

.drag-handle {
    cursor: grab;
    color: #c0c4cc;
    margin-right: 8px;
    font-size: 14px;

    &:hover {
        color: #409eff;
    }

    &:active {
        cursor: grabbing;
    }
}

.ghost {
    opacity: 0.4;
    background-color: var(--panel-header-bg, #e8f4ff);
}
</style>
