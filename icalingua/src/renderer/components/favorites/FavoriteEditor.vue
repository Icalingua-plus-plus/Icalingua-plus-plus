<template>
    <el-dialog
        :visible="visible"
        :title="detail ? '编辑收藏' : '新建收藏'"
        custom-class="favorite-editor-dialog"
        width="660px"
        :close-on-click-modal="false"
        :close-on-press-escape="!saving"
        :show-close="!saving"
        :before-close="requestClose"
    >
        <el-form
            ref="form"
            :model="form"
            :rules="rules"
            label-position="top"
            size="small"
            @submit.native.prevent
            @keydown.native.ctrl.enter.prevent="save"
            @keydown.native.meta.enter.prevent="save"
        >
            <el-form-item key="favorite-type" label="收藏类型">
                <el-radio-group v-model="form.type" :disabled="Boolean(detail) || saving" size="small">
                    <el-radio-button label="text"><i class="el-icon-document"></i> 文本</el-radio-button>
                    <el-radio-button label="link"><i class="el-icon-link"></i> 链接</el-radio-button>
                    <el-radio-button label="rich"><i class="el-icon-edit-outline"></i> HTML 笔记</el-radio-button>
                </el-radio-group>
            </el-form-item>
            <el-form-item v-if="form.type !== 'text'" key="favorite-title" label="标题" prop="title">
                <el-input v-model="form.title" placeholder="给这条收藏起个名字" :disabled="saving" maxlength="200" />
            </el-form-item>
            <el-form-item v-if="form.type === 'link'" key="favorite-url" label="链接地址" prop="url">
                <el-input v-model="form.url" placeholder="https://" :disabled="saving" />
            </el-form-item>
            <el-form-item v-if="form.type === 'text'" label="正文" key="favorite-text" prop="text">
                <el-input
                    v-model="form.text"
                    type="textarea"
                    :rows="10"
                    placeholder="记录想留住的内容…"
                    :disabled="saving"
                />
            </el-form-item>
            <el-form-item v-if="form.type === 'rich'" label="正文" key="favorite-html" prop="html">
                <el-tabs v-model="editorTab" class="favorite-editor-tabs" stretch>
                    <el-tab-pane label="HTML 源码" name="source">
                        <el-input
                            v-model="form.html"
                            class="favorite-code-input"
                            type="textarea"
                            :rows="10"
                            placeholder="<p>笔记正文</p>"
                            :disabled="saving"
                            :spellcheck="false"
                        />
                    </el-tab-pane>
                    <el-tab-pane label="预览" name="preview">
                        <iframe
                            v-if="editorTab === 'preview'"
                            class="favorite-editor-preview"
                            title="笔记预览"
                            sandbox="allow-popups"
                            :srcdoc="previewDocument"
                        ></iframe>
                    </el-tab-pane>
                </el-tabs>
                <p class="favorite-helper">支持 HTML 排版；粘贴本地图片不会自动上传。</p>
            </el-form-item>
            <el-form-item v-if="form.type !== 'text'" label="摘要" key="favorite-brief" prop="brief">
                <el-input
                    v-model="form.brief"
                    type="textarea"
                    :rows="2"
                    placeholder="选填，方便在列表中查找"
                    :disabled="saving"
                    maxlength="500"
                />
            </el-form-item>
            <el-form-item key="favorite-group" label="所属分组">
                <el-select
                    v-model="form.custom_group_id"
                    :popper-append-to-body="false"
                    :disabled="saving"
                    class="favorite-full-width"
                >
                    <el-option :value="0" label="未分组" />
                    <el-option
                        v-for="group in groups"
                        :key="group.custom_group_id"
                        :value="group.custom_group_id"
                        :label="group.name"
                    />
                </el-select>
            </el-form-item>
        </el-form>
        <div v-if="error" class="favorite-inline-error" role="alert">
            <i class="el-icon-warning-outline"></i>{{ error }}
        </div>
        <span slot="footer">
            <el-button size="small" :disabled="saving" @click="requestClose">取消</el-button>
            <el-button size="small" type="primary" :loading="saving" title="Ctrl / ⌘ + Enter" @click="save">{{
                detail ? '保存修改' : '创建收藏'
            }}</el-button>
        </span>
    </el-dialog>
</template>

<script>
import { favoriteRequest, favoritePreviewDocument, safeFavoriteUrl } from '../../utils/favorites'

