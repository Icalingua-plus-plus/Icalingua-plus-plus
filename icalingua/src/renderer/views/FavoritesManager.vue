<template>
    <div class="favorites-manager favorites-theme icalingua-theme-holder">
        <div class="favorites-workspace">
            <aside class="favorites-sidebar" aria-label="收藏分组">
                <div class="favorites-sidebar-top">
                    <button :class="['favorites-nav', { active: activeGroup === 'all' }]" @click="changeGroup('all')">
                        <i class="el-icon-collection"></i><span>全部收藏</span><em>{{ total }}</em>
                    </button>
                    <button
                        :class="['favorites-nav', { active: activeGroup === 'starred' }]"
                        @click="changeGroup('starred')"
                    >
                        <i class="el-icon-star-off"></i><span>星标收藏</span><em>{{ starredCount }}</em>
                    </button>
                    <button
                        :class="['favorites-nav', { active: activeGroup === 'ungrouped' }]"
                        @click="changeGroup('ungrouped')"
                    >
                        <i class="el-icon-folder-opened"></i><span>未分组</span>
                    </button>
                </div>
                <div class="favorites-sidebar-label">
                    <span>我的分组</span
                    ><button
                        title="新建分组"
                        aria-label="新建分组"
                        class="favorites-icon-button"
                        :disabled="busy"
                        @click="createGroup"
                    >
                        <i class="el-icon-plus"></i>
                    </button>
                </div>
                <div class="favorites-groups">
                    <button
                        v-for="group in groups"
                        :key="group.custom_group_id"
                        :class="['favorites-nav', { active: activeGroup === 'group:' + group.custom_group_id }]"
                        @click="changeGroup('group:' + group.custom_group_id)"
                    >
                        <i class="el-icon-folder"></i><span :title="group.name">{{ group.name }}</span
                        ><em v-if="group.total_count !== undefined">{{ group.total_count }}</em>
                    </button>
                    <p v-if="!groups.length" class="favorite-helper favorites-sidebar-empty">
                        {{ groupsError ? '分组暂时无法读取' : '新建分组，整理你的收藏' }}
                    </p>
                </div>
                <button class="favorites-manage-groups" @click="groupDialog = true">
                    <i class="el-icon-setting"></i> 管理分组
                </button>
                <div class="favorites-space">
                    <template v-if="space"
                        ><div>
                            <span>收藏空间</span><span>{{ spacePercent }}%</span>
                        </div>
                        <el-progress :percentage="spacePercent" :show-text="false" :stroke-width="4" />
                        <p>{{ formatSize(space.used_space) }} / {{ formatSize(space.total_space) }}</p></template
                    >
                    <span v-else class="favorite-helper">{{
                        spaceError ? '空间信息暂不可用' : '正在读取空间信息…'
                    }}</span>
                </div>
            </aside>
            <Multipane ref="panes" class="favorites-panes" @paneResize="resizePane" @paneResizeStop="finishPaneResize">
                <main
                    ref="listPane"
                    class="favorites-list-pane"
                    :style="{ width: listWidth + 'px' }"
                    aria-label="收藏列表"
                >
                    <div class="favorites-list-toolbar">
                        <div class="favorites-search-row">
                            <el-input
                                v-model="keyword"
                                size="small"
                                clearable
                                prefix-icon="el-icon-search"
                                placeholder="搜索标题、摘要或文件名"
                                aria-label="搜索收藏"
                            />
                            <el-button
                                size="small"
                                icon="el-icon-refresh"
                                circle
                                title="刷新收藏"
                                aria-label="刷新收藏"
                                :loading="loading"
                                :disabled="loadingMore || mutationBusy"
                                @click="refresh()"
                            />
                            <el-button
                                type="primary"
                                size="small"
                                icon="el-icon-plus"
                                :disabled="busy"
                                @click="openEditor()"
                                >新建</el-button
                            >
                        </div>
                        <div class="favorites-filters">
                            <el-select
                                v-model="typeFilter"
                                size="mini"
                                :popper-append-to-body="false"
                                aria-label="按类型筛选"
                            >
                                <el-option :value="0" label="全部类型" />
                                <el-option
                                    v-for="type in types"
                                    :key="type.value"
                                    :value="type.value"
                                    :label="type.label"
                                />
                            </el-select>
                            <el-select
                                v-model="sortOrder"
                                size="mini"
                                :popper-append-to-body="false"
                                aria-label="排序方式"
                            >
                                <el-option value="newest" label="最新收藏" /><el-option
                                    value="oldest"
                                    label="最早收藏"
                                />
                            </el-select>
                        </div>
                    </div>
                    <div class="favorites-selection-bar">
                        <el-checkbox
                            :value="allVisibleSelected"
                            :indeterminate="someVisibleSelected && !allVisibleSelected"
                            :disabled="!visibleItems.length || mutationBusy"
                            @change="selectVisible"
                            >{{ selectedIds.length ? '已选 ' + selectedIds.length + ' 项' : '选择' }}</el-checkbox
                        >
                        <div v-if="selectedIds.length" class="favorites-selection-actions">
                            <el-button type="text" size="mini" :disabled="busy" @click="openMove(selectedIds)"
                                >移动</el-button
                            ><el-button type="text" size="mini" :disabled="busy" @click="deleteItems(selectedIds)"
                                >删除</el-button
                            ><el-button type="text" size="mini" :disabled="busy" @click="selectedIds = []"
                                >取消</el-button
                            >
                        </div>
                        <span v-else class="favorite-helper"
                            >{{ visibleItems.length }} 项{{ isFiltered ? '匹配' : '' }}</span
                        >
                    </div>
                    <div v-if="isFiltered && hasMore" class="favorites-search-scope">
                        <span>当前筛选已加载的 {{ items.length }} 项</span
                        ><el-button
                            v-if="!loadAllActive"
                            type="text"
                            size="mini"
                            :disabled="loadingMore"
                            @click="loadAll"
                            >加载全部</el-button
                        ><el-button v-else type="text" size="mini" @click="loadAllActive = false">停止加载</el-button>
                    </div>
                    <div v-if="listError" class="favorite-inline-error favorites-list-error" role="alert">
                        <i class="el-icon-warning-outline"></i><span>{{ listError }}</span
                        ><el-button type="text" size="mini" @click="refresh()">重试</el-button>
                    </div>
                    <div class="favorites-list" v-loading="loading" aria-live="polite">
                        <div
                            v-for="item in visibleItems"
                            :key="item.cid"
                            :class="[
                                'favorite-row',
                                { selected: selectedCid === item.cid, checked: selectedIds.includes(item.cid) },
                            ]"
                        >
                            <el-checkbox
                                :value="selectedIds.includes(item.cid)"
                                :disabled="busy"
                                :aria-label="'选择 ' + title(item)"
                                @change="toggleSelection(item.cid, $event)"
                            />
                            <button
                                class="favorite-row-open"
                                :aria-pressed="selectedCid === item.cid"
                                @click="selectItem(item.cid)"
                            >
                                <div class="favorite-row-icon"><i :class="typeInfo(item.type).icon"></i></div>
                                <div class="favorite-row-content">
                                    <div class="favorite-row-title">{{ title(item) }}</div>
                                    <p>{{ excerpt(item) || typeInfo(item.type).label + '收藏' }}</p>
                                    <div class="favorite-row-meta">
                                        <span>{{ typeInfo(item.type).label }}</span
                                        ><span v-if="groupName(item.custom_group_id)">{{
                                            groupName(item.custom_group_id)
                                        }}</span
                                        ><time>{{ shortTime(item.collect_time || item.create_time) }}</time>
                                    </div>
                                </div>
                            </button>
                            <button
                                :class="['favorites-icon-button', 'favorite-row-star', { starred: item.star_mark }]"
                                :title="item.star_mark ? '取消星标' : '设为星标'"
                                :aria-label="item.star_mark ? '取消星标' : '设为星标'"
                                :disabled="busy"
                                @click="toggleStar(item)"
                            >
                                <i :class="item.star_mark ? 'el-icon-star-on' : 'el-icon-star-off'"></i>
                            </button>
                        </div>
                        <div v-if="!visibleItems.length && !loading && !listError" class="favorite-empty">
                            <i :class="isFiltered ? 'el-icon-search' : 'el-icon-collection'"></i>
                            <h3>{{ isFiltered ? '没有找到匹配的收藏' : '还没有收藏' }}</h3>
                            <p>
                                {{ isFiltered ? '试试其他关键词、分组或类型。' : '保存一段文字、一份灵感或一个链接。' }}
                            </p>
                            <el-button v-if="!isFiltered" type="primary" size="small" @click="openEditor()"
                                >创建第一条收藏</el-button
                            >
                        </div>
                        <div v-if="items.length && !hasMore" class="favorites-list-end">
                            已加载全部 {{ items.length }} 条收藏
                        </div>
                    </div>
                    <footer v-if="hasMore || loadingMore" class="favorites-list-footer">
                        <span>已加载 {{ items.length }} / {{ total || '—' }} 项</span
                        ><el-button v-if="loadAllActive" type="text" size="mini" @click="loadAllActive = false"
                            >停止加载</el-button
                        ><el-button
                            v-else
                            type="text"
                            size="mini"
                            :loading="loadingMore"
                            :disabled="busy"
                            @click="loadMore"
                            >加载更多</el-button
                        >
                    </footer>
                </main>
                <MultipaneResizer
                    class="favorites-pane-resizer"
                    role="separator"
                    tabindex="0"
                    aria-label="调整收藏列表与详情宽度"
                    aria-orientation="vertical"
                    :aria-valuenow="Math.round(listWidth)"
                    :aria-valuemin="240"
                    :aria-valuemax="maxListWidth"
                    title="拖动调整宽度，双击恢复默认"
                    @keydown.native.left.prevent="resizeListBy(-24)"
                    @keydown.native.right.prevent="resizeListBy(24)"
                    @keydown.native.home.prevent="resetListWidth"
                    @dblclick.native="resetListWidth"
                />
                <favorite-detail
                    ref="detailView"
                    :detail="detail"
                    :loading="detailLoading"
                    :error="detailError"
                    :group-name="detail ? groupName(detail.collection.custom_group_id) : ''"
                    :busy="busy"
                    :colors="previewColors"
                    @retry="selectItem(selectedCid, true)"
                    @edit="openEditor(detail)"
                    @star="toggleStar(detail.collection)"
                    @delete="deleteItems([selectedCid])"
                    @move="openMove([selectedCid])"
                />
            </Multipane>
        </div>
        <favorite-editor
            ref="editor"
            :visible.sync="editorVisible"
            :detail="editorDetail"
            :groups="groups"
            :initial-group-id="currentGroupId"
            :colors="previewColors"
            @saved="onSaved"
        />
        <el-dialog
            title="移动收藏"
            :visible.sync="moveDialog"
            custom-class="favorite-small-dialog"
            width="400px"
            :close-on-click-modal="!mutationBusy"
            :close-on-press-escape="!mutationBusy"
            :show-close="!mutationBusy"
        >
            <p class="favorite-dialog-description">将 {{ moveIds.length }} 条收藏移至</p>
            <el-select v-model="moveGroupId" class="favorite-full-width" :popper-append-to-body="false" :disabled="busy"
                ><el-option :value="0" label="未分组" /><el-option
                    v-for="group in groups"
                    :key="group.custom_group_id"
                    :value="group.custom_group_id"
                    :label="group.name"
            /></el-select>
            <span slot="footer"
                ><el-button size="small" :disabled="busy" @click="moveDialog = false">取消</el-button
                ><el-button type="primary" size="small" :loading="mutationBusy" @click="moveItems"
                    >确定移动</el-button
                ></span
            >
        </el-dialog>
        <el-dialog
            title="管理分组"
            :visible.sync="groupDialog"
            custom-class="favorite-small-dialog"
            width="500px"
            :close-on-click-modal="!groupBusy"
            :close-on-press-escape="!groupBusy"
            :show-close="!groupBusy"
        >
            <div class="favorites-group-dialog-header">
                <span class="favorite-helper">{{ groups.length }} 个分组</span
                ><el-button type="primary" size="small" icon="el-icon-plus" :disabled="busy" @click="createGroup"
                    >新建分组</el-button
                >
            </div>
            <div v-for="group in groups" :key="group.custom_group_id" class="favorites-group-edit-row">
                <i class="el-icon-folder"></i><span>{{ group.name }}</span
                ><el-button size="mini" type="text" :disabled="busy" @click="renameGroup(group)">重命名</el-button
                ><el-button size="mini" type="text" :disabled="busy" @click="deleteGroup(group)">删除</el-button>
            </div>
            <div v-if="!groups.length" class="favorite-empty favorite-empty-inline">
                <i class="el-icon-folder-opened"></i>
                <p>{{ groupsError || '还没有分组，创建一个开始整理吧' }}</p>
            </div>
        </el-dialog>
    </div>
