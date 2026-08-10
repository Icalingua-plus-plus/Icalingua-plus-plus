<template>
    <div class="root">
        <input
            ref="input"
            spellcheck="false"
            v-model="search"
            :style="{ width: inputSize + 'px' }"
            @keydown.esc.stop="cancel"
            @keydown.arrow-down="selectNext"
            @keydown.arrow-up="selectLast"
            @keydown.enter.prevent="confirm(selectedIndex)"
            @keydown.backspace="breakspace"
            @input="onInput"
            @blur="$nextTick(cancel)"
        />
        <small>{{ matchedCount }} {{ description }}</small>
        <ul ref="list" :class="{ 'virtual-list': virtualScroll }" @scroll="onScroll">
            <template v-if="virtualScroll">
                <li class="virtual-content" :style="{ height: virtualListHeight + 'px' }">
                    <div class="virtual-items" :style="{ transform: `translateY(${virtualOffset}px)` }">
                        <div
                            v-for="([name, id], index) in visibleMatched"
                            :key="virtualStart + index"
                            class="virtual-item"
                            :class="{ selected: virtualStart + index === selectedIndex }"
                            @mousedown="confirm(virtualStart + index)"
                        >
                            <slot v-bind="{ name, id }"></slot>
                        </div>
                    </div>
                </li>
            </template>
            <template v-else>
                <li
                    v-for="([name, id], index) in matched"
                    :key="index"
                    :class="{ selected: index === selectedIndex }"
                    @mousedown="confirm(index)"
                >
                    <slot v-bind="{ name, id }"></slot>
                </li>
            </template>
        </ul>
    </div>
</template>

<script>
import PinyinMatch from 'pinyin-match'

export default {
    data() {
        return {
            selectedIndex: 0,
            search: '',
            confirmed: false,
            scrollTop: 0,
            viewportHeight: 0,
            itemHeight: 30,
            bufferSize: 5,
        }
    },
    props: {
        list: Array,
        description: String,
        searchMethod: String,
        inputSize: String,
        countExcludedIds: {
            type: Array,
            default: () => [],
        },
        virtualScroll: Boolean,
    },
    methods: {
        focus() {
            this.$refs.input.focus()
            this.$nextTick(() => this.updateViewportHeight())
        },
        onInput() {
            this.selectedIndex = 0
            this.resetScroll()
        },
        cancel() {
            if (this.confirmed) {
                this.confirmed = false
                return
            }
            this.search = ''
            this.selectedIndex = 0
            this.resetScroll()
            this.$emit('cancel')
        },
        breakspace() {
            if (this.search.length === 0) {
                this.cancel()
            }
        },
        confirm(index) {
            const selected = this.matched[index] || []
            this.$emit('confirm', selected[1], selected[0])
            this.search = ''
            this.selectedIndex = 0
            this.resetScroll()
            this.confirmed = true
        },
        selectNext() {
            if (++this.selectedIndex >= this.matched.length) this.selectedIndex = 0
            this.scrollToSelected()
        },
        selectLast() {
            if (--this.selectedIndex < 0) this.selectedIndex = this.matched.length - 1
            this.scrollToSelected()
        },
        scrollToSelected() {
            const list = this.$refs.list
            if (!list) return
            if (!this.virtualScroll) {
                // FIXME: 使用更科学的方法计算滚动，这个 40px 不知道怎么来的……
                const item = list.children[this.selectedIndex]
                if (item) list.scrollTo(0, item.offsetTop - 40)
                return
            }

            const itemTop = this.selectedIndex * this.itemHeight
            const itemBottom = itemTop + this.itemHeight
            if (itemTop < list.scrollTop) list.scrollTop = itemTop
            else if (itemBottom > list.scrollTop + list.clientHeight) list.scrollTop = itemBottom - list.clientHeight
        },
        onScroll() {
            const list = this.$refs.list
            if (!list) return
            this._pendingScrollTop = list.scrollTop
            if (this._scrollFrame) return
            this._scrollFrame = window.requestAnimationFrame(() => {
                this._scrollFrame = null
                this.scrollTop = this._pendingScrollTop
            })
        },
        resetScroll() {
            this.scrollTop = 0
            this._pendingScrollTop = 0
            if (this._scrollFrame) {
                window.cancelAnimationFrame(this._scrollFrame)
                this._scrollFrame = null
            }
            if (this.$refs.list) this.$refs.list.scrollTop = 0
        },
        updateViewportHeight() {
            if (!this.virtualScroll || !this.$refs.list) return
            const height = this.$refs.list.clientHeight
            if (height > 0) this.viewportHeight = height
        },
    },
    computed: {
        matchedCount() {
            return this.matched.filter(([, id]) => !this.countExcludedIds.includes(id)).length
        },
        virtualViewportHeight() {
            return this.viewportHeight || 300
        },
        virtualStart() {
            return Math.max(0, Math.floor(this.scrollTop / this.itemHeight) - this.bufferSize)
        },
        virtualEnd() {
            return Math.min(
                this.matched.length,
                Math.ceil((this.scrollTop + this.virtualViewportHeight) / this.itemHeight) + this.bufferSize,
            )
        },
        visibleMatched() {
            return this.matched.slice(this.virtualStart, this.virtualEnd)
        },
        virtualOffset() {
            return this.virtualStart * this.itemHeight
        },
        virtualListHeight() {
            return this.matched.length * this.itemHeight
        },
        matched() {
            const matched =
                this.searchMethod === 'includes'
                    ? this.list.filter(
                          ([name, id]) =>
                              name[this.searchMethod](this.search) ||
                              id.toString()[this.searchMethod](this.search) ||
                              PinyinMatch.match(name, this.search),
                      )
                    : this.list.filter(([name]) => name[this.searchMethod](this.search))
            if (matched.length === 0) {
                this.$emit('nomatch', this.search)
            }
            return matched
        },
    },
    mounted() {
        this.updateViewportHeight()
        if (this.virtualScroll && typeof ResizeObserver !== 'undefined' && this.$refs.list) {
            this._resizeObserver = new ResizeObserver(() => this.updateViewportHeight())
            this._resizeObserver.observe(this.$refs.list)
        }
    },
    beforeDestroy() {
        if (this._resizeObserver) this._resizeObserver.disconnect()
        if (this._scrollFrame) window.cancelAnimationFrame(this._scrollFrame)
    },
}
</script>

