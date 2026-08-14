<template>
    <div class="bg" :class="{ 'bg-bottom': bottomMode }" ondragstart="return false">
        <div class="head" :class="{ 'head-compact': bottomMode }">
            <div class="title">
                <a @click="setPanel('stickers')" :class="{ selected: panel === 'stickers' }">Stickers</a>
                <a @click="setPanel('face')" :class="{ selected: panel === 'face' }">Face</a>
                <a @click="setPanel('remote')" :class="{ selected: panel === 'remote' }" v-if="supportRemote">Remote</a>
                <a @click="setPanel('emojis')" :class="{ selected: panel === 'emojis' }">Emojis</a>
            </div>
            <a @click="menu">
                <div class="opinion">
                    <i class="el-icon-more"></i>
                </div>
            </a>
        </div>
        <div v-show="panel === 'face'" class="panel face-panel" ref="facePanel">
            <div class="subheader" v-show="recentFace.length">最近使用</div>
            <div class="grid" v-show="recentFace.length">
                <div v-for="i in recentFace" :key="i">
                    <img
                        :src="getFacePreview(i)"
                        @click="pickFace(i)"
                        @click.right="pickLottie(i)"
                        :title="getFaceName(i)"
                    />
                </div>
            </div>
            <div class="subheader">
                超级表情<br />
                <small>右键作为超级表情发送</small>
            </div>
            <div class="grid">
                <div v-for="i in faceIdToLottie.keys()" :key="i">
                    <img
                        :src="getFacePreview(i)"
                        @click="pickFace(i)"
                        @click.right="pickLottie(i)"
                        :title="getFaceName(i)"
                    />
                </div>
            </div>
            <div class="subheader">全部表情</div>
            <div class="grid" v-show="face.length">
                <div v-for="i in face" :key="i">
                    <img
                        :src="getFacePreview(i)"
                        @click="pickFace(i)"
                        @click.right="pickLottie(i)"
                        :title="getFaceName(i)"
                    />
                </div>
            </div>
        </div>
        <div v-show="panel === 'remote'" class="panel" ref="remotePanel" @scroll.passive="onRemoteScroll">
            <div class="subheader" v-show="recentRemoteSticker.length">最近使用</div>
            <div class="grid" v-show="recentRemoteSticker.length">
                <div v-for="i in recentRemoteSticker" :key="i">
                    <img
                        :src="getRemoteStickerPreview(i)"
                        :data-remote-url="i"
                        :data-preview-key="getRemotePreviewKey(i)"
                        @click="sendRemoteSticker(i)"
                        @click.right="remoteStickerMenu(i, $event)"
                        @error="remoteErrorHandler"
                        @mouseover="onRemoteStickerMouseover"
                        @mouseout="onRemoteStickerMouseout"
                    />
                </div>
            </div>
            <div class="subheader" v-show="recentRemoteSticker.length">全部表情</div>
            <div class="empty" v-show="!remote_pics.length">No remote stickers found</div>
            <div
                class="remote-virtual-grid"
                ref="remoteVirtualGrid"
                v-show="remote_pics.length"
                :style="{ height: remoteGridHeight + 'px' }"
            >
                <div
                    class="grid remote-virtual-grid-content"
                    :style="{
                        transform: `translateY(${remoteGridOffset}px)`,
                        gridTemplateColumns: `repeat(${remoteGridColumns}, minmax(0, 1fr))`,
                    }"
                >
                    <div v-for="i in visibleRemoteStickers" :key="i.id">
                        <img
                            :src="getRemoteStickerPreview(i.url)"
                            :data-remote-url="i.url"
                            :data-preview-key="getRemotePreviewKey(i.url)"
                            @click="sendRemoteSticker(i.url)"
                            @click.right="remoteStickerMenu(i.url, $event)"
                            @error="remoteErrorHandler"
                            @mouseover="onRemoteStickerMouseover"
                            @mouseout="onRemoteStickerMouseout"
                        />
                    </div>
                </div>
            </div>
        </div>
        <div class="stickers-body" v-if="panel === 'stickers'">
            <div class="panel" ref="stickersPanel" @scroll.passive="onStickerScroll">
                <div class="empty" v-show="!pics.length">
                    No stickers found
                    <el-button v-show="current_dir !== RECENT_CATEGORY" @click="folder">Open stickers folder</el-button>
                </div>
                <div class="sticker-virtual-grid" v-show="pics.length" :style="{ height: stickerGridHeight + 'px' }">
                    <div
                        class="grid sticker-virtual-grid-content"
                        :style="{
                            transform: `translateY(${stickerGridOffset}px)`,
                            gridTemplateColumns: `repeat(${stickerGridColumns}, minmax(0, 1fr))`,
                        }"
                    >
                        <div v-for="i in visibleStickers" :key="i">
                            <img
                                :src="getStickerPreview(i)"
                                :data-relative-path="i"
                                :data-preview-key="getStickerPreviewKey(i)"
                                @click="sendLocalSticker(i)"
                                @click.right="localStickerMenu(i, $event)"
                                @error="errorHandler"
                                @mouseover="onmouseover"
                                @mouseout="onmouseout"
                            />
                        </div>
                    </div>
                </div>
            </div>
            <div class="stickers_dir" ref="stickers_dir">
                <a @click="changeCurrentDir(RECENT_CATEGORY)" :class="{ selected: current_dir === RECENT_CATEGORY }">
                    Recent
                </a>
                <a @click="changeCurrentDir(DEFAULT_CATEGORY)" :class="{ selected: current_dir === DEFAULT_CATEGORY }">
                    Default
                </a>
                <a
                    v-for="i in subdirs"
                    :key="i"
                    @click="changeCurrentDir(i)"
                    @click.right="dirMenu(i, $event)"
                    :class="{ selected: current_dir === i }"
                    >{{ i }}</a
                >
            </div>
        </div>
        <div class="emoji-panel" v-show="panel === 'emojis'">
            <VEmojiPicker @select="$emit('selectEmoji', $event)" />
        </div>
    </div>
