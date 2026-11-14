<template>
    <section class="favorite-detail" role="region" tabindex="0" aria-label="收藏详情" v-loading="loading">
        <div v-if="error" class="favorite-empty">
            <i class="el-icon-warning-outline"></i>
            <h3>暂时无法读取详情</h3>
            <p>{{ error }}</p>
            <el-button size="small" @click="$emit('retry')">重试</el-button>
        </div>
        <template v-else-if="detail">
            <header class="favorite-detail-header">
                <h2>{{ title }}</h2>
                <div class="favorite-detail-meta">
                    <span
                        ><i class="el-icon-time"></i
                        >{{ formatTime(collection.collect_time || collection.create_time) }}</span
                    >
                    <span><i class="el-icon-folder-opened"></i>{{ groupName || '未分组' }}</span>
                </div>
                <div class="favorite-detail-actions">
                    <el-button
                        v-if="link && detail.html !== undefined"
                        size="small"
                        icon="el-icon-link"
                        @click="openLink(link)"
                        >打开链接</el-button
                    >
                    <el-button v-if="editable" size="small" icon="el-icon-edit" :disabled="busy" @click="$emit('edit')"
                        >编辑</el-button
                    >
                    <el-button
                        size="small"
                        :icon="collection.star_mark ? 'el-icon-star-on' : 'el-icon-star-off'"
                        :disabled="busy"
                        @click="$emit('star')"
                    >
                        {{ collection.star_mark ? '取消星标' : '设为星标' }}
                    </el-button>
                    <el-button size="small" icon="el-icon-folder-add" :disabled="busy" @click="$emit('move')"
                        >移动</el-button
                    >
                    <el-button
                        size="small"
                        class="favorite-delete-button"
                        icon="el-icon-delete"
                        :disabled="busy"
                        @click="$emit('delete')"
                        >删除</el-button
                    >
                </div>
            </header>
            <div class="favorite-detail-body">
                <section v-if="collection.type === 5" class="favorite-video-panel">
                    <div class="favorite-section-heading"><h3>视频</h3></div>
                    <MessageVideo v-if="videoUrl" :url="videoUrl" :is-hidden="false" :autoplay="true" />
                    <button
                        v-else
                        type="button"
                        class="favorite-video-placeholder"
                        :class="{ 'has-cover': videoCover }"
                        :disabled="!videoFile || !videoFile.fid || videoLoading"
                        :aria-busy="videoLoading"
                        @click="fileAction('play', videoFile)"
                    >
                        <img
                            v-if="videoCover"
                            :key="videoCover"
                            class="favorite-video-cover"
                            :src="videoCover"
                            alt=""
                            referrerpolicy="no-referrer"
                            @error="failedVideoCover = $event.target.getAttribute('src')"
                        />
                        <i :class="videoLoading ? 'el-icon-loading' : 'el-icon-video-play'"></i>
                        <span>{{
                            videoLoading
                                ? '正在加载视频…'
                                : videoFile && videoFile.fid
                                  ? '点击播放视频'
                                  : '暂无可用的视频资源'
                        }}</span>
                    </button>
                </section>
                <div v-if="isAudio" class="favorite-file-card">
                    <div class="favorite-attachment-icon"><i :class="typeInfo.icon"></i></div>
                    <div class="favorite-file-info">
                        <strong>{{ typeInfo.label }}</strong
                        ><span>语音播放待实现：AMR / SILK 需要先转码。</span>
                    </div>
                </div>
                <div v-if="mediaError" class="favorite-inline-error" role="alert">{{ mediaError }}</div>
                <div
                    v-if="detail.content && detail.content.text_content"
                    class="favorite-text-body"
                    v-text="detail.content.text_content.data"
                ></div>
                <iframe
                    v-else-if="detail.html !== undefined"
                    class="favorite-html-preview"
                    title="收藏正文预览"
                    sandbox="allow-popups"
                    referrerpolicy="no-referrer"
                    :srcdoc="previewDocument"
                ></iframe>
                <div v-else-if="link" class="favorite-link-card">
                    <div class="favorite-attachment-icon"><i class="el-icon-link"></i></div>
                    <div class="favorite-link-info">
                        <strong>{{ title }}</strong
                        ><span>{{ link }}</span>
                    </div>
                    <el-button size="small" type="primary" @click="openLink(link)">打开链接</el-button>
                    <p v-if="excerpt">{{ excerpt }}</p>
                </div>
                <div v-else-if="excerpt" class="favorite-text-body" v-text="excerpt"></div>

                <section v-if="pictures.length" class="favorite-attachments">
                    <div class="favorite-section-heading">
                        <h3>图片</h3>
                        <span>{{ pictures.length }} 张</span>
                    </div>
                    <div class="favorite-picture-grid">
                        <div
                            v-for="(picture, index) in pictures"
                            :key="picture.pic_id || picture.uri || index"
                            class="favorite-picture-card"
                        >
                            <button
                                v-if="safeUrl(picture.uri)"
                                type="button"
                                class="favorite-picture-open"
                                title="查看原图"
                                :aria-label="'查看图片：' + (picture.note || picture.name || index + 1)"
                                @click="openPicture(picture)"
                            >
                                <el-image
                                    :src="safeUrl(picture.uri)"
                                    fit="contain"
                                    :alt="picture.note || picture.name || '收藏图片'"
                                    referrerpolicy="no-referrer"
                                >
                                    <div slot="error" class="favorite-image-placeholder">
                                        <i class="el-icon-picture-outline"></i><span>图片暂时无法预览</span>
                                    </div>
                                </el-image>
                            </button>
                            <div v-else class="favorite-image-placeholder">
                                <i class="el-icon-picture-outline"></i><span>暂无可用预览地址</span>
                            </div>
                            <div class="favorite-picture-caption">
                                <strong>{{ picture.name || picture.note || '收藏图片 ' + (index + 1) }}</strong>
                                <span
                                    >{{ picture.width || '—' }} × {{ picture.height || '—'
                                    }}<template v-if="picture.size"> · {{ formatSize(picture.size) }}</template></span
                                >
                                <span v-if="picture.pic_id" class="favorite-resource-id" :title="picture.pic_id">{{
                                    picture.pic_id
                                }}</span>
                            </div>
                        </div>
                    </div>
                </section>
                <section v-if="files.length" class="favorite-attachments">
                    <div class="favorite-section-heading">
                        <h3>文件</h3>
                        <span>{{ files.length }} 个</span>
                    </div>
                    <div v-for="(file, index) in files" :key="file.fid || index" class="favorite-file-card">
                        <div class="favorite-attachment-icon"><i class="el-icon-document"></i></div>
                        <div class="favorite-file-info">
                            <strong>{{ file.name || '未命名文件' }}</strong>
                            <span>{{ formatSize(file.size) }}</span>
                            <span v-if="file.fid" class="favorite-resource-id" :title="file.fid">{{ file.fid }}</span>
                        </div>
                        <el-button
                            v-if="file.fid"
                            type="primary"
                            size="small"
                            icon="el-icon-download"
                            :loading="fileLoading('download', file)"
                            @click="fileAction('download', file)"
                            >下载</el-button
                        >
                        <el-button v-if="file.fid" type="text" size="small" @click="copy(file.fid)">复制 ID</el-button>
                    </div>
                </section>
                <div v-if="!hasBody && !pictures.length && !files.length" class="favorite-empty favorite-empty-inline">
                    <i :class="typeInfo.icon"></i>
                    <p>这条收藏没有可显示的正文</p>
                </div>
                <div v-if="location" class="favorite-location">
                    <i class="el-icon-location-outline"></i><span>{{ location.name }}<br />{{ location.address }}</span>
                </div>
                <div class="favorite-info-footer">
                    <span>收藏 ID</span><code>{{ collection.cid }}</code>
                    <el-button type="text" size="mini" @click="copy(collection.cid)">复制</el-button>
                </div>
            </div>
        </template>
        <div v-else-if="!loading" class="favorite-empty favorite-welcome">
            <div class="favorite-welcome-icon"><i class="el-icon-collection"></i></div>
            <h3>留住值得收藏的内容</h3>
            <p>选择一条收藏，在这里查看正文、图片和附件信息。</p>
        </div>
    </section>
