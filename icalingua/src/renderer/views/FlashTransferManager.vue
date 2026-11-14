<template>
    <div
        class="flash-app flash-theme icalingua-theme-holder"
        @dragenter="dragEnter"
        @dragover="dragOver"
        @dragleave="dragLeave"
        @drop="dropFiles"
    >
        <aside class="flash-sidebar" aria-label="闪传导航">
            <button :class="['flash-nav', { active: tab === 'library' }]" :disabled="busy" @click="tab = 'library'">
                <i class="el-icon-collection" /><span>我的闪传</span><em>{{ records.length }}</em>
            </button>
            <button :class="['flash-nav', { active: tab === 'create' }]" :disabled="busy" @click="tab = 'create'">
                <i class="el-icon-plus" /><span>新建闪传</span>
            </button>
        </aside>
        <main class="flash-main">
            <div v-if="dragDepth && !busy" class="flash-drop-overlay">
                <i class="el-icon-upload" />松开鼠标，添加到{{
                    tab === 'create' && folder ? '“' + folder + '”' : '新闪传'
                }}
            </div>
            <header class="flash-header">
                <h1>{{ tab === 'library' ? '我的闪传' : '新建闪传' }}</h1>
                <template v-if="tab === 'library'">
                    <el-input
                        v-model="search"
                        size="small"
                        class="flash-search"
                        prefix-icon="el-icon-search"
                        placeholder="搜索名称或文件集 ID"
                        clearable
                    />
                    <el-button size="small" type="primary" icon="el-icon-plus" @click="tab = 'create'">新建</el-button>
                </template>
            </header>
            <el-alert
                v-if="capabilityError"
                class="flash-alert"
                :title="capabilityError"
                type="warning"
                :closable="false"
                show-icon
            />
            <el-alert
                v-if="storageError"
                class="flash-alert"
                :title="storageError"
                type="error"
                :closable="false"
                show-icon
            />
            <div v-if="tab === 'library'" class="flash-library">
                <div class="flash-open-box">
                    <el-input
                        v-model="openInput"
                        size="small"
                        prefix-icon="el-icon-link"
                        placeholder="分享链接、分享码或文件集 ID"
                        clearable
                        @keyup.enter.native="openDetail(openInput)"
                    />
                    <el-button
                        size="small"
                        type="primary"
                        plain
                        :disabled="!openInput.trim()"
                        title="在新窗口中查看文件并下载"
                        @click="openDetail(openInput)"
                        >打开</el-button
                    >
                    <el-button
                        size="small"
                        :disabled="!openInput.trim() || importing"
                        :loading="importing"
                        title="仅保存到本机列表，稍后再查看"
                        @click="importRecord"
                        >保存到列表</el-button
                    >
                </div>
                <div class="flash-library-table">
                    <el-table
                        :data="filtered"
                        height="100%"
                        size="small"
                        row-key="fileset_id"
                        @row-dblclick="(record) => openDetail(record.fileset_id)"
                    >
                        <el-table-column label="名称" min-width="200">
                            <template slot-scope="scope"
                                ><span class="flash-table-name"
                                    ><i class="el-icon-files" /><button
                                        :title="scope.row.name"
                                        @click="openDetail(scope.row.fileset_id)"
                                    >
                                        {{ scope.row.name }}
                                    </button></span
                                ></template
                            >
                        </el-table-column>
                        <el-table-column label="文件" width="65"
                            ><template slot-scope="scope">{{ scope.row.file_count }}</template></el-table-column
                        >
                        <el-table-column label="大小" width="100"
                            ><template slot-scope="scope">{{ size(scope.row.total_size) }}</template></el-table-column
                        >
                        <el-table-column label="有效期" width="120"
                            ><template slot-scope="scope"
                                ><el-tag v-if="expired(scope.row)" type="info" size="mini" effect="plain">已过期</el-tag
                                ><span
                                    v-else
                                    :title="scope.row.expire_time ? time(scope.row.expire_time) : ''"
                                    :class="{ 'flash-expiring': expiringSoon(scope.row) }"
                                    >{{ expiry(scope.row.expire_time) }}</span
                                ></template
                            ></el-table-column
                        >
                        <el-table-column width="175" fixed="right" align="right">
                            <template slot-scope="scope">
                                <el-button
                                    size="mini"
                                    type="text"
                                    :disabled="expired(scope.row)"
                                    @click="share(scope.row)"
                                    >发送</el-button
                                >
                                <el-button size="mini" type="text" @click="openDetail(scope.row.fileset_id)"
                                    >详情</el-button
                                >
                                <el-dropdown trigger="click" @command="recordAction(scope.row, $event)">
                                    <el-button size="mini" type="text" icon="el-icon-more" aria-label="更多操作" />
                                    <el-dropdown-menu slot="dropdown" class="flash-popover">
                                        <el-dropdown-item command="copy">复制分享链接</el-dropdown-item>
                                        <el-dropdown-item command="id">复制文件集 ID</el-dropdown-item>
                                        <el-dropdown-item command="remove" divided>移除本地记录</el-dropdown-item>
                                    </el-dropdown-menu>
                                </el-dropdown>
                            </template>
                        </el-table-column>
                        <div slot="empty" class="flash-empty-state">
                            <i :class="search ? 'el-icon-search' : 'el-icon-files'" />
                            <strong>{{ search ? '没有匹配的闪传' : '还没有闪传' }}</strong>
                            <span>{{
                                search
                                    ? '换个关键词试试，或清除搜索查看全部记录'
                                    : '把文件拖到窗口任意位置即可开始，也可以在上方粘贴别人的分享链接'
                            }}</span>
                            <el-button v-if="search" size="small" @click="search = ''">清除搜索</el-button>
                            <el-button v-else size="small" type="primary" icon="el-icon-plus" @click="tab = 'create'"
                                >新建闪传</el-button
                            >
                        </div>
                    </el-table>
                </div>
            </div>
            <div v-else class="flash-create-body">
                <div v-if="created" class="flash-created" role="status">
                    <i class="el-icon-circle-check" />
                    <div class="flash-created-text">
                        <strong :title="created.name">闪传“{{ created.name }}”已创建</strong>
                        <span>{{ expiry(created.expire_time) }} · 已保存到“我的闪传”</span>
                    </div>
                    <el-button
                        v-if="created.share_link"
                        size="small"
                        icon="el-icon-document-copy"
                        @click="copyText(created.share_link)"
                        >复制链接</el-button
                    >
                    <el-button size="small" @click="openDetail(created.fileset_id)">查看详情</el-button>
                    <el-button size="small" type="primary" icon="el-icon-position" @click="share(created)"
                        >发送给好友 / 群</el-button
                    >
                    <button class="flash-created-close" aria-label="关闭提示" @click="created = null">
                        <i class="el-icon-close" />
                    </button>
                </div>
                <section class="flash-compose">
                    <div class="flash-compose-title">
                        <label for="flash-transfer-title">名称</label>
                        <el-input
                            id="flash-transfer-title"
                            v-model="title"
                            size="small"
                            :disabled="busy"
                            maxlength="100"
                            :placeholder="defaultTitle ? '留空将使用“' + defaultTitle + '”' : '文件集名称（选填）'"
                            @keyup.enter.native="create"
                        />
                        <el-button
                            size="small"
                            type="primary"
                            icon="el-icon-upload2"
                            :loading="uploading"
                            :disabled="collecting || !fileCount || !!capabilityError || !ready"
                            @click="create"
                            >{{ uploading ? '正在创建' : '创建闪传' }}</el-button
                        >
                    </div>
                    <div class="flash-compose-tools">
                        <el-button-group>
                            <el-button
                                size="small"
                                :disabled="busy"
                                icon="el-icon-document-add"
                                @click="addFiles(false)"
                                >添加文件</el-button
                            >
                            <el-button size="small" :disabled="busy" icon="el-icon-folder-add" @click="addFiles(true)"
                                >导入目录</el-button
                            >
                        </el-button-group>
                        <el-button size="small" :disabled="busy" icon="el-icon-plus" @click="newFolder"
                            >新建文件夹</el-button
                        >
                        <el-button
                            size="small"
                            :disabled="busy || !selection.length"
                            icon="el-icon-rank"
                            @click="moveDialog = true"
                            >移动</el-button
                        >
                        <el-button
                            size="small"
                            :disabled="busy || !selection.length"
                            icon="el-icon-delete"
                            @click="removeSelected"
                            >移除</el-button
                        >
                    </div>
                    <div
                        v-if="!entries.length"
                        class="flash-dropzone"
                        role="button"
                        tabindex="0"
                        @click="addFiles(false)"
                        @keyup.enter="addFiles(false)"
                    >
                        <i :class="collecting ? 'el-icon-loading' : 'el-icon-upload'" />
                        <strong>{{ collecting ? '正在读取文件…' : '把文件或文件夹拖到这里' }}</strong>
                        <span>也可以使用上方的“添加文件”或“导入目录”，添加后可整理目录结构再创建</span>
                    </div>
                    <div v-else class="flash-editor">
                        <aside class="flash-folder-pane">
                            <el-tree
                                :data="folderTree"
                                node-key="path"
                                :props="{ label: 'name', children: 'children' }"
                                :current-node-key="folder"
                                default-expand-all
                                highlight-current
                                :expand-on-click-node="false"
                                @node-click="selectFolder"
                            >
                                <span slot-scope="{ data }" class="flash-tree-label"
                                    ><i class="el-icon-folder" />{{ data.name }}</span
                                >
                            </el-tree>
                        </aside>
                        <div class="flash-file-pane">
                            <el-breadcrumb class="flash-breadcrumb" separator="/">
                                <el-breadcrumb-item
                                    ><button :disabled="busy" @click="folder = ''">文件集</button></el-breadcrumb-item
                                >
                                <el-breadcrumb-item v-for="(part, index) in folderParts" :key="index"
                                    ><button
                                        :disabled="busy"
                                        @click="folder = folderParts.slice(0, index + 1).join('/')"
                                    >
                                        {{ part }}
                                    </button></el-breadcrumb-item
                                >
                            </el-breadcrumb>
                            <div class="flash-draft-table-wrapper">
                                <el-table
                                    :data="currentEntries"
                                    row-key="relative_path"
                                    height="100%"
                                    size="small"
                                    tabindex="0"
                                    @selection-change="selection = $event"
                                    @row-dblclick="enterEntry"
                                    @keydown.native.delete="removeSelected"
                                    @keydown.native.backspace="goUp"
                                >
                                    <el-table-column type="selection" width="44" :selectable="() => !busy" />
                                    <el-table-column label="名称" min-width="140"
                                        ><template slot-scope="scope"
                                            ><span class="flash-table-name"
                                                ><i
                                                    :class="scope.row.is_dir ? 'el-icon-folder' : 'el-icon-document'"
                                                /><button :disabled="busy" @click="enterEntry(scope.row)">
                                                    {{ basename(scope.row.relative_path) }}
                                                </button></span
                                            ></template
                                        ></el-table-column
                                    >
                                    <el-table-column label="大小" width="90"
                                        ><template slot-scope="scope">{{
                                            scope.row.is_dir ? '文件夹' : size(scope.row.size)
                                        }}</template></el-table-column
                                    >
                                    <el-table-column width="65" align="right"
                                        ><template slot-scope="scope"
                                            ><el-button
                                                size="mini"
                                                type="text"
                                                :disabled="busy"
                                                @click="renameEntry(scope.row)"
                                                >重命名</el-button
                                            ></template
                                        ></el-table-column
                                    >
                                    <div slot="empty" class="flash-table-empty">
                                        这个文件夹是空的，可以拖入文件到这里
                                    </div>
                                </el-table>
                            </div>
                        </div>
                    </div>
                    <footer class="flash-upload-footer">
                        <span class="flash-muted">{{
                            collecting
                                ? '正在读取文件…'
                                : selection.length
                                  ? '已选择 ' + selection.length + ' 项（Delete 键移除）'
                                  : fileCount + ' 个文件 · ' + size(totalSize)
                        }}</span>
                        <div v-if="uploading" class="flash-upload-progress">
                            <span>{{
                                progress >= 100 ? '正在确认文件集…' : progress ? '正在上传…' : '正在准备文件…'
                            }}</span
                            ><el-progress :percentage="Math.min(100, Math.round(progress))" :stroke-width="4" />
                        </div>
                        <el-button
                            v-else
                            size="mini"
                            type="text"
                            :disabled="collecting || !entries.length"
                            @click="clearDraft"
                            >清空</el-button
                        >
                    </footer>
                </section>
                <el-alert
                    v-if="uploadError"
                    class="flash-alert"
                    :title="uploadError"
                    type="error"
                    :closable="false"
                    show-icon
                />
            </div>
        </main>
        <flash-transfer-share-dialog :visible.sync="shareVisible" :record="shareRecord" @sent="onShared" />
        <el-dialog title="移动所选项目" :visible.sync="moveDialog" width="420px" custom-class="flash-dialog">
            <el-select
                v-model="moveTarget"
                size="small"
                placeholder="选择目标目录"
                popper-class="flash-popover"
                style="width: 100%"
            >
                <el-option value="" label="文件集根目录" /><el-option
                    v-for="entry in entries.filter((item) => item.is_dir)"
                    :key="entry.relative_path"
                    :value="entry.relative_path"
                    :label="entry.relative_path"
                />
            </el-select>
            <span slot="footer"
                ><el-button size="small" @click="moveDialog = false">取消</el-button
                ><el-button size="small" type="primary" @click="moveSelected">移动</el-button></span
            >
        </el-dialog>
    </div>
