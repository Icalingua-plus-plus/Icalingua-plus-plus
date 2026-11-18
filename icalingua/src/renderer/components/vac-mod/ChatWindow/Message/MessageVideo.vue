<template>
    <div class="vac-video-container">
        <button
            v-if="playInNewWindow"
            type="button"
            class="vac-video-play"
            :class="{ 'has-preview': previewReady }"
            :disabled="(!url && messageId == null) || opening"
            @click.stop="openVideo"
        >
            <video
                v-if="previewUrl"
                :key="previewUrl"
                :src="previewUrl"
                class="vac-video-cover"
                preload="metadata"
                muted
                playsinline
                aria-hidden="true"
                @loadeddata="previewReady = true"
                @error="previewReady = false"
                @play="$event.currentTarget.pause()"
            />
            <i class="el-icon-video-play" aria-hidden="true"></i>
            <span>{{ opening ? '正在打开视频…' : '在新窗口播放视频' }}</span>
        </button>
        <div v-else-if="isHidden">
            <details>
                <summary>Hidden video</summary>
                <video width="100%" height="100%" controls :src="url" :autoplay="autoplay">
                    <source :src="url" />
                </video>
            </details>
        </div>
        <div v-else>
            <video width="100%" height="100%" controls :src="url" :autoplay="autoplay">
                <source :src="url" />
            </video>
        </div>
    </div>
</template>

<script>
import ipc from '@/utils/ipc'

export default {
    name: 'MessageVideo',
    props: {
        isHidden: { type: Boolean, required: true },
        autoplay: { type: Boolean, default: false },
        playInNewWindow: { type: Boolean, default: false },
        messageId: { type: [String, Number], required: false },
        url: { type: String, default: '' },
    },
    data() {
        return { opening: false, previewReady: false }
    },
    computed: {
        resolvedUrl() {
            const base = window.location.href
            return this.url && URL.canParse(this.url, base) ? new URL(this.url, base).href : ''
        },
        previewUrl() {
            if (!this.playInNewWindow || this.isHidden) return ''
            const url = this.resolvedUrl
            return /^(https?|file):/.test(url) ? url : ''
        },
    },
    watch: {
        previewUrl() {
            this.previewReady = false
        },
    },
    methods: {
        async openVideo() {
            if ((!this.url && this.messageId == null) || this.opening) return
            this.opening = true
            try {
                const result = await ipc.openVideo(this.resolvedUrl || this.url, this.messageId)
                if (result === 'expired') {
                    this.$message.error('视频已过期或被屏蔽')
                    return
                }
                if (result) return
            } catch {
                // IPC failed.
            } finally {
                this.opening = false
            }
            this.$message.error('无法在新窗口播放此视频')
        },
    },
}
</script>

<style>
.vac-video-container details {
    cursor: pointer;
}

.vac-video-play {
    position: relative;
    overflow: hidden;
    display: flex;
    width: 100%;
    min-height: 144px;
    padding: 16px;
    border: 1px solid transparent;
    border-radius: 6px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: var(--chat-message-bg-color-media, rgba(0, 0, 0, 0.06));
    color: inherit;
    font: inherit;
    cursor: pointer;
}

.vac-video-cover {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: brightness(0.45);
    opacity: 0;
    pointer-events: none;
}

.vac-video-play.has-preview {
    color: #fff;
}

.vac-video-play.has-preview .vac-video-cover {
    opacity: 1;
}

.vac-video-play > i,
.vac-video-play > span {
    position: relative;
}

.vac-video-play i {
    font-size: 40px;
}

.vac-video-play:enabled:hover,
.vac-video-play:focus-visible {
    border-color: currentColor;
}

.vac-video-play:disabled {
    cursor: default;
    opacity: 0.65;
}
</style>
