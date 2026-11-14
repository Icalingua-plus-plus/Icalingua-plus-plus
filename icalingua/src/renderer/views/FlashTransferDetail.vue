<template>
    <div class="flash-detail flash-theme icalingua-theme-holder">
        <header class="flash-detail-header">
            <h1>闪传详情</h1>
            <el-button size="small" icon="el-icon-collection" @click="openManager">我的闪传</el-button>
        </header>
        <div class="flash-detail-body">
            <section class="flash-detail-input">
                <el-input
                    size="small"
                    v-model="input"
                    clearable
                    placeholder="分享链接、分享码或文件集 ID"
                    :disabled="loading"
                    @keyup.enter.native="load"
                    ><i slot="prefix" class="el-input__icon el-icon-link" /></el-input
                ><el-button
                    size="small"
                    type="primary"
                    :loading="loading"
                    :disabled="!input.trim() || fetchingUrls"
                    @click="load"
                    >打开闪传</el-button
                >
            </section>
            <el-alert v-if="error" class="flash-alert" :title="error" type="error" :closable="false" show-icon />
            <el-alert v-if="notice" class="flash-alert" :title="notice" type="warning" :closable="false" show-icon />
            <div v-if="loading && !record" class="flash-loading">
                <i class="el-icon-loading" />
                <p>正在读取文件集…</p>
            </div>
            <template v-if="record">
                <section class="flash-detail-summary">
                    <div class="flash-summary-text">
                        <div>
                            <h2 :title="record.name">{{ record.name }}</h2>
                            <button
                                class="flash-fileset-id"
                                :title="record.fileset_id"
                                aria-label="复制文件集 ID"
                                @click="copy(record.fileset_id)"
                            >
                                <i class="el-icon-copy-document" />
                            </button>
                            <el-tag :type="expired ? 'info' : 'success'" size="small" effect="plain">{{
                                expired ? '已过期' : '文件集'
                            }}</el-tag>
                        </div>
                        <p>
                            {{ record.file_count }} 个文件 <span>·</span> {{ size(record.total_size) }} <span>·</span>
                            <span :title="record.expire_time ? time(record.expire_time) : ''">{{
                                expiry(record.expire_time)
                            }}</span>
                        </p>
                    </div>
                    <div class="flash-summary-actions">
                        <el-button
                            size="small"
                            :icon="saved ? 'el-icon-star-on' : 'el-icon-star-off'"
                            :disabled="loading || saved"
                            @click="save"
                            >{{ saved ? '已在我的闪传' : '保存到我的闪传' }}</el-button
                        ><el-button
                            size="small"
                            type="primary"
                            icon="el-icon-position"
                            :disabled="expired"
                            @click="shareVisible = true"
                            >发送给好友 / 群</el-button
                        >
                    </div>
                </section>
                <div class="flash-detail-toolbar">
                    <el-button
                        v-if="breadcrumbs.length"
                        size="mini"
                        icon="el-icon-back"
                        title="返回上一级（Backspace）"
                        aria-label="返回上一级"
                        :disabled="busy"
                        @click="goUp"
                    /><el-breadcrumb separator="/"
                        ><el-breadcrumb-item
                            ><button :disabled="busy" @click="browseRoot">文件集</button></el-breadcrumb-item
                        ><el-breadcrumb-item v-for="(part, index) in breadcrumbs" :key="part.id"
                            ><button :disabled="busy" @click="browseCrumb(index)">
                                {{ part.name }}
                            </button></el-breadcrumb-item
                        ></el-breadcrumb
                    ><span class="flash-tools-spacer" /><el-button
                        size="small"
                        icon="el-icon-refresh"
                        :disabled="busy"
                        @click="refreshDirectory"
                        >刷新</el-button
                    ><el-button
                        size="small"
                        icon="el-icon-document-copy"
                        :loading="fetchingUrls"
                        :disabled="busy || !rows.length || expired"
                        @click="getLinks"
                        >获取{{ selected.length ? '所选' : '当前目录' }}下载清单</el-button
                    >
                </div>
                <div class="flash-detail-table">
                    <el-table
                        size="small"
                        :data="rows"
                        v-loading="loading"
                        height="100%"
                        row-key="cli_fileid"
                        tabindex="0"
                        @keydown.native.backspace="goUp"
                        @selection-change="selected = $event"
                        @row-dblclick="openFolder"
                        ><el-table-column
                            type="selection"
                            width="44"
                            :selectable="(row) => !busy && (row.is_dir || !!(row.physical && row.physical.id))"
                        /><el-table-column label="名称" min-width="250"
                            ><template slot-scope="scope"
                                ><span class="flash-table-name"
                                    ><i :class="scope.row.is_dir ? 'el-icon-folder' : 'el-icon-document'" /><button
                                        @click="openFolder(scope.row)"
                                    >
                                        {{ scope.row.name }}
                                    </button></span
                                ></template
                            ></el-table-column
                        ><el-table-column label="大小" width="120"
                            ><template slot-scope="scope">{{
                                scope.row.is_dir ? '文件夹' : size(scope.row.file_size)
                            }}</template></el-table-column
                        ><el-table-column label="状态" width="115"
                            ><template slot-scope="scope"
                                ><el-tag
                                    v-if="!scope.row.is_dir"
                                    :type="
                                        scope.row.physical && scope.row.physical.status === 2
                                            ? 'success'
                                            : scope.row.physical && scope.row.physical.status === 3
                                              ? 'danger'
                                              : 'info'
                                    "
                                    size="small"
                                    effect="plain"
                                    >{{ fileStatus(scope.row) }}</el-tag
                                ><span v-else class="flash-muted"
                                    >{{ scope.row.file_count || 0 }} 个子项</span
                                ></template
                            ></el-table-column
                        ><el-table-column width="92"
                            ><template slot-scope="scope"
                                ><el-button
                                    size="small"
                                    type="text"
                                    :disabled="
                                        busy ||
                                        expired ||
                                        (!scope.row.is_dir && !(scope.row.physical && scope.row.physical.id))
                                    "
                                    @click="getLinks([scope.row])"
                                    >{{ scope.row.is_dir ? '下载目录' : '下载' }}</el-button
                                ></template
                            ></el-table-column
                        >
                        <div slot="empty" class="flash-table-empty">
                            <i class="el-icon-folder-opened" /><strong>这个目录没有文件</strong
                            ><span>可刷新目录，或返回上一级查看</span>
                        </div></el-table
                    >
                </div>
                <footer class="flash-detail-footer">
                    <span>{{
                        selected.length ? '已选择 ' + selected.length + ' 项' : '共 ' + rows.length + ' 项'
                    }}</span
                    ><el-button size="small" v-if="record.share_link" type="text" @click="copy(record.share_link)"
                        >复制分享链接</el-button
                    ><el-button size="small" v-if="record.share_link" type="text" @click="openWebsite"
                        >在浏览器中打开</el-button
                    >
                </footer>
            </template>
            <div v-if="!record && !loading" class="flash-empty-state">
                <i class="el-icon-link" />
                <strong>打开别人分享的闪传</strong>
                <span>粘贴分享链接、分享码或文件集 ID，即可浏览文件并批量下载</span>
                <el-button size="small" type="primary" icon="el-icon-document-copy" @click="pasteAndLoad"
                    >从剪贴板粘贴并打开</el-button
                >
            </div>
        </div>
        <flash-transfer-share-dialog :visible.sync="shareVisible" :record="record" @sent="shared" />
        <el-dialog
            title="批量下载清单"
            :visible.sync="urlsVisible"
            width="86%"
            custom-class="flash-dialog flash-download-dialog"
            :close-on-click-modal="!downloading"
            :show-close="!downloading"
        >
            <div class="flash-download-caption">
                <i class="el-icon-folder-opened" /><span
                    >{{ downloads.length }} 个文件 · {{ size(downloadSize)
                    }}<small>地址为临时下载链接；过期后请重新获取。</small></span
                >
            </div>
            <el-table size="small" :data="downloads" max-height="380"
                ><el-table-column prop="path" label="相对路径" min-width="220" show-overflow-tooltip /><el-table-column
                    label="大小"
                    width="105"
                    ><template slot-scope="scope">{{ size(scope.row.size) }}</template></el-table-column
                ><el-table-column label="下载地址" min-width="220"
                    ><template slot-scope="scope"
                        ><button class="flash-url-copy" :title="scope.row.url" @click="copy(scope.row.url)">
                            {{ scope.row.url }} <i class="el-icon-copy-document" /></button></template></el-table-column
            ></el-table>
            <el-alert
                v-if="downloadError"
                class="flash-alert"
                :title="downloadError"
                type="error"
                :closable="false"
                show-icon
            />
            <span slot="footer"
                ><el-button size="small" :disabled="downloading" @click="copyList">复制路径与链接 JSON</el-button
                ><el-button
                    size="small"
                    type="primary"
                    icon="el-icon-download"
                    :loading="downloading"
                    :disabled="!downloads.length"
                    @click="downloadAll"
                    >选择目录并批量下载</el-button
                ></span
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
    loadFlashTransferRecords,
    saveFlashTransferRecord,
    flashTransferRecord,
    flashTransferSize,
    flashTransferTime,
    flashTransferExpiry,
} from '../utils/flashTransfer'
import '../assets/flashTransfer.css'