</template>

<script>
import ipc from '../../utils/ipc'
import MessageVideo from '../vac-mod/ChatWindow/Message/MessageVideo.vue'
import {
    favoriteTitle,
    favoriteExcerpt,
    favoriteType,
    favoriteLink,
    favoriteTime,
    favoriteSize,
    favoritePictures,
    favoriteFiles,
    safeFavoriteUrl,
    favoritePreviewDocument,
} from '../../utils/favorites'

export default {
    name: 'FavoriteDetail',
    components: { MessageVideo },
    data() {
        return { videoUrl: '', failedVideoCover: '', mediaError: '', mediaLoading: {} }
    },
    props: {
        detail: { type: Object, default: null },
        loading: Boolean,
        error: { type: String, default: '' },
        groupName: { type: String, default: '' },
        busy: Boolean,
        colors: { type: Object, default: () => ({}) },
    },
    computed: {
        collection() {
            return this.detail.collection
        },
        title() {
            return favoriteTitle(this.collection)
        },
        excerpt() {
            return favoriteExcerpt(this.collection)
        },
        typeInfo() {
            return favoriteType(this.collection)
        },
        isAudio() {
            return [4, 9].includes(this.collection.type)
        },
        videoFile() {
            return this.collection.summary?.video_summary?.store_file_info
        },
        videoCover() {
            const url = safeFavoriteUrl(this.collection.summary?.video_summary?.preview_pic_info?.uri)
            return url === this.failedVideoCover ? '' : url
        },
        videoLoading() {
            return Boolean(this.videoFile && this.fileLoading('play', this.videoFile))
        },
        editable() {
            return [1, 2, 8].includes(this.collection.type)
        },
        pictures() {
            return favoritePictures(this.detail)
        },
        files() {
            return favoriteFiles(this.detail)
        },
        imageUrls() {
            const inline = this.detail.html
                ? Array.from(
                      new DOMParser().parseFromString(this.previewDocument, 'text/html').querySelectorAll('img[src]'),
                  ).map((image) => safeFavoriteUrl(image.getAttribute('src')))
                : []
            return Array.from(
                new Set([...inline, ...this.pictures.map((picture) => safeFavoriteUrl(picture.uri))].filter(Boolean)),
            )
        },
        previewDocument() {
            return favoritePreviewDocument(this.detail.html, this.colors)
        },
        link() {
            return favoriteLink(this.collection)
        },
        location() {
            return this.collection.summary?.location_summary
        },
        hasBody() {
            return Boolean(
                this.isAudio ||
                this.collection.type === 5 ||
                this.detail.content?.text_content ||
                this.detail.html !== undefined ||
                this.link ||
                this.excerpt ||
                this.location,
            )
        },
    },
    watch: {
        detail(value, previous) {
            if (value?.collection.cid !== previous?.collection.cid) {
                this.videoUrl = ''
                this.failedVideoCover = ''
                this.mediaError = ''
                this.mediaLoading = {}
                this.$nextTick(() => {
                    if (!this._isDestroyed) this.$el.scrollTop = 0
                })
            }
        },
    },
    methods: {
        formatTime: favoriteTime,
        formatSize: favoriteSize,
        safeUrl: safeFavoriteUrl,
        openLink(url) {
            ipc.openFavoriteLink(url)
        },
        openPicture(picture) {
            this.openImageUrl(picture.uri)
        },
        openImageUrl(value) {
            const url = safeFavoriteUrl(value)
            if (url && this.imageUrls.includes(url)) ipc.openImage(url, false, this.imageUrls)
        },
        fileLoading(action, file) {
            return Boolean(this.mediaLoading[this.collection.cid + ':' + action + ':' + file.fid])
        },
        async fileAction(action, file) {
            const cid = this.collection.cid
            const key = cid + ':' + action + ':' + file.fid
            if (!file.fid || this.mediaLoading[key]) return
            this.$set(this.mediaLoading, key, true)
            this.mediaError = ''
            try {
                const result =
                    action === 'download'
                        ? await ipc.downloadFavoriteFile(cid, file.fid)
                        : await ipc.getFavoriteVideoUrl(cid, file.fid)
                if (this._isDestroyed || this.detail?.collection.cid !== cid) return
                if (!result || result.ok !== true) throw new Error(result?.error || '收藏资源请求失败')
                if (action === 'play') this.videoUrl = result.data.url
            } catch (error) {
                if (!this._isDestroyed && this.detail?.collection.cid === cid)
                    this.mediaError = error.message || '收藏资源加载失败'
            } finally {
                if (!this._isDestroyed) this.$delete(this.mediaLoading, key)
            }
        },
        async copy(value) {
            try {
                await navigator.clipboard.writeText(value)
                this.$message.success('已复制')
            } catch {
                this.$message.error('复制失败，请选中文本后复制')
            }
        },
    },
}
</script>