</template>

<script>
import { VEmojiPicker } from 'v-emoji-picker'
import { shell } from 'electron'
import ipc from '../utils/ipc'
import { createRendererLifecycleScope } from '../utils/rendererLifecycleScope'
import fs from 'fs'
import path from 'path'
import md5 from 'md5'
import getStaticPath from '../../utils/getStaticPath'
import { faceIdToLottie } from '@icalingua/types/LottieFaceType'

const faceMap = require('oicq-icalingua-plus-plus/lib/message/face').map

const DEFAULT_CATEGORY = Symbol('DEFAULT')
const RECENT_CATEGORY = Symbol('RECENT')

const RECENTS = {
    max: {
        recentLocalSticker: 120,
        recentRemoteSticker: 8,
        recentFace: 18,
    },
    recents: {},
    get(name) {
        if (!(name in this.recents)) {
            this.recents[name] = []
            try {
                const recents = JSON.parse(localStorage[name])
                if (recents instanceof Array) {
                    this.recents[name] = recents
                }
            } catch (e) {}
        }
        return this.recents[name]
    },
    push(name, img) {
        let recents = this.get(name)
        const index = recents.indexOf(img)
        if (index !== -1) {
            recents = [img, ...recents.slice(0, index), ...recents.slice(index + 1)]
        } else {
            recents = [img, ...recents.slice(0, this.max[name] - 1)]
        }
        localStorage[name] = JSON.stringify(recents)
        this.recents[name] = recents
    },
}

