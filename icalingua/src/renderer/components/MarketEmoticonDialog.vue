<template>
    <el-dialog
        title="QQ 商城表情包"
        :visible.sync="visible"
        width="min(680px, 92vw)"
        top="8vh"
        class="dialog"
        append-to-body
        @opened="focusSearch"
        @close="clear"
    >
        <el-input
            ref="searchInput"
            v-model="query"
            placeholder="输入关键词、表情包 ID (ID:数字) 或 QQ 商城链接"
            size="small"
            clearable
            @keyup.enter.native="search"
        >
            <el-button slot="append" icon="el-icon-search" :disabled="!query.trim()" @click="search">搜索</el-button>
        </el-input>
        <div v-if="packId" class="pack-header">
            <el-button size="mini" icon="el-icon-back" @click="back">返回搜索</el-button>
            <span>{{ pack ? pack.name : packId }}</span>
            <el-button size="mini" :disabled="!pack || !pack.items.length" :loading="saving" @click="chooseSaveGroup">
                保存整包
            </el-button>
        </div>
        <p v-if="pack && pack.description" class="pack-description">{{ pack.description }}</p>
        <div ref="results" class="market-results" @scroll.passive="onScroll">
            <div v-if="pack" class="market-grid">
                <div v-for="item in pack.items" :key="item.id" class="market-item">
                    <img
                        :src="item.thumbnail"
                        :alt="item.name"
                        :title="item.name"
                        loading="lazy"
                        @click="preview(item.url)"
                    />
                    <span class="item-name">{{ item.name }}</span>
                    <div class="item-actions">
                        <el-button type="text" size="mini" @click="save(item.url)">保存</el-button>
                        <el-button type="text" size="mini" @click="send(item.url)">发送</el-button>
                    </div>
                </div>
            </div>
            <div v-else-if="!packId && packs.length" class="market-grid">
                <button
                    v-for="item in packs"
                    :key="item.type + ':' + item.id"
                    type="button"
                    class="market-item"
                    @click="openPack(item.id, item.type)"
                >
                    <img :src="item.cover" :alt="item.name" loading="lazy" />
                    <span class="item-name">{{ item.name }}</span>
                </button>
            </div>
            <div class="market-status" aria-live="polite">
                <span v-if="loading"><i class="el-icon-loading"></i> 正在加载…</span>
                <template v-else-if="error">
                    <span>{{ error }}</span>
                    <el-button type="text" size="mini" @click="retry">重试</el-button>
                </template>
                <el-button v-else-if="!packId && cursor" type="text" size="mini" @click="loadPage">加载更多</el-button>
                <span v-else-if="keyword && !packId && !packs.length">没有找到表情包</span>
            </div>
        </div>
        <el-dialog
            title="保存整包到 Stickers"
            :visible.sync="saveGroupShown"
            width="min(420px, 92vw)"
            class="dialog"
            append-to-body
            :close-on-click-modal="!saving"
            :close-on-press-escape="!saving"
            :show-close="!saving"
        >
            <p class="pack-description">选择现有分组，或输入新分组名</p>
            <el-select
                v-model="saveGroup"
                filterable
                allow-create
                default-first-option
                :disabled="saving"
                placeholder="选择或输入分组名"
                style="width: 100%"
            >
                <el-option label="默认分组" value="" />
                <el-option v-for="group in stickerGroups" :key="group" :label="group" :value="group" />
            </el-select>
            <span slot="footer">
                <el-button size="small" :disabled="saving" @click="saveGroupShown = false">取消</el-button>
                <el-button size="small" type="primary" :loading="saving" @click="savePack">保存</el-button>
            </span>
        </el-dialog>
    </el-dialog>
</template>

<script lang="ts">
import Vue from 'vue'
import type { ElInput } from 'element-ui/types/input'
import type { MarketEmoticonPack, MarketEmoticonPackSummary } from '@icalingua/types/MarketEmoticon'
import ipc from '../utils/ipc'

