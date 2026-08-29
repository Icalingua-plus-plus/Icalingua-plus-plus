<template>
    <el-dialog
        title="移动 Sticker"
        :visible.sync="visible"
        width="460px"
        class="dialog"
        append-to-body
        :close-on-click-modal="false"
        :close-on-press-escape="!loading"
        @close="handleClose"
    >
        <div class="move-overview">
            <div class="move-preview" :class="{ 'is-failed': previewFailed }">
                <img v-if="previewUrl && !previewFailed" :src="previewUrl" @error="previewFailed = true" />
                <i v-else class="el-icon-picture-outline-round"></i>
            </div>
            <div class="move-overview-content">
                <div class="move-kicker">MOVE STICKER</div>
                <div class="move-file-name" :title="fileName">{{ fileName }}</div>
                <div class="move-description">选择目标分类，或创建一个新分类</div>
            </div>
        </div>

        <div class="move-section">
            <div class="section-heading">
                <div>
                    <div class="section-title">目标分类</div>
                    <div class="section-description">表情会保留原文件名</div>
                </div>
                <div class="section-tools">
                    <el-input
                        v-if="!loadingCategories && categories.length > 4"
                        v-model="categoryQuery"
                        class="category-search"
                        size="mini"
                        placeholder="搜索分类"
                        clearable
                    >
                        <i slot="prefix" class="el-input__icon el-icon-search"></i>
                    </el-input>
                    <span v-if="!loadingCategories" class="category-count">{{ categories.length }} 个分类</span>
                    <i v-else class="el-icon-loading category-loading-icon"></i>
                </div>
            </div>

            <div v-if="loadingCategories" class="category-loading">
                <i class="el-icon-loading"></i>
                <span>正在读取分类…</span>
            </div>
            <div v-else class="category-grid" role="radiogroup" aria-label="目标分类">
                <button
                    v-for="category in filteredCategories"
                    :key="category.name"
                    type="button"
                    class="category-card"
                    :class="{ selected: !creating && selectedCategory === category.name }"
                    role="radio"
                    :aria-checked="!creating && selectedCategory === category.name"
                    @click="selectCategory(category.name)"
                >
                    <span class="category-icon"><i :class="category.icon"></i></span>
                    <span class="category-copy">
                        <span class="category-name">{{ category.name }}</span>
                        <span class="category-meta">{{ categoryMeta(category) }}</span>
                    </span>
                    <i v-if="!creating && selectedCategory === category.name" class="el-icon-check category-check"></i>
                </button>
                <button
                    type="button"
                    class="category-card category-card-create"
                    :class="{ selected: creating }"
                    role="radio"
                    :aria-checked="creating"
                    @click="startCreating"
                >
                    <span class="category-icon"><i class="el-icon-folder"></i></span>
                    <span class="category-copy">
                        <span class="category-name">新建分类</span>
                        <span class="category-meta">按需整理 Sticker</span>
                    </span>
                    <i v-if="creating" class="el-icon-check category-check"></i>
                </button>
                <div v-if="!filteredCategories.length" class="category-empty">没有匹配的分类</div>
            </div>
        </div>

        <div v-if="creating" class="new-category-box">
            <div class="new-category-heading">
                <span>新建分类</span>
            </div>
            <el-input
                ref="newCategoryInput"
                v-model="newCategory"
                size="small"
                placeholder="例如：猫猫、工作、梗图"
                maxlength="32"
                show-word-limit
                clearable
                @input="errorMessage = ''"
                @keyup.enter.native="confirm"
            >
                <i slot="prefix" class="el-input__icon el-icon-folder"></i>
            </el-input>
            <div class="new-category-description">分类目录会创建在 stickers 文件夹下</div>
        </div>

        <div v-if="errorMessage" class="move-error" role="alert">
            <i class="el-icon-warning-outline"></i>
            <span>{{ errorMessage }}</span>
        </div>

        <span slot="footer" class="dialog-footer">
            <span class="move-target" :class="{ 'is-current': selectedCategory === currentCategory && !creating }">
                <i class="el-icon-folder"></i>
                <span>{{ targetSummary }}</span>
            </span>
            <span class="move-actions">
                <el-button size="small" :disabled="loading" @click="visible = false">取消</el-button>
                <el-button type="primary" size="small" :loading="loading" :disabled="!canSubmit" @click="confirm">
                    移动
                </el-button>
            </span>
        </span>
    </el-dialog>