export default {
    name: 'FlashTransferDetail',
    components: { FlashTransferShareDialog },
    data() {
        return {
            alive: true,
            uin: 0,
            input: String(this.$route.query.input || ''),
            loading: false,
            fetchingUrls: false,
            downloading: false,
            error: '',
            notice: '',
            record: null,
            rows: [],
            breadcrumbs: [],
            selected: [],
            saved: false,
            epoch: 0,
            shareVisible: false,
            urlsVisible: false,
            downloads: [],
            downloadError: '',
        }
    },
    computed: {
        busy() {
            return this.loading || this.fetchingUrls || this.downloading
        },
        expired() {
            return this.record && this.record.expire_time > 0 && this.record.expire_time * 1000 < Date.now()
        },
        downloadSize() {
            return this.downloads.reduce((size, item) => size + item.size, 0)
        },
    },
    async created() {
        this.lifecycleScope = createRendererLifecycleScope()
        document.title = '闪传详情'
        this.uin = await ipc.getUin()
        if (!this.alive) return
        if (this.input) this.load()
        const store = await ipc.getStorePath()
        if (this.alive) themes.$$DON_CALL$$fetchThemes(store)
    },
    beforeDestroy() {
        this.alive = false
        this.epoch++
        this.lifecycleScope.dispose()
    },
    methods: {
        size: flashTransferSize,
        time: flashTransferTime,
        expiry: flashTransferExpiry,
        openManager() {
            ipc.openFlashTransfer()
        },
        async copy(value) {
            try {
                await ipc.copyFlashTransferText(value)
                if (this.alive) this.$message.success('已复制')
            } catch (error) {
                if (this.alive) this.$message.error(error.message)
            }
        },
        async load() {
            if (this.busy || !this.input.trim()) return
            const epoch = ++this.epoch
            this.loading = true
            this.error = ''
            this.notice = ''
            this.rows = []
            this.record = null
            this.selected = []
            this.breadcrumbs = []
            this.downloads = []
            try {
                const id = await requestFlashTransfer({ action: 'resolve', input: flashTransferInput(this.input) })
                const [info, rows] = await Promise.all([
                    requestFlashTransfer({ action: 'stat', fileset_id: id }),
                    requestFlashTransfer({ action: 'list', fileset_id: id }),
                ])
                if (!this.alive || epoch !== this.epoch) return
                let old
                try {
                    old = loadFlashTransferRecords(this.uin).find((item) => item.fileset_id === id)
                } catch (error) {
                    this.notice = '本地记录无法读取：' + error.message
                }
                this.record = flashTransferRecord(id, info, { ...old, share_link: old?.share_link || this.input })
                this.rows = rows
                this.saved = !!old
                if (this.saved) this.persist()
            } catch (error) {
                if (this.alive && epoch === this.epoch) this.error = error.message
            } finally {
                if (this.alive && epoch === this.epoch) this.loading = false
            }
        },
        fileStatus(file) {
            if (file.physical?.status === 3) return '上传失败'
            return file.physical?.id && file.physical?.status === 2 ? '可下载' : '等待上传'
        },
        async browse(crumbs) {
            if (this.busy || !this.record) return
            const epoch = ++this.epoch
            this.loading = true
            this.error = ''
            this.selected = []
            this.downloads = []
            try {
                const rows = await requestFlashTransfer({
                    action: 'list',
                    fileset_id: this.record.fileset_id,
                    parent_id: crumbs.length ? crumbs[crumbs.length - 1].id : '',
                })
                if (this.alive && epoch === this.epoch) {
                    this.rows = rows
                    this.breadcrumbs = crumbs
                }
            } catch (error) {
                if (this.alive && epoch === this.epoch) this.error = error.message
            } finally {
                if (this.alive && epoch === this.epoch) this.loading = false
            }
        },
        openFolder(file) {
            if (file.is_dir) this.browse([...this.breadcrumbs, { id: file.cli_fileid, name: file.name }])
        },
        browseRoot() {
            this.browse([])
        },
        browseCrumb(index) {
            this.browse(this.breadcrumbs.slice(0, index + 1))
        },
        goUp() {
            if (this.breadcrumbs.length) this.browse(this.breadcrumbs.slice(0, -1))
        },
        async pasteAndLoad() {
            let text = ''
            try {
                text = (await navigator.clipboard.readText()).trim()
            } catch {}
            if (!this.alive) return
            if (!text) {
                this.$message.info('剪贴板中没有文本，请手动粘贴到输入框')
                return
            }
            this.input = text
            this.load()
        },
        refreshDirectory() {
            this.browse(this.breadcrumbs.slice())
        },
        persist() {
            try {
                saveFlashTransferRecord(this.uin, this.record)
                this.saved = true
                return true
            } catch (error) {
                this.notice = '本地记录保存失败：' + error.message
                return false
            }
        },
        save() {
            if (this.persist()) this.$message.success('已保存到我的闪传')
        },
        shared() {
            this.record = { ...this.record, last_shared_at: Date.now() }
            this.persist()
        },
        openWebsite() {
            ipc.openFlashTransferWebsite(this.record.share_link).catch((error) => this.$message.error(error.message))
        },
        async getLinks(files) {
            if (this.busy || !this.record) return
            const selected = Array.isArray(files) ? files : this.selected.length ? this.selected : this.rows
            if (!selected.length) return
            this.fetchingUrls = true
            this.error = ''
            this.downloadError = ''
            try {
                const links = await requestFlashTransfer({
                    action: 'urls',
                    fileset_id: this.record.fileset_id,
                    files: selected,
                    prefix: this.breadcrumbs.map((item) => item.name).join('/'),
                })
                if (!this.alive) return
                if (!links.length) {
                    this.$message.info('目录中没有可下载的文件')
                    return
                }
                this.downloads = links
                this.urlsVisible = true
            } catch (error) {
                if (this.alive) this.error = error.message
            } finally {
                if (this.alive) this.fetchingUrls = false
            }
        },
        copyList() {
            return this.copy(
                JSON.stringify(
                    this.downloads.map(({ path, url }) => ({ path, url })),
                    null,
                    4,
                ),
            )
        },
        async downloadAll() {
            if (this.downloading) return
            this.downloading = true
            this.downloadError = ''
            try {
                const result = await ipc.downloadFlashTransferFiles(this.downloads)
                if (!this.alive || result.canceled) return
                if (result.failed.length)
                    this.downloadError =
                        `已交给下载器 ${result.queued} 项，${result.failed.length} 项失败：` +
                        result.failed.map((item) => item.path + '：' + item.error).join('；')
                else {
                    this.$message.success(`已将 ${result.queued} 项交给下载管理器`)
                    this.urlsVisible = false
                }
            } catch (error) {
                if (this.alive) this.downloadError = error.message
            } finally {
                if (this.alive) this.downloading = false
            }
        },
    },
}
</script>