</template>

<script>
import ipc from '../utils/ipc'
import { Multipane, MultipaneResizer } from '../components/multipane'
import FavoriteDetail from '../components/favorites/FavoriteDetail.vue'
import FavoriteEditor from '../components/favorites/FavoriteEditor.vue'
import { createRendererLifecycleScope } from '../utils/rendererLifecycleScope'
import {
    favoriteTypes,
    favoriteTitle,
    favoriteExcerpt,
    favoriteType,
    favoriteTime,
    favoriteSize,
    favoriteRequest,
    isFavoriteVisible,
    mergeFavoritePage,
    favoritePageSignature,
} from '../utils/favorites'
import * as themes from '../utils/themes'
import '../assets/favorites.css'

const PAGE_SIZE = 50
const DEFAULT_LIST_WIDTH = 380
const MIN_LIST_WIDTH = 240
const MIN_DETAIL_WIDTH = 280
const LIST_WIDTH_KEY = 'icalingua:favorites-list-width'

export default {
    name: 'FavoritesManager',
    components: { FavoriteDetail, FavoriteEditor, Multipane, MultipaneResizer },
    data() {
        return {
            listWidth: DEFAULT_LIST_WIDTH,
            maxListWidth: DEFAULT_LIST_WIDTH,
            types: favoriteTypes,
            items: [],
            groups: [],
            space: null,
            total: 0,
            nextOffset: 0,
            serverTotal: 0,
            pageSignature: '',
            hasMore: false,
            activeGroup: 'all',
            keyword: '',
            typeFilter: 0,
            sortOrder: 'newest',
            selectedIds: [],
            selectedCid: '',
            detail: null,
            detailLoading: false,
            detailError: '',
            loading: false,
            loadingMore: false,
            loadAllActive: false,
            mutationBusy: false,
            groupBusy: false,
            listError: '',
            groupsError: '',
            spaceError: '',
            editorVisible: false,
            editorDetail: null,
            groupDialog: false,
            moveDialog: false,
            moveIds: [],
            moveGroupId: 0,
            loadEpoch: 0,
            detailEpoch: 0,
            alive: true,
            previewColors: {},
        }
    },
    computed: {
        busy() {
            return this.loading || this.loadingMore || this.mutationBusy || this.groupBusy
        },
        currentGroupId() {
            return this.activeGroup.startsWith('group:') ? Number(this.activeGroup.slice(6)) : 0
        },
        starredCount() {
            return this.items.filter((item) => item.star_mark).length + (this.hasMore ? '+' : '')
        },
        isFiltered() {
            return Boolean(this.keyword.trim() || this.typeFilter || this.activeGroup !== 'all')
        },
        spacePercent() {
            const capacity = Number(this.space?.total_space)
            return capacity > 0
                ? Math.max(0, Math.min(100, Math.round((Number(this.space.used_space) / capacity) * 100)))
                : 0
        },
        visibleItems() {
            const query = this.keyword.trim().toLocaleLowerCase()
            return this.items
                .filter((item) => {
                    if (!isFavoriteVisible(item)) return false
                    if (this.typeFilter && item.type !== this.typeFilter) return false
                    if (this.activeGroup === 'starred' && !item.star_mark) return false
                    if (this.activeGroup === 'ungrouped' && item.custom_group_id) return false
                    if (this.currentGroupId && item.custom_group_id !== this.currentGroupId) return false
                    return (
                        !query ||
                        [favoriteTitle(item), favoriteExcerpt(item), item.author?.str_id, item.cid]
                            .filter(Boolean)
                            .join(' ')
                            .toLocaleLowerCase()
                            .includes(query)
                    )
                })
                .slice()
                .sort((a, b) => {
                    const delta =
                        Number(b.collect_time || b.create_time || 0) - Number(a.collect_time || a.create_time || 0)
                    return this.sortOrder === 'newest' ? delta : -delta
                })
        },
        allVisibleSelected() {
            return (
                this.visibleItems.length > 0 && this.visibleItems.every((item) => this.selectedIds.includes(item.cid))
            )
        },
        someVisibleSelected() {
            return this.visibleItems.some((item) => this.selectedIds.includes(item.cid))
        },
    },
    watch: {
        keyword() {
            this.selectedIds = []
        },
        typeFilter() {
            this.selectedIds = []
        },
    },
    async created() {
        this.lifecycleScope = createRendererLifecycleScope()
        document.title = '收藏管理'
        this.lifecycleScope.onIpc('theme:use', this.updatePreviewColors)
        this.lifecycleScope.onIpc('theme:refresh', this.updatePreviewColors)
        this.lifecycleScope.onIpc('OpenFavoriteImage', (_, url) => {
            this.$refs.detailView?.openImageUrl(url)
        })
        this.lifecycleScope.onEvent(window, 'beforeunload', (event) => {
            if (this.editorVisible && this.$refs.editor?.isDirty) {
                event.preventDefault()
                event.returnValue = true
            }
        })
        this.lifecycleScope.onEvent(window, 'resize', () => this.applyListWidth(this.listWidth))
        this.refresh()
        const storePath = await ipc.getStorePath()
        if (!this.alive) return
        themes.$$DON_CALL$$fetchThemes(storePath)
    },
    mounted() {
        let width = DEFAULT_LIST_WIDTH
        try {
            const saved = Number(localStorage.getItem(LIST_WIDTH_KEY))
            if (Number.isFinite(saved) && saved >= MIN_LIST_WIDTH) width = saved
        } catch {}
        this.applyListWidth(width)
    },
    beforeDestroy() {
        this.alive = false
        this.loadAllActive = false
        this.loadEpoch++
        this.detailEpoch++
        this.lifecycleScope.dispose()
    },
    methods: {
        updatePreviewColors() {
            const theme = themes.recalcTheme()
            this.previewColors = {
                foreground: theme['--chat-color'],
                background: theme['--chat-content-bg-color'],
                accent: theme['--panel-color-sticker-type-selected'],
                border: theme['--chat-markdown-border'],
                codeBackground: theme['--chat-markdown-bg'],
                codeForeground: theme['--chat-markdown-color-multi'],
                inlineCodeForeground: theme['--chat-markdown-color'],
            }
        },
        applyListWidth(width) {
            const available = this.$refs.panes?.$el.clientWidth
            if (!available) return
            this.maxListWidth = Math.max(MIN_LIST_WIDTH, available - MIN_DETAIL_WIDTH)
            this.listWidth = Math.min(this.maxListWidth, Math.max(MIN_LIST_WIDTH, Number(width) || DEFAULT_LIST_WIDTH))
            if (this.$refs.listPane) this.$refs.listPane.style.width = this.listWidth + 'px'
        },
        resizePane(pane, resizer, size) {
            if (pane === this.$refs.listPane) this.applyListWidth(parseFloat(size))
        },
        finishPaneResize(pane, resizer, size) {
            this.resizePane(pane, resizer, size)
            try {
                localStorage.setItem(LIST_WIDTH_KEY, String(this.listWidth))
            } catch {}
        },
        resizeListBy(delta) {
            this.applyListWidth(this.listWidth + delta)
            try {
                localStorage.setItem(LIST_WIDTH_KEY, String(this.listWidth))
            } catch {}
        },
        resetListWidth() {
            this.applyListWidth(DEFAULT_LIST_WIDTH)
            try {
                localStorage.removeItem(LIST_WIDTH_KEY)
            } catch {}
        },
        title: favoriteTitle,
        excerpt: favoriteExcerpt,
        typeInfo: favoriteType,
        formatSize: favoriteSize,
        shortTime(value) {
            return favoriteTime(value).split(' ')[0]
        },
        groupName(id) {
            return this.groups.find((group) => group.custom_group_id === id)?.name || ''
        },
        changeGroup(group) {
            this.activeGroup = group
            this.selectedIds = []
        },
        toggleSelection(cid, selected) {
            this.selectedIds = selected
                ? [...new Set([...this.selectedIds, cid])]
                : this.selectedIds.filter((id) => id !== cid)
        },
        selectVisible(value) {
            this.selectedIds = value ? this.visibleItems.map((item) => item.cid) : []
        },
        async loadMetadata() {
            await Promise.all([
                favoriteRequest({ action: 'groups' })
                    .then((data) => {
                        if (this.alive) {
                            this.groups = data.customgroupinfo_list || []
                            this.groupsError = ''
                        }
                    })
                    .catch((error) => {
                        if (this.alive) this.groupsError = error.message
                    }),
                favoriteRequest({ action: 'space' })
                    .then((data) => {
                        if (this.alive) {
                            this.space = data
                            this.spaceError = ''
                        }
                    })
                    .catch((error) => {
                        if (this.alive) this.spaceError = error.message
                    }),
            ])
        },
        async refresh(preferredCid) {
            if (this.loading || this.loadingMore || this.mutationBusy) return
            const epoch = ++this.loadEpoch
            this.loading = true
            this.loadAllActive = false
            this.listError = ''
            const metadata = this.loadMetadata()
            try {
                const data = await favoriteRequest({ action: 'list', options: { page_size: PAGE_SIZE, start_pos: 0 } })
                if (!this.alive || epoch !== this.loadEpoch) return
                const page = data.collection_list || []
                this.items = mergeFavoritePage([], page)
                this.nextOffset = page.length
                this.serverTotal = 0
                this.pageSignature = favoritePageSignature(page)
                this.updatePageState(data, page.length)
                this.selectedIds = []
                const cid =
                    preferredCid ||
                    (this.items.some((item) => item.cid === this.selectedCid)
                        ? this.selectedCid
                        : this.visibleItems[0]?.cid)
                if (cid) await this.selectItem(cid, true)
                else {
                    this.selectedCid = ''
                    this.detail = null
                    this.detailError = ''
                }
            } catch (error) {
                if (this.alive && epoch === this.loadEpoch) this.listError = error.message || '收藏列表读取失败'
            } finally {
                if (this.alive && epoch === this.loadEpoch) this.loading = false
            }
            await metadata
        },
        updatePageState(data, pageLength) {
            // 游标按原始同步记录前进；只有展示和计数需要排除删除标记。
            this.serverTotal = Math.max(Number(data.total_count) || this.serverTotal, this.nextOffset)
            this.hasMore =
                pageLength > 0 &&
                (data.result === 215000 ||
                    (data.total_count === undefined ? pageLength === PAGE_SIZE : this.nextOffset < this.serverTotal))
            this.total = this.hasMore ? this.serverTotal - this.nextOffset + this.items.length : this.items.length
        },
        async loadMore() {
            if (!this.hasMore || this.loading || this.loadingMore || this.mutationBusy) return false
            const epoch = this.loadEpoch
            this.loadingMore = true
            this.listError = ''
            try {
                const data = await favoriteRequest({
                    action: 'list',
                    options: { page_size: PAGE_SIZE, start_pos: this.nextOffset },
                })
                if (!this.alive || epoch !== this.loadEpoch) return false
                const page = data.collection_list || []
                const signature = favoritePageSignature(page)
                if (page.length && signature === this.pageSignature)
                    throw new Error('服务端未返回新的同步记录，请刷新列表后重试')
                this.items = mergeFavoritePage(this.items, page)
                this.nextOffset += page.length
                this.pageSignature = signature
                this.updatePageState(data, page.length)
                return true
            } catch (error) {
                if (this.alive) this.listError = error.message || '加载更多失败'
                return false
            } finally {
                if (this.alive) this.loadingMore = false
            }
        },
        async loadAll() {
            if (this.loadAllActive) return
            this.loadAllActive = true
            let pages = 0
            while (this.alive && this.loadAllActive && this.hasMore && pages++ < 200) {
                if (!(await this.loadMore())) break
            }
            if (this.alive) this.loadAllActive = false
        },
        async selectItem(cid, force = false) {
            if (!cid || (!force && cid === this.selectedCid && this.detail)) return
            const epoch = ++this.detailEpoch
            this.selectedCid = cid
            this.detail = null
            this.detailError = ''
            this.detailLoading = true
            try {
                const detail = await favoriteRequest({ action: 'get', cid })
                if (!this.alive || epoch !== this.detailEpoch) return
                if (!isFavoriteVisible(detail.collection)) {
                    const existed = this.items.some((item) => item.cid === cid)
                    this.items = this.items.filter((item) => item.cid !== cid)
                    if (existed) this.total = Math.max(this.items.length, this.total - 1)
                    throw new Error('这条收藏已删除或不可用，请刷新列表')
                }
                this.detail = detail
            } catch (error) {
                if (this.alive && epoch === this.detailEpoch) this.detailError = error.message || '收藏详情读取失败'
            } finally {
                if (this.alive && epoch === this.detailEpoch) this.detailLoading = false
            }
        },
        openEditor(detail = null) {
            this.editorDetail = detail
            this.editorVisible = true
        },
        async onSaved(cid) {
            await this.refresh(cid)
            if (!this.alive || !this.detail || this.detail.collection.cid !== cid) return
            const index = this.items.findIndex((item) => item.cid === cid)
            if (index === -1) this.items.unshift(this.detail.collection)
            else this.$set(this.items, index, this.detail.collection)
        },
        async toggleStar(item) {
            if (!item || this.busy) return
            this.mutationBusy = true
            try {
                const value = !item.star_mark
                await favoriteRequest({ action: 'edit', cid: item.cid, changes: { star_mark: value } })
                if (!this.alive) return
                const stored = this.items.find((entry) => entry.cid === item.cid)
                if (stored) this.$set(stored, 'star_mark', value)
                if (this.detail?.collection.cid === item.cid) this.$set(this.detail.collection, 'star_mark', value)
            } catch (error) {
                if (this.alive) this.$message.error(error.message)
            } finally {
                if (this.alive) this.mutationBusy = false
            }
        },
        openMove(ids) {
            this.moveIds = ids.slice()
            this.moveGroupId = this.currentGroupId
            this.moveDialog = true
        },
        async applyBatch(action, ids, groupId) {
            const succeeded = []
            for (let offset = 0; offset < ids.length; offset += 10) {
                const chunk = ids.slice(offset, offset + 10)
                try {
                    const result = await favoriteRequest({ action, cid: chunk, groupId })
                    if (!Array.isArray(result.results)) throw new Error('批量结果不完整，请刷新确认')
                    chunk.forEach((id) => {
                        const entry = result.results.find((item) => String(item.id) === String(id))
                        if (entry?.result === 0) succeeded.push(id)
                    })
                } catch (error) {
                    if (this.alive) this.$message.error(error.message)
                    break
                }
            }
            return { succeeded, failed: ids.filter((id) => !succeeded.includes(id)) }
        },
        async moveItems() {
            if (this.mutationBusy) return
            this.mutationBusy = true
            try {
                const result = await this.applyBatch('move', this.moveIds, this.moveGroupId)
                if (!this.alive) return
                this.items.forEach((item) => {
                    if (result.succeeded.includes(item.cid)) this.$set(item, 'custom_group_id', this.moveGroupId)
                })
                if (this.detail && result.succeeded.includes(this.selectedCid))
                    this.$set(this.detail.collection, 'custom_group_id', this.moveGroupId)
                this.moveDialog = false
                this.selectedIds = result.failed
                this.batchFeedback(result, '移动')
                await this.loadMetadata()
            } finally {
                if (this.alive) this.mutationBusy = false
            }
        },
        async deleteItems(ids) {
            if (!ids.length || this.busy) return
            try {
                await this.$confirm(`确定删除这 ${ids.length} 条收藏吗？删除后无法恢复。`, '删除收藏', {
                    confirmButtonText: '删除',
                    cancelButtonText: '取消',
                    type: 'warning',
                    customClass: 'favorites-message-box',
                })
            } catch {
                return
            }
            if (!this.alive) return
            this.mutationBusy = true
            try {
                const result = await this.applyBatch('delete', ids)
                if (!this.alive) return
                this.items = this.items.filter((item) => !result.succeeded.includes(item.cid))
                this.total = Math.max(0, this.total - result.succeeded.length)
                this.selectedIds = result.failed
                if (result.succeeded.includes(this.selectedCid)) {
                    this.detailEpoch++
                    this.selectedCid = ''
                    this.detail = null
                    if (this.visibleItems.length) await this.selectItem(this.visibleItems[0].cid)
                }
                this.batchFeedback(result, '删除')
                await this.loadMetadata()
            } finally {
                if (this.alive) this.mutationBusy = false
            }
        },
        batchFeedback(result, action) {
            if (result.failed.length)
                this.$message.warning(
                    `已${action} ${result.succeeded.length} 项，${result.failed.length} 项未完成，请刷新确认后重试`,
                )
            else this.$message.success(`已${action} ${result.succeeded.length} 项收藏`)
        },
        async promptGroup(title, initial = '') {
            try {
                const result = await this.$prompt('分组名称', title, {
                    inputValue: initial,
                    confirmButtonText: '保存',
                    cancelButtonText: '取消',
                    inputValidator: (value) =>
                        (Boolean(value?.trim()) && value.trim().length <= 100) || '请输入 1~100 字的分组名称',
                    customClass: 'favorites-message-box',
                })
                return result.value.trim()
            } catch {
                return null
            }
        },
        async createGroup() {
            const name = await this.promptGroup('新建分组')
            if (!name || !this.alive) return
            this.groupBusy = true
            try {
                await favoriteRequest({ action: 'addGroup', name })
                await this.loadMetadata()
                if (this.alive) this.$message.success('分组已创建')
            } catch (error) {
                if (this.alive) this.$message.error(error.message)
            } finally {
                if (this.alive) this.groupBusy = false
            }
        },
        async renameGroup(group) {
            const name = await this.promptGroup('重命名分组', group.name)
            if (!name || name === group.name || !this.alive) return
            this.groupBusy = true
            try {
                await favoriteRequest({ action: 'editGroup', groupId: group.custom_group_id, name })
                await this.loadMetadata()
                if (this.alive) this.$message.success('分组已重命名')
            } catch (error) {
                if (this.alive) this.$message.error(error.message)
            } finally {
                if (this.alive) this.groupBusy = false
            }
        },
        async deleteGroup(group) {
            try {
                await this.$confirm(`确定删除分组“${group.name}”吗？`, '删除分组', {
                    confirmButtonText: '删除',
                    cancelButtonText: '取消',
                    type: 'warning',
                    customClass: 'favorites-message-box',
                })
            } catch {
                return
            }
            if (!this.alive) return
            this.groupBusy = true
            try {
                const result = await favoriteRequest({ action: 'deleteGroup', groupId: group.custom_group_id })
                if (!result.success) throw new Error('分组删除失败，请刷新后重试')
                if (!this.alive) return
                if (this.currentGroupId === group.custom_group_id) this.changeGroup('all')
                await this.refresh()
                if (this.alive) this.$message.success('分组已删除')
            } catch (error) {
                if (this.alive) this.$message.error(error.message)
            } finally {
                if (this.alive) this.groupBusy = false
            }
        },
    },
}
</script>
