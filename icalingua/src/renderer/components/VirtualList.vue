<template>
    <div class="virtual-list" @scroll.passive="onScroll">
        <div class="virtual-list-spacer" :style="{ height: totalHeight + 'px' }">
            <div class="virtual-list-window" :style="{ transform: `translateY(${offsets[range.start]}px)` }">
                <div
                    v-for="(item, index) in visibleItems"
                    :key="getItemKey(item)"
                    ref="rows"
                    class="virtual-list-row"
                    :data-index="range.start + index"
                >
                    <slot
                        :item="item"
                        :index="range.start + index"
                        :viewport="{ scrollTop, height: viewportHeight, offset: offsets[range.start + index] }"
                    />
                </div>
            </div>
        </div>
        <slot name="footer" />
    </div>
</template>

<script>
import { createRendererLifecycleScope } from '../utils/rendererLifecycleScope'
import { buildVirtualListOffsets, findVirtualListIndex, getVirtualListRange } from '../utils/virtualList'

export default {
    name: 'VirtualList',
    props: {
        items: { type: Array, required: true },
        itemKey: { type: [String, Function], required: true },
        estimatedItemHeight: { type: [Number, Function], default: 72 },
        overscan: { type: Number, default: 5 },
        resetKey: { default: null },
        hasMore: { type: Boolean, default: false },
        loading: { type: Boolean, default: false },
    },
    data() {
        return { scrollTop: 0, viewportHeight: 0, measurementVersion: 0 }
    },
    computed: {
        offsets() {
            this.measurementVersion
            return buildVirtualListOffsets(this.items, (item) => {
                const measured = this._heights.get(this.getItemKey(item))
                return (
                    measured ||
                    (typeof this.estimatedItemHeight === 'function'
                        ? this.estimatedItemHeight(item)
                        : this.estimatedItemHeight)
                )
            })
        },
        totalHeight() {
            return this.offsets[this.items.length]
        },
        range() {
            return getVirtualListRange(this.offsets, this.scrollTop, this.viewportHeight, this.overscan)
        },
        visibleItems() {
            return this.items.slice(this.range.start, this.range.end)
        },
    },
    watch: {
        items() {
            const keys = new Set(this.items.map(this.getItemKey))
            for (const key of this._heights.keys()) {
                if (!keys.has(key)) this._heights.delete(key)
            }
            this.$nextTick(() => {
                if (this._isDestroyed) return
                this.scrollTop = this.$el.scrollTop
                this.checkEnd()
            })
        },
        resetKey() {
            this.resetScroll()
        },
        loading(value) {
            if (!value) this.$nextTick(this.checkEnd)
        },
        hasMore(value) {
            if (value) this.$nextTick(this.checkEnd)
        },
    },
    created() {
        this.lifecycleScope = createRendererLifecycleScope()
        this._heights = new Map()
        this._observedRows = new Map()
        this._scrollFrame = null
        this._resizeFrame = null
        this._pendingResizes = new Map()
    },
    mounted() {
        this._observer = new ResizeObserver(this.queueResize)
        this.lifecycleScope.addCleanup(() => this._observer.disconnect())
        this._observer.observe(this.$el)
        this.viewportHeight = this.$el.clientHeight
        this.syncRows()
        this.$nextTick(this.checkEnd)
    },
    updated() {
        this.syncRows()
    },
    beforeDestroy() {
        this.lifecycleScope.dispose()
        this._observedRows.clear()
        this._heights.clear()
        this._pendingResizes.clear()
    },
    methods: {
        getItemKey(item) {
            return typeof this.itemKey === 'function' ? this.itemKey(item) : item[this.itemKey]
        },
        syncRows() {
            if (!this._observer || this._isDestroyed) return
            const rows = new Set(this.$refs.rows || [])
            for (const element of this._observedRows.keys()) {
                if (!rows.has(element)) {
                    this._observer.unobserve(element)
                    this._observedRows.delete(element)
                }
            }
            for (const element of rows) {
                const index = Number(element.dataset.index)
                const key = this.getItemKey(this.items[index])
                if (!this._observedRows.has(element)) this._observer.observe(element)
                this._observedRows.set(element, { key, index })
            }
        },
        queueResize(entries) {
            for (const entry of entries) this._pendingResizes.set(entry.target, entry)
            if (this._resizeFrame !== null) return
            // Apply measurements in the next frame, outside the ResizeObserver delivery loop.
            this._resizeFrame = this.lifecycleScope.animationFrame(() => {
                this._resizeFrame = null
                const pending = Array.from(this._pendingResizes.values())
                this._pendingResizes.clear()
                this.onResize(pending)
            })
        },
        onResize(entries) {
            if (this._isDestroyed) return
            this.scrollTop = this.$el.scrollTop
            const anchor = findVirtualListIndex(this.offsets, this.scrollTop)
            let adjustment = 0
            let changed = false
            this.viewportHeight = this.$el.clientHeight
            for (const entry of entries) {
                const row = this._observedRows.get(entry.target)
                const height = entry.borderBoxSize?.[0]?.blockSize || entry.contentRect.height
                if (!row || height <= 0) continue
                const previousHeight = this.offsets[row.index + 1] - this.offsets[row.index]
                if (Math.abs(height - previousHeight) < 0.5) continue
                this._heights.set(row.key, height)
                if (row.index < anchor) adjustment += height - previousHeight
                changed = true
            }
            if (changed) this.measurementVersion++
            if (adjustment) {
                this.scrollTop = Math.max(0, this.scrollTop + adjustment)
                this.$nextTick(() => {
                    if (!this._isDestroyed) this.$el.scrollTop = this.scrollTop
                })
            }
            this.$nextTick(this.checkEnd)
        },
        onScroll() {
            if (this._scrollFrame !== null) return
            this._scrollFrame = this.lifecycleScope.animationFrame(() => {
                this._scrollFrame = null
                this.scrollTop = this.$el.scrollTop
                this.checkEnd()
            })
        },
        resetScroll() {
            this.scrollTop = 0
            if (this.$el) this.$el.scrollTop = 0
        },
        checkEnd() {
            if (this._isDestroyed || !this.hasMore || this.loading) return
            const element = this.$el
            if (element?.clientHeight > 0 && element.scrollHeight - element.scrollTop - element.clientHeight < 200) {
                this.$emit('end-reached')
            }
        },
    },
}
</script>

<style scoped>
.virtual-list {
    flex: 1;
    min-height: 0;
    overflow: auto;
    overflow-anchor: none;
    scrollbar-gutter: stable;
}

.virtual-list-spacer {
    position: relative;
}

.virtual-list-window {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
}

.virtual-list-row {
    display: flow-root;
}
</style>