</template>

<script>
import fs from 'fs'
import path from 'path'
import ipc from '../utils/ipc'

const DEFAULT_CATEGORY = 'Default'
const RECENT_CATEGORY = 'Recent'
const INVALID_CATEGORY_NAME = /[<>:"/\\|?*\u0000-\u001f]/

export default {
    name: 'StickerMoveDialog',
    data() {
        return {
            visible: false,
            filename: '',
            storePath: '',
            categories: [],
            selectedCategory: DEFAULT_CATEGORY,
            creating: false,
            newCategory: '',
            categoryQuery: '',
            loadingCategories: false,
            loading: false,
            errorMessage: '',
            previewFailed: false,
            categoryRequest: 0,
        }
    },
    computed: {
        stickerDir() {
            return this.storePath ? path.join(this.storePath, 'stickers') : ''
        },
        fileName() {
            return this.filename ? path.basename(this.filename) : '未命名 Sticker'
        },
        previewUrl() {
            return this.filename ? 'file://' + this.filename : ''
        },
        currentCategory() {
            return this.getCategoryFromFilename(this.filename)
        },
        normalizedNewCategory() {
            return this.newCategory.trim()
        },
        filteredCategories() {
            const query = this.categoryQuery.trim().toLowerCase()
            if (!query) return this.categories
            return this.categories.filter((category) => category.name.toLowerCase().includes(query))
        },
        canSubmit() {
            if (this.loading || this.loadingCategories) return false
            if (this.creating) return !!this.normalizedNewCategory
            return !!this.selectedCategory && this.selectedCategory !== this.currentCategory
        },
        targetSummary() {
            if (this.creating) {
                return this.normalizedNewCategory ? `新建「${this.normalizedNewCategory}」` : '输入新分类名称'
            }
            if (!this.selectedCategory) return '选择一个分类'
            if (this.selectedCategory === this.currentCategory) return `已在「${this.selectedCategory}」`
            return `移动至「${this.selectedCategory}」`
        },
    },
    methods: {
        open(filename) {
            if (!filename) return
            this.categoryRequest++
            this.filename = filename
            this.visible = true
            this.selectedCategory = DEFAULT_CATEGORY
            this.creating = false
            this.newCategory = ''
            this.categoryQuery = ''
            this.loading = false
            this.loadingCategories = true
            this.errorMessage = ''
            this.previewFailed = false
            this.loadCategories(filename)
        },
        async loadCategories(filename) {
            const request = ++this.categoryRequest
            this.loadingCategories = true
            try {
                if (!this.storePath) this.storePath = await ipc.getStorePath()
                const root = this.stickerDir
                await fs.promises.mkdir(root, { recursive: true })
                const entries = await fs.promises.readdir(root, { withFileTypes: true })
                const directoryNames = entries
                    .filter(
                        (entry) =>
                            entry.isDirectory() &&
                            !entry.name.startsWith('.') &&
                            ![DEFAULT_CATEGORY, RECENT_CATEGORY].some(
                                (reservedName) => reservedName.toLowerCase() === entry.name.toLowerCase(),
                            ),
                    )
                    .map((entry) => entry.name)
                    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
                const names = [DEFAULT_CATEGORY, ...directoryNames]
                const categories = await Promise.all(
                    names.map(async (name) => ({
                        name,
                        icon: 'el-icon-folder',
                        count: await this.countFiles(name === DEFAULT_CATEGORY ? root : path.join(root, name)),
                    })),
                )
                if (request !== this.categoryRequest || filename !== this.filename) return
                this.categories = categories
                const currentCategory = this.getCategoryFromFilename(filename)
                this.selectedCategory = categories.some((category) => category.name === currentCategory)
                    ? currentCategory
                    : DEFAULT_CATEGORY
            } catch (err) {
                if (request !== this.categoryRequest || filename !== this.filename) return
                console.error('Failed to load sticker categories', err)
                this.categories = [{ name: DEFAULT_CATEGORY, icon: 'el-icon-folder', count: 0 }]
                this.selectedCategory = DEFAULT_CATEGORY
                this.errorMessage = '读取 Sticker 分类失败，请稍后重试'
            } finally {
                if (request === this.categoryRequest) this.loadingCategories = false
            }
        },
        async countFiles(directory) {
            try {
                const entries = await fs.promises.readdir(directory, { withFileTypes: true })
                return entries.filter((entry) => entry.isFile() && !entry.name.startsWith('.')).length
            } catch (err) {
                return 0
            }
        },
        getCategoryFromFilename(filename) {
            if (!this.stickerDir || !filename) return DEFAULT_CATEGORY
            const relative = path.relative(this.stickerDir, path.dirname(filename))
            return relative && relative !== '.' && !relative.includes(path.sep) ? relative : DEFAULT_CATEGORY
        },
        categoryMeta(category) {
            if (category.name === this.currentCategory) return '当前分类'
            return `${category.count} 个 Sticker`
        },
        selectCategory(name) {
            this.creating = false
            this.selectedCategory = name
            this.errorMessage = ''
        },
        startCreating() {
            this.creating = true
            this.selectedCategory = ''
            this.errorMessage = ''
            this.$nextTick(() => {
                const input = this.$refs.newCategoryInput
                if (input) input.focus()
            })
        },
        validateCategoryName(name) {
            if (!name) return '请输入分类名称'
            if (name.length > 32) return '分类名称不能超过 32 个字符'
            if (
                [DEFAULT_CATEGORY, RECENT_CATEGORY].some(
                    (reservedName) => reservedName.toLowerCase() === name.toLowerCase(),
                )
            ) {
                return 'Default 和 Recent 是保留分类名'
            }
            if (name === '.' || name === '..' || INVALID_CATEGORY_NAME.test(name)) {
                return '分类名称包含不支持的字符'
            }
            if (/[. ]$/.test(name)) return '分类名称不能以空格或句点结尾'
            if (this.categories.some((category) => category.name.toLowerCase() === name.toLowerCase())) {
                return '该分类已经存在，请直接选择它'
            }
            return ''
        },
        async confirm() {
            if (this.loading) return
            let targetCategory = this.selectedCategory
            if (this.creating) {
                targetCategory = this.normalizedNewCategory
                const validationMessage = this.validateCategoryName(targetCategory)
                if (validationMessage) {
                    this.errorMessage = validationMessage
                    return
                }
            } else if (!targetCategory) {
                this.errorMessage = '请选择一个目标分类'
                return
            } else if (targetCategory === this.currentCategory) {
                this.errorMessage = '这个 Sticker 已经在该分类中'
                return
            }

            const source = this.filename
            const targetDirectory =
                targetCategory === DEFAULT_CATEGORY ? this.stickerDir : path.join(this.stickerDir, targetCategory)
            const destination = path.join(targetDirectory, path.basename(source))
            const normalizedSource = path.resolve(source)
            const normalizedDestination = path.resolve(destination)
            const sameFile =
                process.platform === 'win32'
                    ? normalizedSource.toLowerCase() === normalizedDestination.toLowerCase()
                    : normalizedSource === normalizedDestination

            this.loading = true
            this.errorMessage = ''
            try {
                if (!fs.existsSync(source)) throw new Error('source sticker does not exist')
                await fs.promises.mkdir(targetDirectory, { recursive: true })
                if (!sameFile && fs.existsSync(destination)) {
                    this.errorMessage = '目标分类中已有同名 Sticker'
                    return
                }
                await fs.promises.rename(source, destination)
                this.visible = false
                this.$message.success(`已移动到「${targetCategory}」`)
            } catch (err) {
                console.error('Failed to move sticker', source, 'to', targetDirectory)
                console.error(err)
                this.errorMessage = '移动失败，请检查文件是否仍然存在'
            } finally {
                this.loading = false
            }
        },
        handleClose() {
            this.categoryRequest++
            this.loadingCategories = false
            this.errorMessage = ''
            this.creating = false
            this.newCategory = ''
            this.categoryQuery = ''
        },
    },
}
</script>

<style scoped lang="scss">
.move-overview {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px;
    border: var(--chat-border-style, 1px solid #e1e4e8);
    border-radius: 4px;
    background-color: var(--panel-header-bg, #f5f7fa);
}

.move-preview {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    flex: 0 0 56px;
    overflow: hidden;
    border: var(--chat-border-style, 1px solid #e1e4e8);
    border-radius: 4px;
    background-color: var(--panel-background, #ffffff);

    img {
        width: 100%;
        height: 100%;
        object-fit: contain;
    }

    i {
        color: var(--chat-color-placeholder, #c0c4cc);
        font-size: 26px;
    }
}

.move-overview-content {
    min-width: 0;
}

.move-kicker {
    margin-bottom: 4px;
    color: var(--chat-color-placeholder, #909399);
    font-size: 10px;
    font-weight: 600;
}

.move-file-name {
    overflow: hidden;
    color: var(--panel-color-name, #303133);
    font-size: 14px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.move-description,
.section-description,
.new-category-description {
    color: var(--panel-color-desc, var(--chat-color-placeholder, #909399));
    font-size: 12px;
}

.move-description {
    margin-top: 5px;
}

.move-section {
    margin-top: 20px;
}

.section-heading,
.new-category-heading,
.dialog-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.section-tools {
    display: flex;
    align-items: center;
    gap: 10px;
}

::v-deep .category-search {
    width: 150px;

    .el-input__inner {
        padding-right: 24px;
        padding-left: 28px;
    }
}

.section-title {
    color: var(--panel-color-name, #303133);
    font-size: 14px;
    font-weight: 600;
}

.section-description {
    margin-top: 3px;
}

.category-count,
.new-category-hint {
    color: var(--chat-color-placeholder, #909399);
    font-size: 12px;
}

.category-empty {
    grid-column: 1 / -1;
    padding: 16px 0;
    color: var(--chat-color-placeholder, #909399);
    font-size: 12px;
    text-align: center;
}

.category-loading-icon {
    color: var(--panel-color-sticker-type-selected, #409eff);
}

.category-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 116px;
    color: var(--chat-color-placeholder, #909399);
    font-size: 13px;
}

.category-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    max-height: 218px;
    margin-top: 10px;
    padding: 2px;
    overflow-y: auto;
}

.category-card {
    display: flex;
    align-items: center;
    min-width: 0;
    width: 100%;
    padding: 9px;
    border: var(--chat-border-style, 1px solid #e1e4e8);
    border-radius: 4px;
    outline: none;
    background-color: var(--panel-background, #ffffff);
    color: var(--panel-color-name, #303133);
    font-family: inherit;
    text-align: left;
    cursor: pointer;

    &:hover,
    &:focus-visible {
        border: 1px solid var(--panel-color-sticker-type-selected, #409eff);
        background-color: var(--panel-header-bg, #f5f7fa);
    }

    &.selected {
        border: 1px solid var(--panel-color-sticker-type-selected, #409eff);
        background-color: var(--panel-header-bg, #f5f7fa);
    }
}

.category-card-create {
    border-style: dashed;
}

.category-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    margin-right: 8px;
    border-radius: 4px;
    background-color: var(--panel-header-bg, #f5f7fa);
    color: var(--panel-color-sticker-type-selected, #409eff);
    font-size: 16px;
}

.category-copy {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 3px;
}

.category-name {
    overflow: hidden;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.category-meta {
    overflow: hidden;
    color: var(--chat-color-placeholder, #909399);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.category-check {
    margin-left: 6px;
    flex: 0 0 auto;
    color: var(--panel-color-sticker-type-selected, #409eff);
    font-size: 15px;
}

.new-category-box {
    margin-top: 12px;
    padding: 12px;
    border: var(--chat-border-style, 1px solid #e1e4e8);
    border-radius: 4px;
    background-color: var(--panel-header-bg, #f5f7fa);
}

.new-category-heading {
    margin-bottom: 8px;
    color: var(--panel-color-name, #303133);
    font-size: 13px;
    font-weight: 600;
}

.new-category-description {
    margin-top: 7px;
}

.move-error {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin-top: 12px;
    color: var(--chat-color-danger, #f56c6c);
    font-size: 12px;
    line-height: 1.5;

    i {
        margin-top: 2px;
    }
}

.dialog-footer {
    gap: 12px;
}

.move-target {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 6px;
    color: var(--panel-color-desc, var(--chat-color-placeholder, #606266));
    font-size: 12px;

    i {
        color: var(--panel-color-sticker-type-selected, #409eff);
    }

    span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    &.is-current {
        color: var(--chat-color-placeholder, #909399);

        i {
            color: var(--chat-color-placeholder, #909399);
        }
    }
}

.move-actions {
    display: flex;
    flex: 0 0 auto;
    gap: 8px;
}

@media screen and (max-width: 520px) {
    .category-grid {
        grid-template-columns: 1fr;
    }
}
</style>
