<template>
    <div class="image-gallery icalingua-theme-holder">
        <div class="gallery-header">
            <span class="gallery-title">{{ roomName }} 的聊天图片</span>
            <el-date-picker
                v-model="selectedMonth"
                type="month"
                placeholder="跳转到月份"
                size="small"
                class="month-selector"
                :picker-options="pickerOptions"
                format="yyyy年M月"
                @change="jumpToMonth"
            />
        </div>
        <div class="gallery-content" ref="galleryContent" @scroll="handleScroll">
            <template v-for="(group, index) in groupedImages">
                <div :key="group.month" class="month-group" :ref="'month-' + group.month">
                    <div class="month-divider">
                        <span class="month-label">{{ group.label }}</span>
                    </div>
                    <div class="image-grid">
                        <div v-for="img in group.images" :key="img.id" class="image-item" @click="openImage(img)">
                            <img
                                :src="img.url"
                                loading="lazy"
                                :class="{ 'flash-image': img.flash }"
                                @error="handleImageError"
                            />
                            <div v-if="img.flash" class="flash-indicator">
                                <i class="el-icon-lightning"></i>
                            </div>
                        </div>
                    </div>
                </div>
            </template>
            <div v-if="loading" class="loading-indicator"><i class="el-icon-loading"></i> 加载中...</div>
            <div v-if="noMore && images.length > 0" class="no-more">没有更多图片了</div>
            <div v-if="!loading && images.length === 0" class="empty-state">
                <i class="el-icon-picture-outline"></i>
                <p>暂无聊天图片</p>
            </div>
        </div>
    </div>
</template>

<script>
import { ipcRenderer } from 'electron'
import ipc from '../utils/ipc'
import '../utils/themes'

export default {
    name: 'ImageGalleryView',
    data() {
        return {
            roomId: 0,
            roomName: '',
            images: [],
            loading: false,
            noMore: false,
            offset: 0,
            endTime: null, // 用于从指定月份开始加载
            selectedMonth: null,
            pickerOptions: {
                disabledDate(date) {
                    return date > new Date()
                },
            },
        }
    },
    computed: {
        groupedImages() {
            const groups = {}
            for (const img of this.images) {
                const monthKey = img.monthKey
                if (!groups[monthKey]) {
                    groups[monthKey] = {
                        month: monthKey,
                        label: img.monthLabel,
                        images: [],
                    }
                }
                groups[monthKey].images.push(img)
            }
            // 按月份倒序排列
            return Object.values(groups).sort((a, b) => b.month.localeCompare(a.month))
        },
    },
    async created() {
        this.roomId = Number(this.$route.params.roomId)
        this.roomName = decodeURIComponent(this.$route.params.roomName || '聊天')
        document.title = `${this.roomName} 的聊天图片`
        await this.loadImages()
    },
    methods: {
        async loadImages() {
            if (this.loading || this.noMore) return
            this.loading = true
            try {
                const messages = await ipc.fetchImageMessages(this.roomId, this.offset, this.endTime)
                if (messages.length === 0) {
                    this.noMore = true
                } else {
                    const newImages = this.extractImages(messages)
                    this.images.push(...newImages)
                    this.offset += messages.length
                    // 如果加载的图片不够填满屏幕，继续加载
                    this.$nextTick(() => {
                        const content = this.$refs.galleryContent
                        if (content && content.scrollHeight <= content.clientHeight && !this.noMore) {
                            this.loadImages()
                        }
                    })
                }
            } catch (e) {
                console.error('Failed to load images:', e)
            } finally {
                this.loading = false
            }
        },
        extractImages(messages) {
            const images = []
            for (const msg of messages) {
                if (!msg.files || !Array.isArray(msg.files)) continue
                const msgDate = new Date(msg.time)
                const monthKey = `${msgDate.getFullYear()}-${String(msgDate.getMonth() + 1).padStart(2, '0')}`
                const monthLabel = `${msgDate.getFullYear()}年${msgDate.getMonth() + 1}月`
                let imgIndex = 0
                for (const file of msg.files) {
                    if (file.type && file.type.startsWith('image/')) {
                        images.push({
                            id: `${msg._id}-${imgIndex}`,
                            url: file.url,
                            type: file.type,
                            flash: msg.flash || false,
                            time: msg.time,
                            monthKey,
                            monthLabel,
                            message: msg,
                            imgIndex,
                        })
                        imgIndex++
                    }
                }
            }
            return images
        },
        handleScroll(e) {
            const { scrollTop, scrollHeight, clientHeight } = e.target
            // 距离底部 200px 时加载更多
            if (scrollHeight - scrollTop - clientHeight < 200) {
                this.loadImages()
            }
        },
        async jumpToMonth(date) {
            if (!date) return
            const targetYear = date.getFullYear()
            const targetMonth = date.getMonth() + 1

            // 计算该月份最后一天的时间戳（下个月第一天的 00:00:00 减 1 毫秒）
            const endOfMonth = new Date(targetYear, targetMonth, 1, 0, 0, 0, 0).getTime() - 1

            // 重置状态，从指定月份开始加载
            this.images = []
            this.offset = 0
            this.noMore = false
            this.endTime = endOfMonth

            await this.loadImages()
        },
        scrollToMonth(monthKey) {
            const ref = this.$refs['month-' + monthKey]
            if (ref && ref[0]) {
                ref[0].scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
        },
        openImage(img) {
            // 收集当前分组内的所有图片 URL 作为图片列表
            const group = this.groupedImages.find((g) => g.month === img.monthKey)
            const urlList = group ? group.images.map((i) => i.url) : [img.url]
            // 调用 openImage IPC
            ipcRenderer.send('openImage', img.url, false, urlList)
        },
        handleImageError(e) {
            e.target.src =
                'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23ddd" width="100" height="100"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23999" font-size="12">加载失败</text></svg>'
        },
    },
}
</script>

<style lang="scss" scoped>
.image-gallery {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    background: var(--chat-content-bg-color, #f5f5f5);
    color: var(--chat-color, #333);
}

.gallery-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: var(--chat-header-bg-color, #fff);
    border-bottom: 1px solid var(--chat-border-color, #e0e0e0);
    -webkit-app-region: drag;

    .gallery-title {
        font-size: 16px;
        font-weight: 500;
    }

    .month-selector {
        width: 140px;
        -webkit-app-region: no-drag;
    }
}

.gallery-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
}

.month-group {
    margin-bottom: 24px;
}

.month-divider {
    display: flex;
    align-items: center;
    margin-bottom: 12px;

    &::before,
    &::after {
        content: '';
        flex: 1;
        height: 1px;
        background: var(--chat-border-color, #e0e0e0);
    }

    .month-label {
        padding: 0 12px;
        font-size: 13px;
        color: var(--chat-header-color-info, #999);
    }
}

.image-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 8px;
}

.image-item {
    position: relative;
    aspect-ratio: 1;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    background: var(--chat-bg-color-input, #eee);
    transition:
        transform 0.2s,
        box-shadow 0.2s;

    &:hover {
        transform: scale(1.02);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;

        &.flash-image {
            filter: blur(20px);
        }
    }

    .flash-indicator {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 24px;
        color: #fff;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    }
}

.loading-indicator,
.no-more,
.empty-state {
    text-align: center;
    padding: 20px;
    color: var(--chat-header-color-info, #999);
}

.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 60%;

    i {
        font-size: 64px;
        margin-bottom: 16px;
        opacity: 0.5;
    }

    p {
        font-size: 14px;
    }
}
</style>

<style lang="scss">
@import '../components/vac-mod/styles/index.scss';
</style>