export default {
    name: 'Stickers',
    components: { VEmojiPicker },
    computed: {
        stickerGridRows() {
            return this.stickerGridColumns > 0 ? Math.ceil(this.pics.length / this.stickerGridColumns) : 0
        },
        stickerGridHeight() {
            return this.stickerGridRows * this.stickerGridItemSize
        },
        stickerGridStartRow() {
            if (this.stickerGridItemSize <= 0) return 0
            return Math.max(0, Math.floor(this.stickerScrollTop / this.stickerGridItemSize) - this.stickerBufferRows)
        },
        stickerGridEndRow() {
            if (this.stickerGridItemSize <= 0) return 0
            const viewportHeight = this.stickerPanelHeight || (this.bottomMode ? 320 : window.innerHeight)
            return Math.min(
                this.stickerGridRows,
                Math.ceil((this.stickerScrollTop + viewportHeight) / this.stickerGridItemSize) + this.stickerBufferRows,
            )
        },
        stickerGridOffset() {
            return this.stickerGridStartRow * this.stickerGridItemSize
        },
        visibleStickers() {
            const start = this.stickerGridStartRow * this.stickerGridColumns
            const end = Math.min(this.pics.length, this.stickerGridEndRow * this.stickerGridColumns)
            return this.pics.slice(start, end)
        },
        remoteGridRows() {
            return this.remoteGridColumns > 0 ? Math.ceil(this.remote_pics.length / this.remoteGridColumns) : 0
        },
        remoteGridHeight() {
            return this.remoteGridRows * this.remoteGridItemSize
        },
        remoteGridStartRow() {
            if (this.remoteGridItemSize <= 0) return 0
            const gridScrollTop = Math.max(0, this.remoteScrollTop - this.remoteGridTop)
            return Math.max(0, Math.floor(gridScrollTop / this.remoteGridItemSize) - this.remoteBufferRows)
        },
        remoteGridEndRow() {
            if (this.remoteGridItemSize <= 0) return 0
            const viewportHeight = this.remotePanelHeight || (this.bottomMode ? 320 : window.innerHeight)
            const gridBottom = Math.max(0, this.remoteScrollTop + viewportHeight - this.remoteGridTop)
            return Math.min(
                this.remoteGridRows,
                Math.ceil(gridBottom / this.remoteGridItemSize) + this.remoteBufferRows,
            )
        },
        remoteGridOffset() {
            return this.remoteGridStartRow * this.remoteGridItemSize
        },
        visibleRemoteStickers() {
            const start = this.remoteGridStartRow * this.remoteGridColumns
            const end = Math.min(this.remote_pics.length, this.remoteGridEndRow * this.remoteGridColumns)
            return this.remote_pics.slice(start, end)
        },
    },
    watch: {
        panel() {
            this.recentFace = RECENTS.get('recentFace')
            this.recentRemoteSticker = RECENTS.get('recentRemoteSticker')
            this.$nextTick(() => {
                this.observeStickerPanel()
                this.observeRemotePanel()
            })
        },
        open() {
            this.recentFace = RECENTS.get('recentFace')
            this.recentRemoteSticker = RECENTS.get('recentRemoteSticker')
            this.$nextTick(() => {
                this.observeStickerPanel()
                this.observeRemotePanel()
            })
        },
        pics() {
            this.$nextTick(() => this.updateStickerGridMetrics())
        },
        remote_pics() {
            this.$nextTick(() => this.updateRemoteGridMetrics())
        },
        recentRemoteSticker() {
            this.$nextTick(() => this.updateRemoteGridMetrics())
        },
        bottomMode() {
            this.$nextTick(() => {
                this.updateStickerGridMetrics()
                this.updateRemoteGridMetrics()
            })
        },
    },
    props: {
        open: { type: Boolean, required: false, default: false },
        bottomMode: { type: Boolean, required: false, default: false },
    },
    data() {
        return {
            remote_pics: [],
            face: [],
            pics: [],
            panel: '',
            subdirs: [],
            current_dir: DEFAULT_CATEGORY,
            supportRemote: false,
            recentFace: [],
            recentRemoteSticker: [],
            descSortStickersByTime: true,
            stickerScrollTop: 0,
            stickerPanelHeight: 0,
            stickerGridColumns: 4,
            stickerGridItemSize: 0,
            stickerBufferRows: 2,
            remoteScrollTop: 0,
            remotePanelHeight: 0,
            remoteGridTop: 0,
            remoteGridColumns: 4,
            remoteGridItemSize: 0,
            remoteBufferRows: 2,
        }
    },
    async created() {
        this.lifecycleScope = createRendererLifecycleScope()
        this.DEFAULT_CATEGORY = DEFAULT_CATEGORY
        this.RECENT_CATEGORY = RECENT_CATEGORY
        this.face_dir = path.join(getStaticPath(), 'face/')
        this.faceIdToLottie = faceIdToLottie
        this.watchedPath = {}
        this.generatingPath = new Set()
        this._previewQueue = []
        this._previewRunning = 0
        this._previewConcurrency = 2
        this._stickerResizeObserver = null
        this._observedStickerPanel = null
        this._stickerRenderRange = ''
        this._remoteResizeObserver = null
        this._observedRemotePanel = null
        this._remoteRenderRange = ''
        this.panel = await ipc.getLastUsedStickerType()
        this.descSortStickersByTime = (await ipc.getSettings()).descSortStickersByTime

        // Remote Stickers
        if (!(await ipc.getDisabledFeatures()).includes('RemoteStickers')) {
            this.supportRemote = true
            this.lifecycleScope.timeout(async () => (this.remote_pics = await ipc.getRoamingStamp(true)), 10 * 1000)
            this.lifecycleScope.interval(
                async () => (this.remote_pics = await ipc.getRoamingStamp(true)),
                1000 * 60 * 60,
            )
        }

        // Face
        if (!fs.existsSync(this.face_dir)) {
            this.$message.error('No face folder found!')
            await fs.promises.mkdir(this.face_dir)
        }
        fs.readdir(this.face_dir, (_err, files) => {
            this.face = files
        })

        // Stickers
        const store_dir = await ipc.getStorePath()
        this.default_dir = path.join(store_dir, 'stickers/')
        this.preview_dir = path.join(store_dir, 'stickers_preview/')
        if (!fs.existsSync(this.default_dir)) {
            await fs.promises.mkdir(this.default_dir)
        }
        if (!fs.existsSync(this.preview_dir)) {
            await fs.promises.mkdir(this.preview_dir)
        }
        const updateDefaultDir = async () => {
            if (this.current_dir != DEFAULT_CATEGORY) return
            /** @type {[string, fs.Stats][]} */
            let fileAndStats
            try {
                fileAndStats = await Promise.all(
                    (await fs.promises.readdir(this.default_dir))
                        .filter((i) => !i.startsWith('.'))
                        .map(async (i) => [i, await fs.promises.stat(this.default_dir + i)]),
                )
            } catch (err) {
                console.error('Failed to update sticker dir', DEFAULT_CATEGORY, err)
                return
            }
            this.subdirs = fileAndStats
                .filter(([_, stat]) => stat.isDirectory())
                .map(([i, _]) => i)
                .sort()
            if (!this.descSortStickersByTime) {
                this.pics = fileAndStats.filter(([_, stat]) => stat.isFile()).map(([i, _]) => i)
            } else {
                // 后添加的表情排在前面，类似于QQ
                this.pics = fileAndStats
                    .filter(([_, stat]) => stat.isFile())
                    .sort(([_a, statA], [_b, statB]) => statB.mtime - statA.mtime)
                    .map(([i, _]) => i)
            }
        }
        updateDefaultDir()
        const defaultDirWatcher = fs.watch(this.default_dir, updateDefaultDir)
        this.watchedPath[DEFAULT_CATEGORY] = defaultDirWatcher
        this.lifecycleScope.addCleanup(() => defaultDirWatcher.close())
    },
    mounted() {
        this.$nextTick(() => {
            this.observeStickerPanel()
            this.observeRemotePanel()
        })
    },
    beforeDestroy() {
        this._stickerResizeObserver?.disconnect()
        this._stickerResizeObserver = null
        this._observedStickerPanel = null
        this._remoteResizeObserver?.disconnect()
        this._remoteResizeObserver = null
        this._observedRemotePanel = null
        this.lifecycleScope?.dispose()
        this.watchedPath = {}
        this._previewQueue = []
    },
    methods: {
        getStickerPreview(relPath) {
            if (!this.preview_dir || !relPath) return ''
            return 'file://' + this.preview_dir + md5(relPath)
        },
        getStickerPreviewKey(relPath) {
            return 'local:' + relPath
        },
        getRemoteStickerPreview(url) {
            if (!this.preview_dir || !url) return ''
            return 'file://' + this.preview_dir + md5(this.getRemotePreviewKey(url))
        },
        getRemotePreviewKey(url) {
            return 'remote:' + url
        },
        getFacePreview(i) {
            let faceId = String(i)
            if (faceId.length < 3) {
                faceId = '0'.repeat(3 - faceId.length) + faceId
            }
            return 'file://' + this.face_dir + faceId
        },
        getFaceName(i) {
            return String(faceMap[parseInt(i)] || '').replace(/\//, '')
        },
        getStickerGridColumns(width) {
            if (!width) return this.bottomMode ? 1 : 4
            return this.bottomMode ? Math.max(1, Math.floor(width / 72)) : 4
        },
        getStickerRenderRange(scrollTop) {
            if (this.stickerGridItemSize <= 0) return '0:0'
            const viewportHeight = this.stickerPanelHeight || (this.bottomMode ? 320 : window.innerHeight)
            const start = Math.max(0, Math.floor(scrollTop / this.stickerGridItemSize) - this.stickerBufferRows)
            const end = Math.min(
                this.stickerGridRows,
                Math.ceil((scrollTop + viewportHeight) / this.stickerGridItemSize) + this.stickerBufferRows,
            )
            return `${start}:${end}`
        },
        updateStickerGridMetrics() {
            const panel = this.$refs.stickersPanel
            if (!panel) return

            const columns = this.getStickerGridColumns(panel.clientWidth)
            this.stickerGridColumns = columns
            this.stickerGridItemSize = panel.clientWidth / columns
            this.stickerPanelHeight = panel.clientHeight

            const maxScrollTop = Math.max(0, this.stickerGridHeight - this.stickerPanelHeight)
            const scrollTop = Math.min(panel.scrollTop, maxScrollTop)
            if (panel.scrollTop !== scrollTop) panel.scrollTop = scrollTop
            this.stickerScrollTop = scrollTop
            this._stickerRenderRange = this.getStickerRenderRange(scrollTop)
        },
        observeStickerPanel() {
            const panel = this.$refs.stickersPanel
            if (this._observedStickerPanel && this._observedStickerPanel !== panel) {
                this._stickerResizeObserver?.unobserve(this._observedStickerPanel)
                this._observedStickerPanel = null
            }
            if (!panel) return

            if (!this._stickerResizeObserver && typeof ResizeObserver !== 'undefined') {
                this._stickerResizeObserver = new ResizeObserver(() => this.updateStickerGridMetrics())
                this.lifecycleScope?.addCleanup(() => this._stickerResizeObserver?.disconnect())
            }
            if (this._stickerResizeObserver && this._observedStickerPanel !== panel) {
                this._stickerResizeObserver.observe(panel)
                this._observedStickerPanel = panel
            }
            this.updateStickerGridMetrics()
        },
        onStickerScroll(e) {
            const scrollTop = e.target.scrollTop
            const renderRange = this.getStickerRenderRange(scrollTop)
            if (renderRange === this._stickerRenderRange) return
            this._stickerRenderRange = renderRange
            this.stickerScrollTop = scrollTop
        },
        getRemoteRenderRange(scrollTop) {
            if (this.remoteGridItemSize <= 0) return '0:0'
            const viewportHeight = this.remotePanelHeight || (this.bottomMode ? 320 : window.innerHeight)
            const gridScrollTop = Math.max(0, scrollTop - this.remoteGridTop)
            const gridBottom = Math.max(0, scrollTop + viewportHeight - this.remoteGridTop)
            const start = Math.max(0, Math.floor(gridScrollTop / this.remoteGridItemSize) - this.remoteBufferRows)
            const end = Math.min(
                this.remoteGridRows,
                Math.ceil(gridBottom / this.remoteGridItemSize) + this.remoteBufferRows,
            )
            return `${start}:${end}`
        },
        updateRemoteGridMetrics() {
            const panel = this.$refs.remotePanel
            const grid = this.$refs.remoteVirtualGrid
            if (!panel || !grid) return

            const columns = this.getStickerGridColumns(panel.clientWidth)
            this.remoteGridColumns = columns
            this.remoteGridItemSize = panel.clientWidth / columns
            this.remotePanelHeight = panel.clientHeight
            const panelRect = panel.getBoundingClientRect()
            const gridRect = grid.getBoundingClientRect()
            this.remoteGridTop = gridRect.top - panelRect.top + panel.scrollTop

            const maxScrollTop = Math.max(0, this.remoteGridTop + this.remoteGridHeight - this.remotePanelHeight)
            const scrollTop = Math.min(panel.scrollTop, maxScrollTop)
            if (panel.scrollTop !== scrollTop) panel.scrollTop = scrollTop
            this.remoteScrollTop = scrollTop
            this._remoteRenderRange = this.getRemoteRenderRange(scrollTop)
        },
        observeRemotePanel() {
            const panel = this.$refs.remotePanel
            if (this._observedRemotePanel && this._observedRemotePanel !== panel) {
                this._remoteResizeObserver?.unobserve(this._observedRemotePanel)
                this._observedRemotePanel = null
            }
            if (!panel) return

            if (!this._remoteResizeObserver && typeof ResizeObserver !== 'undefined') {
                this._remoteResizeObserver = new ResizeObserver(() => this.updateRemoteGridMetrics())
                this.lifecycleScope?.addCleanup(() => this._remoteResizeObserver?.disconnect())
            }
            if (this._remoteResizeObserver && this._observedRemotePanel !== panel) {
                this._remoteResizeObserver.observe(panel)
                this._observedRemotePanel = panel
            }
            this.updateRemoteGridMetrics()
        },
        onRemoteScroll(e) {
            const scrollTop = e.target.scrollTop
            const renderRange = this.getRemoteRenderRange(scrollTop)
            if (renderRange === this._remoteRenderRange) return
            this._remoteRenderRange = renderRange
            this.remoteScrollTop = scrollTop
        },
        errorHandler(e) {
            // generate preview
            const relPath = e.target.dataset.relativePath
            if (!this.default_dir || !this.preview_dir || !relPath) return
            const previewPath = this.getStickerPreview(relPath).replace(/^file:\/\//, '')
            this.queuePreview({
                key: this.getStickerPreviewKey(relPath),
                source: 'file://' + path.join(this.default_dir, relPath),
                previewPath,
            })
        },
        remoteErrorHandler(e) {
            const url = e.target.dataset.remoteUrl
            if (!url || !this.preview_dir || e.target.dataset.previewFallback === 'true') return
            const previewUrl = this.getRemoteStickerPreview(url)
            const previewPath = previewUrl.replace(/^file:\/\//, '')
            if (fs.existsSync(previewPath)) {
                e.target.src = previewUrl
                return
            }
            this.queuePreview({
                key: this.getRemotePreviewKey(url),
                source: url,
                previewPath,
                fallback: url,
            })
        },
        queuePreview({ key, source, previewPath, fallback }) {
            if (!key || !source || !previewPath) return
            if (fs.existsSync(previewPath) || this.generatingPath.has(key)) return
            this.generatingPath.add(key)
            this._previewQueue.push({ key, source, previewPath, fallback })
            this._processPreviewQueue()
        },
        _processPreviewQueue() {
            while (this._previewRunning < this._previewConcurrency && this._previewQueue.length > 0) {
                const task = this._previewQueue.shift()
                this._previewRunning++
                this._generateSinglePreview(task)
            }
        },
        async _generateSinglePreview({ key, source, previewPath, fallback }) {
            try {
                const img = document.createElement('img')
                img.src = source
                await new Promise((resolve, reject) => {
                    img.onload = resolve
                    img.onerror = reject
                })
                const canvas = document.createElement('canvas')
                canvas.width = img.width
                canvas.height = img.height
                const ctx = canvas.getContext('2d')
                ctx.drawImage(img, 0, 0, img.width, img.height)
                const dataURL = canvas.toDataURL('image/webp', 0.8)
                const base64Data = dataURL.replace(/^data:image\/webp;base64,/, '')
                try {
                    await fs.promises.writeFile(previewPath, base64Data, 'base64')
                } catch (err) {
                    console.error('Failed to generate preview for', key, 'at', previewPath)
                    console.error(err)
                    return
                }
                console.log('Preview generated for', key)
                this.refreshPreviewImages(key)
            } catch (err) {
                console.error('Failed to load image for preview', key, err)
                if (fallback) this.showPreviewFallback(key, fallback)
            } finally {
                this.generatingPath.delete(key)
                this._previewRunning--
                this._processPreviewQueue()
            }
        },
        refreshPreviewImages(key) {
            const panels = [this.$refs.stickersPanel, this.$refs.remotePanel].filter(Boolean)
            panels.forEach((panel) => {
                Array.from(panel.querySelectorAll('img[data-preview-key]'))
                    .filter((img) => img.dataset.previewKey === key)
                    .forEach((img) => (img.src = img.src))
            })
        },
        showPreviewFallback(key, source) {
            const panels = [this.$refs.stickersPanel, this.$refs.remotePanel].filter(Boolean)
            panels.forEach((panel) => {
                Array.from(panel.querySelectorAll('img[data-preview-key]'))
                    .filter((img) => img.dataset.previewKey === key)
                    .forEach((img) => {
                        img.dataset.previewFallback = 'true'
                        img.src = source
                    })
            })
        },
        changeCurrentDir(dir) {
            if (this.current_dir === dir) {
                // 点击已选中的分组，滚动到顶部
                if (this.$refs.stickersPanel) {
                    this.$refs.stickersPanel.scrollTop = 0
                    this.stickerScrollTop = 0
                    this._stickerRenderRange = ''
                    this.$nextTick(() => this.updateStickerGridMetrics())
                }
                return
            }
            console.log('Stickers directory changed:', dir)
            this.current_dir = dir
            if (dir == RECENT_CATEGORY) {
                this.pics = RECENTS.get('recentLocalSticker').filter((i) => fs.existsSync(this.default_dir + i))
                return
            }
            const subDir = dir == DEFAULT_CATEGORY ? '' : dir + '/'
            const fullDir = this.default_dir + subDir
            const updateDir = async () => {
                if (this.current_dir != dir) return
                /** @type {[string, fs.Stats][]} */
                let fileAndStats
                try {
                    fileAndStats = await Promise.all(
                        (await fs.promises.readdir(fullDir))
                            .filter((i) => !i.startsWith('.'))
                            .map(async (i) => [i, await fs.promises.stat(fullDir + i)]),
                    )
                } catch (err) {
                    console.error('Failed to update sticker dir', dir, err)
                    return
                }
                if (!this.descSortStickersByTime) {
                    this.pics = fileAndStats.filter(([_, stat]) => stat.isFile()).map(([i, _]) => subDir + i)
                } else {
                    this.pics = fileAndStats
                        .filter(([_, stat]) => stat.isFile())
                        .sort(([_a, statA], [_b, statB]) => statB.mtime - statA.mtime)
                        .map(([i, _]) => subDir + i)
                }
            }
            updateDir()
            if (dir == DEFAULT_CATEGORY || dir in this.watchedPath) return
            const watcher = fs.watch(fullDir, updateDir)
            this.watchedPath[dir] = watcher
            this.lifecycleScope.addCleanup(() => watcher.close())
        },
        sendLocalSticker(img) {
            this.$emit('send', this.default_dir + img)
            RECENTS.push('recentLocalSticker', img)
        },
        sendRemoteSticker(img) {
            this.$emit('send', img)
            RECENTS.push('recentRemoteSticker', img)
            this.recentRemoteSticker = RECENTS.get('recentRemoteSticker')
        },
        pickFace(face) {
            this.$emit('selectFace', face)
            RECENTS.push('recentFace', parseInt(face))
        },
        pickLottie(face) {
            const faceId = parseInt(face)
            const qlottie = faceIdToLottie.get(faceId)
            if (!qlottie) {
                this.$message.error(
                    `${String(faceMap[faceId] || 'Face').replace(/\//, '')}(${faceId}) 没有对应的 Lottie 超级表情`,
                )
                return
            }
            this.$emit('sendLottie', { qlottie: qlottie.lottieId, id: face })
            RECENTS.push('recentFace', faceId)
        },
        folder() {
            shell.openPath(
                this.current_dir == DEFAULT_CATEGORY ? this.default_dir : path.join(this.default_dir, this.current_dir),
            )
        },
        menu: ipc.popupStickerMenu,
        localStickerMenu(relPath, e) {
            ipc.popupStickerItemMenu(
                this.default_dir + relPath,
                this.pics.map((i) => this.default_dir + i),
                e,
            )
        },
        remoteStickerMenu(url, e) {
            ipc.popupStickerItemMenu(
                url,
                this.remote_pics.map((i) => i.url),
                e,
            )
        },
        dirMenu: ipc.popupStickerDirMenu,
        setPanel(type) {
            if (this.panel === type) {
                // 点击已选中的 tab，滚动对应面板到顶部
                const refMap = { face: 'facePanel', remote: 'remotePanel', stickers: 'stickersPanel' }
                const ref = this.$refs[refMap[type]]
                if (ref) {
                    ref.scrollTop = 0
                    if (type === 'stickers') {
                        this.stickerScrollTop = 0
                        this._stickerRenderRange = ''
                        this.$nextTick(() => this.updateStickerGridMetrics())
                    } else if (type === 'remote') {
                        this.remoteScrollTop = 0
                        this._remoteRenderRange = ''
                        this.$nextTick(() => this.updateRemoteGridMetrics())
                    }
                }
                return
            }
            this.panel = type
            ipc.setLastUsedStickerType(type)
        },
        wheelHandler(e) {
            e.preventDefault()
            this.$refs.stickers_dir.scrollTo({
                left: this.$refs.stickers_dir.scrollLeft + e.deltaY,
                behavior: 'smooth',
            })
        },
        onmouseover(e) {
            e.target.src = 'file://' + path.join(this.default_dir, e.target.dataset.relativePath)
        },
        onmouseout(e) {
            e.target.src = this.getStickerPreview(e.target.dataset.relativePath)
        },
        onRemoteStickerMouseover(e) {
            e.target.dataset.previewFallback = 'false'
            e.target.src = e.target.dataset.remoteUrl
        },
        onRemoteStickerMouseout(e) {
            e.target.dataset.previewFallback = 'false'
            e.target.src = this.getRemoteStickerPreview(e.target.dataset.remoteUrl)
        },
    },
}
</script>

<style scoped lang="scss">
.stickers-body {
    display: flex;
    flex-direction: row;
    flex: 1;
    overflow: hidden;

    > .panel {
        flex: 1;
        overflow: auto;
        height: auto;
    }
}

.stickers_dir {
    width: 30px;
    min-width: 30px;
    white-space: nowrap;
    overflow-y: auto;
    overflow-x: hidden;
    border-left: var(--chat-border-style);
    background-color: var(--panel-header-bg);
    display: flex;
    flex-direction: column;
    align-items: center;

    a {
        writing-mode: vertical-rl;
        padding: 8px 0;
        color: var(--panel-color-sticker-type);
        cursor: pointer;

        &:hover {
            color: var(--panel-color-sticker-type-hover);
        }

        &.selected {
            color: var(--panel-color-sticker-type-selected);
        }
    }
}

.head {
    height: 64px;
    min-height: 64px;
    border-bottom: var(--chat-border-style);
    display: flex;
    align-items: center;
    font-size: 17px;
    padding: 0 16px;
    background-color: var(--panel-header-bg);
}

.title {
    width: 100%;

    a {
        margin-right: 8px;
        color: var(--panel-color-sticker-type);

        &:hover {
            color: var(--panel-color-sticker-type-hover);
        }

        &.selected {
            color: var(--panel-color-sticker-type-selected);
        }
    }
}

.opinion {
    margin-left: 5px;
    font-size: 16px;
    cursor: pointer;
    transition: all 0.2s;
    color: var(--chat-color);

    &:hover {
        transform: scale(1.1);
        opacity: 0.7;
    }
}

.panel {
    overflow: auto;
    height: 100vh;
}

.subheader {
    margin: 0.5em;
    color: var(--chat-color-placeholder);
}

.empty {
    padding: 1em;
    text-align: center;
    color: var(--chat-color-placeholder);

    button {
        margin-top: 1em;
    }
}

.grid {
    display: grid;
    overflow: hidden;
    grid-template-columns: 1fr 1fr 1fr 1fr;

    img {
        object-fit: contain;
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        position: absolute;
        border: 1px solid transparent;
        transition: border-color 0.5s;

        &:hover {
            border-color: #999;
        }
    }

    div {
        width: 100%;
        height: 0;
        padding-bottom: 100%;
        position: relative;
        background-color: var(--panel-background);
    }
}

.sticker-virtual-grid {
    position: relative;
    width: 100%;
    overflow-anchor: none;
}

.sticker-virtual-grid-content {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
}

.remote-virtual-grid {
    position: relative;
    width: 100%;
    overflow-anchor: none;
}

.remote-virtual-grid-content {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
}

.face-panel {
    padding: 0 0.5em;

    .subheader {
        margin-left: 0;
        margin-right: 0;
    }

    .grid {
        margin: 0.5em 0;
        grid-template-columns: repeat(9, 1fr);
    }
}

.bg {
    background-color: var(--panel-background);
    height: -webkit-fill-available;
    display: flex;
    flex-direction: column;
}

@media screen and (min-width: 1200px) {
    .bg {
        border-left: var(--chat-border-style);
    }
}

// 修复 emoji 面板溢出
@mixin emoji-flex {
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.emoji-panel {
    @include emoji-flex;
    height: 100vh;
}

::v-deep #Emojis {
    @include emoji-flex;
    display: flex !important;
}

::v-deep #Categories,
::v-deep #InputSearch {
    flex-shrink: 0;
}

::v-deep .container-emoji {
    height: auto !important;
}

.emoji-picker {
    --ep-color-bg: auto !important;
    --ep-color-border: auto !important;
    --ep-color-sbg: #fff !important;
    --ep-color-active: #409eff !important;
    width: 100% !important;
    border: none !important;
}

// 底部模式（表情面板固定在屏幕下方）
.bg-bottom {
    height: 100%;

    .head-compact {
        height: 36px;
        min-height: 36px;
        font-size: 14px;
        padding: 0 12px;
    }

    // 所有面板高度交给 flex，不再吃满 100vh
    .panel {
        height: auto;
    }

    .emoji-panel {
        height: auto;
        flex: 1;
    }

    // 一行表情数量根据宽度自适应
    .grid {
        grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
    }

    .face-panel .grid {
        // face 较小，密度更高
        grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
    }

    // stickers 面板与分类栏改为纵向排列：表情在上，分类标签在下
    .stickers-body {
        flex-direction: column;
    }

    .stickers_dir {
        width: 100%;
        min-width: unset;
        height: auto;
        flex-direction: row;
        flex-wrap: wrap;
        align-items: stretch;
        overflow-y: hidden;
        overflow-x: hidden;
        border-left: none;
        border-top: var(--chat-border-style);
        padding: 4px;
        gap: 2px;

        a {
            writing-mode: horizontal-tb;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 13px;
            line-height: 1.4;
        }
    }
}
</style>
