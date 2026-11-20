<template>
    <el-dialog
        title="搜索 QQ 在线表情"
        :visible.sync="visible"
        width="min(600px, 92vw)"
        top="8vh"
        class="dialog"
        append-to-body
        @opened="focusSearch"
        @close="clear"
    >
        <el-input
            ref="searchInput"
            v-model="query"
            placeholder="输入关键词"
            size="small"
            clearable
            @keyup.enter.native="search"
        >
            <el-button slot="append" icon="el-icon-search" :disabled="!query.trim()" @click="search">搜索</el-button>
        </el-input>
        <div v-show="keyword" ref="results" class="search-results" @scroll.passive="onScroll">
            <div v-if="items.length" class="search-grid">
                <div v-for="(item, index) in items" :key="index" class="search-item">
                    <img :src="item.thumbnail" :alt="keyword" loading="lazy" />
                    <div class="search-actions">
                        <el-button type="text" size="mini" @click="save(item.url)">保存</el-button>
                        <el-button type="text" size="mini" @click="send(item.url)">发送</el-button>
                    </div>
                </div>
            </div>
            <div class="search-status" aria-live="polite">
                <span v-if="loading"><i class="el-icon-loading"></i> 正在搜索…</span>
                <template v-else-if="error">
                    <span>{{ error }}</span>
                    <el-button type="text" size="mini" @click="loadPage">重试</el-button>
                </template>
                <el-button v-else-if="cursor" type="text" size="mini" @click="loadPage">加载更多</el-button>
                <span v-else-if="!items.length">没有找到表情</span>
            </div>
        </div>
    </el-dialog>
</template>

<script lang="ts">
import Vue from 'vue'
import type { ElInput } from 'element-ui/types/input'
import type { StickerSearchItem } from '@icalingua/types/StickerSearch'
import ipc from '../utils/ipc'

export default Vue.extend({
    data() {
        return {
            visible: false,
            query: '',
            keyword: '',
            items: [] as StickerSearchItem[],
            cursor: '',
            loading: false,
            error: '',
            generation: 0,
        }
    },
    methods: {
        open() {
            this.visible = true
        },
        focusSearch() {
            const input = this.$refs.searchInput as ElInput | undefined
            input?.focus()
        },
        clear() {
            this.resetSearch()
            this.query = ''
        },
        resetSearch() {
            this.generation++
            this.keyword = ''
            this.items = []
            this.cursor = ''
            this.loading = false
            this.error = ''
        },
        search() {
            const keyword = this.query.trim()
            if (!keyword) return
            this.resetSearch()
            this.keyword = keyword
            const results = this.$refs.results as HTMLElement
            results.scrollTop = 0
            void this.loadPage()
        },
        async loadPage() {
            if (!this.visible || !this.keyword || this.loading) return
            const { generation, keyword, cursor } = this
            this.loading = true
            this.error = ''
            try {
                const page = await ipc.searchEmoticons(keyword, cursor)
                if (!this.visible || this.generation !== generation) return
                this.items.push(...page.items)
                this.cursor = page.nextCursor === cursor ? '' : page.nextCursor
            } catch (error) {
                if (this.visible && this.generation === generation)
                    this.error = error instanceof Error ? error.message : String(error)
            } finally {
                if (this.generation === generation) this.loading = false
            }
        },
        onScroll(event: Event) {
            const results = event.currentTarget as HTMLElement
            if (this.cursor && !this.error && results.scrollHeight - results.scrollTop - results.clientHeight < 32)
                void this.loadPage()
        },
        save: ipc.saveSticker,
        send(url: string) {
            if (!this.visible) return
            this.visible = false
            this.$emit('send', url)
        },
    },
})
</script>

<style scoped lang="scss">
.search-results {
    margin-top: 12px;
    max-height: 52vh;
    overflow: auto;
}

.search-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(86px, 1fr));
    gap: 8px;
}

.search-item {
    border: var(--chat-border-style);
    border-radius: 4px;
    background: var(--panel-background);
    text-align: center;

    img {
        display: block;
        width: 100%;
        height: 80px;
        object-fit: contain;
    }
}

.search-actions {
    display: flex;
    justify-content: center;
    gap: 8px;

    .el-button + .el-button {
        margin-left: 0;
    }
}

.search-status {
    padding-top: 8px;
    text-align: center;
    color: var(--panel-color-desc);

    &:empty {
        display: none;
    }
}
</style>