const emptyForm = () => ({ type: 'text', text: '', html: '', url: '', title: '', brief: '', custom_group_id: 0 })

export default {
    name: 'FavoriteEditor',
    props: {
        visible: Boolean,
        detail: { type: Object, default: null },
        groups: { type: Array, default: () => [] },
        initialGroupId: { type: Number, default: 0 },
        colors: { type: Object, default: () => ({}) },
    },
    data() {
        const requiredContent = (field, message) => (rule, value, callback) => {
            if (this.form.type !== field || String(value || '').trim()) callback()
            else callback(new Error(message))
        }
        return {
            form: emptyForm(),
            original: emptyForm(),
            saving: false,
            error: '',
            editorTab: 'source',
            rules: {
                text: [{ validator: requiredContent('text', '请输入正文'), trigger: 'blur' }],
                html: [{ validator: requiredContent('rich', '请输入 HTML 正文'), trigger: 'blur' }],
                url: [
                    {
                        validator: (rule, value, callback) => {
                            if (this.form.type !== 'link' || safeFavoriteUrl(value)) callback()
                            else callback(new Error('请输入有效的 HTTP 或 HTTPS 链接'))
                        },
                        trigger: 'blur',
                    },
                ],
            },
        }
    },
    computed: {
        isDirty() {
            return JSON.stringify(this.form) !== JSON.stringify(this.original)
        },
        previewDocument() {
            return favoritePreviewDocument(this.form.html, this.colors)
        },
    },
    watch: {
        'form.type'() {
            this.error = ''
            this.$nextTick(() => {
                if (!this._isDestroyed) this.$refs.form?.clearValidate()
            })
        },
        visible(value) {
            if (!value) return
            this.form = { ...emptyForm(), custom_group_id: this.initialGroupId }
            if (this.detail) {
                const item = this.detail.collection
                const link = item.summary?.link_summary || {}
                const rich = item.summary?.rich_media_summary || {}
                this.form = {
                    type: item.type === 8 ? 'rich' : item.type === 2 ? 'link' : 'text',
                    text: this.detail.content?.text_content?.data || '',
                    html: this.detail.html || '',
                    url: link.uri || '',
                    title: item.type === 8 ? rich.title || '' : link.title || '',
                    brief: item.type === 8 ? rich.brief || '' : link.brief || '',
                    custom_group_id: item.custom_group_id || 0,
                }
            }
            this.original = { ...this.form }
            this.error = ''
            this.editorTab = 'source'
            this.$nextTick(() => this.$refs.form?.clearValidate())
        },
    },
    methods: {
        async requestClose() {
            if (this.saving) return
            if (this.isDirty) {
                try {
                    await this.$confirm('还有未保存的修改，确定放弃吗？', '放弃修改', {
                        confirmButtonText: '放弃修改',
                        cancelButtonText: '继续编辑',
                        type: 'warning',
                        customClass: 'favorites-message-box',
                    })
                } catch {
                    return
                }
            }
            this.$emit('update:visible', false)
        },
        async save() {
            if (this.saving) return
            const valid = await this.$refs.form.validate().catch(() => false)
            if (!valid || this._isDestroyed) return
            if (this.detail && !this.isDirty) {
                this.$emit('update:visible', false)
                return
            }
            this.saving = true
            this.error = ''
            try {
                const fields = {
                    text: ['text'],
                    link: ['url', 'title', 'brief'],
                    rich: ['html', 'title', 'brief'],
                }
                const keys = [...fields[this.form.type], 'custom_group_id']
                let cid
                if (this.detail) {
                    const changes = {}
                    keys.forEach((key) => {
                        if (this.form[key] !== this.original[key]) changes[key] = this.form[key]
                    })
                    cid = this.detail.collection.cid
                    await favoriteRequest({ action: 'edit', cid, changes })
                } else {
                    const favorite = { type: this.form.type }
                    keys.forEach((key) => {
                        favorite[key] = this.form[key]
                    })
                    const created = await favoriteRequest({ action: 'add', favorite })
                    cid = created.cid
                }
                if (this._isDestroyed) return
                this.$emit('update:visible', false)
                this.$emit('saved', cid)
                this.$message.success(this.detail ? '收藏已更新' : '收藏已创建')
            } catch (error) {
                if (!this._isDestroyed) this.error = error.message || '保存失败，请重试'
            } finally {
                if (!this._isDestroyed) this.saving = false
            }
        },
    },
}
</script>