export default Vue.extend({
    data() {
        return {
            visible: false,
            query: '',
            keyword: '',
            packs: [] as MarketEmoticonPackSummary[],
            unavailablePacks: [] as string[],
            cursor: '',
            packId: 0,
            packType: 3,
            pack: null as MarketEmoticonPack | null,
            loading: false,
            saving: false,
            saveGroupShown: false,
            saveGroup: '',
            stickerGroups: [] as string[],
            error: '',
            generation: 0,
        }
    },
    beforeDestroy() {
        this.generation++
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
            this.saveGroupShown = false
            this.back()
            this.query = ''
            this.keyword = ''
            this.packs = []
            this.unavailablePacks = []
            this.cursor = ''
        },
        back() {
            this.generation++
            this.packId = 0
            this.pack = null
            this.loading = false
            this.error = ''
        },
        search() {
            const query = this.query.trim()
            if (!query) return
            this.clear()
            this.query = query
            this.keyword = query
            let id = query.match(/^ID:(\d+)$/i)?.[1] || ''
            let type = 3
            try {
                const url = new URL(query)
                if (url.hostname === 'zb.vip.qq.com') {
                    id = url.searchParams.get('id') || ''
                    if (url.searchParams.get('emojiType') === '5') type = 5
                }
            } catch {}
            const results = this.$refs.results as HTMLElement
            results.scrollTop = 0
            if (id) void this.openPack(Number(id), type)
            else void this.loadPage()
        },
        async loadPage() {
            if (!this.visible || this.packId || !this.keyword || this.loading) return
            const { generation, keyword, cursor } = this
            this.loading = true
            this.error = ''
            try {
                const page = await ipc.searchMarketEmoticons(keyword, cursor)
                if (!this.visible || this.generation !== generation) return
                const key = (pack: MarketEmoticonPackSummary) => pack.type + ':' + pack.id
                const ids = new Set([...this.packs.map(key), ...this.unavailablePacks])
                this.packs.push(...page.packs.filter((pack) => !ids.has(key(pack))))
                this.cursor = page.nextCursor === cursor ? '' : page.nextCursor
            } catch (error) {
                if (this.visible && this.generation === generation)
                    this.error = error instanceof Error ? error.message : String(error)
            } finally {
                if (this.generation === generation) this.loading = false
            }
        },
        async openPack(id: number, type = 3) {
            const generation = ++this.generation
            this.packId = id
            this.packType = type
            this.pack = null
            this.loading = true
            this.error = ''
            try {
                const pack = await ipc.getMarketEmoticonPack(id, type)
                if (!this.visible || this.generation !== generation) return
                if (!pack) {
                    this.unavailablePacks.push(type + ':' + id)
                    this.packs = this.packs.filter((item) => item.id !== id || item.type !== type)
                    this.back()
                    return
                }
                this.pack = pack
            } catch (error) {
                if (this.visible && this.generation === generation)
                    this.error = error instanceof Error ? error.message : String(error)
            } finally {
                if (this.generation === generation) this.loading = false
            }
        },
        retry() {
            if (this.packId) void this.openPack(this.packId, this.packType)
            else void this.loadPage()
        },
        onScroll(event: Event) {
            const results = event.currentTarget as HTMLElement
            if (
                !this.packId &&
                this.cursor &&
                !this.error &&
                results.scrollHeight - results.scrollTop - results.clientHeight < 32
            )
                void this.loadPage()
        },
        async chooseSaveGroup() {
            if (!this.pack || this.saving) return
            const generation = this.generation
            this.saveGroup = this.pack.name
            this.saveGroupShown = true
            try {
                const groups = await ipc.getStickerGroups()
                if (this.visible && this.generation === generation) this.stickerGroups = groups
            } catch (error) {
                this.$message.error(error instanceof Error ? error.message : String(error))
            }
        },
        async savePack() {
            if (!this.pack || this.saving) return
            this.saving = true
            const generation = this.generation
            try {
                const result = await ipc.saveMarketEmoticonPack(this.pack.id, this.pack.type, this.saveGroup)
                if (!this.visible || this.generation !== generation) return
                this.saveGroupShown = false
                if (result.failed) this.$message.warning(result.failed + ' 张表情保存失败，请重试')
                else this.$message.success('已提交整包保存')
            } catch (error) {
                if (this.visible && this.generation === generation)
                    this.$message.error(error instanceof Error ? error.message : String(error))
            } finally {
                this.saving = false
            }
        },
        save: ipc.saveSticker,
        preview(url: string) {
            ipc.openImage(
                url,
                false,
                this.pack.items.map((item) => item.url),
            )
        },
        send(url: string) {
            if (!this.visible) return
            this.visible = false
            this.$emit('send', url)
        },
    },
})
</script>

<style scoped lang="scss">
.pack-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 12px;

    span {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}

.pack-description,
.market-status {
    color: var(--panel-color-desc);
}

.market-results {
    margin-top: 12px;
    max-height: 50vh;
    overflow: auto;
}

.market-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 8px;
}

.market-item {
    min-width: 0;
    padding: 4px;
    border: var(--chat-border-style);
    border-radius: 4px;
    background: var(--panel-background);
    color: var(--panel-color-name);
    text-align: center;

    img {
        display: block;
        width: 100%;
        height: 90px;
        object-fit: contain;
        cursor: pointer;
    }
}

.item-name {
    display: block;
    height: 1.5em;
    line-height: 1.5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.item-actions {
    display: flex;
    justify-content: space-around;

    .el-button + .el-button {
        margin-left: 0;
    }
}

.market-status {
    padding-top: 8px;
    text-align: center;

    &:empty {
        display: none;
    }
}
</style>