<style scoped>
.root {
    position: absolute;
    min-width: 200px;
    bottom: 55px;
    padding: 5px;
    border-radius: 8px;
    background: var(--chat-message-bg-color-me);
}
input {
    padding: 3px 10px;
    border-radius: 8px;
    border: none;
    font-size: 18px;
}
small {
    float: right;
    margin-top: 8px;
}
ul {
    padding-left: 0;
    margin: 8px 0 2px 0;
    list-style-type: none;
    max-height: calc(100vh - 250px);
    overflow-y: scroll;
}
.virtual-content {
    display: block;
    position: relative;
    list-style: none;
}
.virtual-items {
    position: absolute;
    top: 0;
    right: 0;
    left: 0;
}
.virtual-item {
    display: flex;
    box-sizing: border-box;
    height: 30px;
    min-height: 30px;
    padding: 2px 8px;
    border-radius: 3px;
    align-items: center;
    justify-content: space-between;
    line-height: 100%;
}
li {
    display: flex;
    justify-content: space-between;
    min-height: 26px;
    padding: 2px 8px;
    border-radius: 3px;
    align-items: center;
    line-height: 100%;
}
li.virtual-content {
    display: block;
    box-sizing: border-box;
    min-height: 0;
    padding: 0;
    border-radius: 0;
    align-items: initial;
    justify-content: initial;
    line-height: normal;
}
li.selected,
li:hover {
    background: var(--chat-message-bg-color-reply);
}
li.virtual-content:hover {
    background: transparent;
}
.virtual-item.selected,
.virtual-item:hover {
    background: var(--chat-message-bg-color-reply);
}
li > p {
    margin: 0;
    margin-top: 4px;
}
.virtual-item > p {
    margin: 0;
    margin-top: 4px;
}
li > img {
    width: 25px;
    height: 25px;
}
.virtual-item > img {
    width: 25px;
    height: 25px;
}
</style>