</template>

<script>
import ipc from '../utils/ipc'
import FlashTransferShareDialog from '../components/FlashTransferShareDialog.vue'
import { createRendererLifecycleScope } from '../utils/rendererLifecycleScope'
import * as themes from '../utils/themes'
import { flashTransferInput } from '../../utils/flashTransferLink'
import {
    requestFlashTransfer,
    flashTransferStorageKey,
    loadFlashTransferRecords,
    saveFlashTransferRecord,
    flashTransferRecord,
    flashTransferName,
    addFlashTransferEntries,
    moveFlashTransferEntries,
    flashTransferFolderTree,
    flashTransferSize,
    flashTransferTime,
    flashTransferExpiry,
} from '../utils/flashTransfer'
import '../assets/flashTransfer.css'

export default {
    name: 'FlashTransferManager',
    components: { FlashTransferShareDialog },
    data() {
        return {
            alive: true,
            ready: false,
            uin: 0,
            tab: 'library',
            records: [],
            storageError: '',
            capabilityError: '',
            search: '',
            openInput: '',
            importing: false,
            entries: [],
            folder: '',
            title: '',
            selection: [],
            uploading: false,
            collecting: false,
            dragDepth: 0,
            progress: 0,
            uploadError: '',
            requestId: '',
            created: null,
            shareVisible: false,
            shareRecord: null,
            moveDialog: false,
            moveTarget: '',
        }
    },
    computed: {
        busy() {
            return this.uploading || this.collecting
        },
        filtered() {
            const search = this.search.trim().toLocaleLowerCase()
            return this.records.filter((item) => (item.name + item.fileset_id).toLocaleLowerCase().includes(search))
        },
        fileCount() {
            return this.entries.filter((item) => !item.is_dir).length
        },
        totalSize() {
            return this.entries.reduce((size, item) => size + (item.is_dir ? 0 : item.size), 0)
        },
        folderTree() {
            return flashTransferFolderTree(this.entries)
        },
        defaultTitle() {
            return this.entries.length ? this.basename(this.entries[0].relative_path) : ''
        },
        folderParts() {
            return this.folder ? this.folder.split('/') : []
        },
        currentEntries() {
            return this.entries
                .filter((item) => {
                    const parts = item.relative_path.split('/')
                    parts.pop()
                    return parts.join('/') === this.folder
                })
                .sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || a.relative_path.localeCompare(b.relative_path))
        },
    },
    async created() {
        this.lifecycleScope = createRendererLifecycleScope()
        document.title = 'QQ 闪传'
        this.lifecycleScope.onEvent(window, 'storage', (event) => {
            if (event.key === flashTransferStorageKey(this.uin)) this.loadRecords()
        })
        this.lifecycleScope.onEvent(window, 'beforeunload', (event) => {
            if (this.uploading) {
                event.preventDefault()
                event.returnValue = true
            }
        })
        this.lifecycleScope.onIpc('FlashTransferUploadProgress', (_, data) => {
            if (data.request_id === this.requestId)
                this.progress = Math.max(this.progress, Math.min(100, Number(data.percentage) || 0))
        })
        try {
            this.uin = await ipc.getUin()
            if (!this.alive) return
            this.loadRecords()
            await requestFlashTransfer({ action: 'capabilities' })
            if (this.alive) this.ready = true
        } catch (error) {
            if (this.alive) this.capabilityError = error.message
        }
        const store = await ipc.getStorePath()
        if (this.alive) themes.$$DON_CALL$$fetchThemes(store)
    },
    beforeDestroy() {
        this.alive = false
        this.lifecycleScope.dispose()
    },
    methods: {
        size: flashTransferSize,
        time: flashTransferTime,
        basename(value) {
            return value.split('/').pop()
        },
        expiry: flashTransferExpiry,
        expired(record) {
            return record.expire_time > 0 && record.expire_time * 1000 < Date.now()
        },
        expiringSoon(record) {
            return record.expire_time > 0 && record.expire_time * 1000 - Date.now() < 86400000
        },
        async copyText(value) {
            try {
                await ipc.copyFlashTransferText(value)
                if (this.alive) this.$message.success('已复制')
            } catch (error) {
                if (this.alive) this.$message.error(error.message)
            }
        },
        loadRecords() {
            try {
                this.records = loadFlashTransferRecords(this.uin)
                this.storageError = ''
            } catch (error) {
                this.storageError = '无法读取本地记录：' + error.message
            }
        },
        saveRecord(record) {
            try {
                this.records = saveFlashTransferRecord(this.uin, record)
                this.storageError = ''
                return true
            } catch (error) {
                this.storageError = '分享已存在，但本地记录保存失败：' + error.message
                return false
            }
        },
        openDetail(value) {
            const input = flashTransferInput(String(value || '').trim())
            if (input) ipc.openFlashTransferDetail(input)
        },
        async importRecord() {
            if (this.importing) return
            this.importing = true
            try {
                const id = await requestFlashTransfer({ action: 'resolve', input: flashTransferInput(this.openInput) })
                const info = await requestFlashTransfer({ action: 'stat', fileset_id: id })
                if (this.alive && this.saveRecord(flashTransferRecord(id, info, { share_link: this.openInput })))
                    this.$message.success('已保存到本机')
            } catch (error) {
                if (this.alive) this.$message.error(error.message)
            } finally {
                if (this.alive) this.importing = false
            }
        },
        share(record) {
            this.shareRecord = record
            this.shareVisible = true
        },
        onShared(record) {
            this.saveRecord({ ...record, last_shared_at: Date.now() })
        },
        async recordAction(record, action) {
            if (action === 'copy' || action === 'id') {
                if (action === 'copy' && !record.share_link) {
                    this.$message.info('该记录没有分享链接，可从详情中查看')
                    return
                }
                return this.copyText(action === 'id' ? record.fileset_id : record.share_link)
            }
            try {
                await this.$confirm('仅移除本机保存的记录，不会删除云端文件。', '移除本地记录', {
                    type: 'warning',
                    customClass: 'flash-message-box',
                })
            } catch {
                return
            }
            if (!this.alive) return
            try {
                const records = this.records.filter((item) => item.fileset_id !== record.fileset_id)
                localStorage.setItem(flashTransferStorageKey(this.uin), JSON.stringify(records))
                this.records = records
            } catch (error) {
                this.$message.error('移除失败：' + error.message)
            }
        },
        selectFolder(node) {
            if (!this.busy) {
                this.folder = node.path
                this.selection = []
            }
        },
        enterEntry(entry) {
            if (entry.is_dir && !this.busy) {
                this.folder = entry.relative_path
                this.selection = []
            }
        },
        goUp() {
            if (this.busy || !this.folder) return
            this.folder = this.folderParts.slice(0, -1).join('/')
            this.selection = []
        },
        async addFiles(directory, files) {
            if (this.busy) return
            this.collecting = true
            try {
                const rows = files
                    ? await ipc.collectFlashTransferFiles(files)
                    : await ipc.selectFlashTransferFiles(directory)
                if (this.alive && rows.length) {
                    this.entries = addFlashTransferEntries(this.entries, rows, this.folder)
                    this.created = null
                }
            } catch (error) {
                if (this.alive) this.$message.error(error.message)
            } finally {
                if (this.alive) this.collecting = false
            }
        },
        dragEnter(event) {
            if (!Array.from(event.dataTransfer.types).includes('Files')) return
            event.preventDefault()
            this.dragDepth++
        },
        dragOver(event) {
            if (!Array.from(event.dataTransfer.types).includes('Files')) return
            event.preventDefault()
            event.dataTransfer.dropEffect = this.busy ? 'none' : 'copy'
        },
        dragLeave(event) {
            if (Array.from(event.dataTransfer.types).includes('Files')) this.dragDepth = Math.max(0, this.dragDepth - 1)
        },
        dropFiles(event) {
            this.dragDepth = 0
            const files = Array.from(event.dataTransfer.files)
            if (!files.length) return
            event.preventDefault()
            if (this.busy) return
            if (this.tab !== 'create') this.folder = ''
            this.tab = 'create'
            return this.addFiles(false, files)
        },
        async promptName(title, value = '') {
            try {
                const result = await this.$prompt('名称', title, {
                    inputValue: value,
                    customClass: 'flash-message-box',
                    inputValidator: (value) => {
                        try {
                            flashTransferName(value)
                            return true
                        } catch (error) {
                            return error.message
                        }
                    },
                })
                return flashTransferName(result.value)
            } catch {
                return null
            }
        },
        async newFolder() {
            const name = await this.promptName('新建文件夹')
            if (!name || !this.alive) return
            try {
                this.entries = addFlashTransferEntries(
                    this.entries,
                    [{ relative_path: name, is_dir: true, size: 0 }],
                    this.folder,
                )
            } catch (error) {
                this.$message.error(error.message)
            }
        },
        async renameEntry(entry) {
            const name = await this.promptName('重命名', this.basename(entry.relative_path))
            if (!name || !this.alive) return
            const parts = entry.relative_path.split('/')
            parts.pop()
            try {
                this.entries = moveFlashTransferEntries(this.entries, entry.relative_path, [...parts, name].join('/'))
                this.selection = []
            } catch (error) {
                this.$message.error(error.message)
            }
        },
        removeSelected() {
            if (this.busy || !this.selection.length) return
            const paths = this.selection.map((item) => item.relative_path)
            this.entries = this.entries.filter(
                (item) =>
                    !paths.some(
                        (parent) => item.relative_path === parent || item.relative_path.startsWith(parent + '/'),
                    ),
            )
            this.selection = []
        },
        moveSelected() {
            try {
                let entries = this.entries
                for (const item of this.selection)
                    entries = moveFlashTransferEntries(
                        entries,
                        item.relative_path,
                        (this.moveTarget ? this.moveTarget + '/' : '') + this.basename(item.relative_path),
                    )
                this.entries = entries
                this.selection = []
                this.moveDialog = false
            } catch (error) {
                this.$message.error(error.message)
            }
        },
        clearDraft() {
            this.entries = []
            this.selection = []
            this.folder = ''
            this.created = null
            this.uploadError = ''
        },
        async create() {
            if (this.busy || !this.fileCount || !this.ready) return
            this.uploading = true
            this.progress = 0
            this.uploadError = ''
            this.created = null
            this.requestId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)
            const count = this.fileCount,
                total = this.totalSize,
                name = this.title.trim() || this.basename(this.entries[0].relative_path)
            try {
                const task = await requestFlashTransfer({
                    action: 'upload',
                    request_id: this.requestId,
                    name,
                    entries: this.entries.map((item) => ({ ...item })),
                })
                if (!this.alive) return
                const record = flashTransferRecord(task.fileset_id, {
                    name,
                    total_file_count: count,
                    total_file_size: total,
                    share_link: task.share_link,
                    expire_time: task.expire_time,
                })
                this.saveRecord(record)
                this.created = record
                this.progress = 100
                this.entries = []
                this.folder = ''
                this.selection = []
                this.$message.success('闪传已创建，可以查看或发送给好友 / 群聊')
            } catch (error) {
                if (this.alive) this.uploadError = error.message
            } finally {
                if (this.alive) {
                    this.uploading = false
                    this.requestId = ''
                }
            }
        },
    },
}
</script>
