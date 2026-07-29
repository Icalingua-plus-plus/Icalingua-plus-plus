<template>
    <div
        class="vac-audio-player"
        :class="{ 'is-playing': isPlaying, 'is-dragging': isDragging }"
        @dblclick.stop.prevent
        @click.stop
    >
        <button
            type="button"
            class="vac-audio-play"
            :title="isPlaying ? '暂停' : '播放'"
            :disabled="!src || hasError"
            @click.stop="togglePlay"
        >
            <svg v-if="!isPlaying" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="currentColor" d="M8 5v14l11-7z" />
            </svg>
            <svg v-else viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="currentColor" d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
            </svg>
        </button>

        <div class="vac-audio-main">
            <div
                ref="progress"
                class="vac-audio-progress"
                role="slider"
                :aria-valuemin="0"
                :aria-valuemax="durationSec"
                :aria-valuenow="currentSec"
                :title="hasError ? '语音加载失败' : '拖动进度'"
                @mousedown.stop.prevent="onProgressMouseDown"
                @click.stop.prevent="onProgressClick"
            >
                <div class="vac-audio-progress-track">
                    <div ref="progressFill" class="vac-audio-progress-fill"></div>
                    <div ref="progressKnob" class="vac-audio-progress-knob"></div>
                </div>
            </div>

            <div class="vac-audio-meta">
                <span class="vac-audio-time">{{ timeText }}</span>

                <div class="vac-audio-actions">
                    <el-dropdown
                        trigger="click"
                        placement="top-start"
                        class="vac-audio-rate-dropdown"
                        popper-class="vac-audio-rate-popper"
                        @command="setPlaybackRate"
                    >
                        <button
                            type="button"
                            class="vac-audio-chip"
                            :title="'播放速度 ' + playbackRate + 'x'"
                            @click.stop
                        >
                            {{ playbackRate }}x
                        </button>
                        <el-dropdown-menu slot="dropdown" class="vac-audio-rate-menu">
                            <el-dropdown-item
                                v-for="rate in playbackRates"
                                :key="rate"
                                :command="rate"
                                :class="{ 'is-active': rate === playbackRate }"
                            >
                                {{ rate }}x
                            </el-dropdown-item>
                        </el-dropdown-menu>
                    </el-dropdown>

                    <div class="vac-audio-volume" @click.stop>
                        <button
                            type="button"
                            class="vac-audio-volume-btn"
                            :title="muted || volume === 0 ? '取消静音' : '静音'"
                            @click.stop="toggleMute"
                        >
                            <svg
                                v-if="muted || volume === 0"
                                viewBox="0 0 24 24"
                                width="16"
                                height="16"
                                aria-hidden="true"
                            >
                                <path
                                    fill="currentColor"
                                    d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"
                                />
                            </svg>
                            <svg v-else-if="volume < 0.5" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                                <path
                                    fill="currentColor"
                                    d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"
                                />
                            </svg>
                            <svg v-else viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                                <path
                                    fill="currentColor"
                                    d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
                                />
                            </svg>
                        </button>
                        <input
                            class="vac-audio-volume-slider"
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            :value="muted ? 0 : volume"
                            title="音量"
                            @input="onVolumeInput"
                            @click.stop
                        />
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

export default {
    name: 'MessageAudio',
    props: {
        src: { type: String, required: true },
        audioSession: { type: Object, required: true },
    },
    data() {
        return {
            isPlaying: false,
            isDragging: false,
            currentSec: 0,
            durationSec: 0,
            timeText: '0:00 / 0:00',
            volume: 1,
            muted: false,
            playbackRate: 1,
            playbackRates: PLAYBACK_RATES,
            hasError: false,
            _audio: null,
            _audioHandlers: null,
        }
    },
    watch: {
        src() {
            this.stopProgressTimer()
            this.clearSeekThrottle()
            this.resetState()
            this.$nextTick(() => {
                const audio = this.getAudio()
                if (!audio) return
                this.bindAudio()
                this.syncLocalSettingsFromAudio()
                this.syncAudioSource()
                this.onLoadedMetadata()
                this.syncFromAudio(true)
                if (this.isAudioActive(audio)) this.startProgressTimer()
            })
        },
    },
    mounted() {
        const audio = this.getAudio()
        if (!audio) return
        this.bindAudio()
        this.syncLocalSettingsFromAudio()
        this.syncAudioSource()
        this.onLoadedMetadata()
        this.syncFromAudio(true)
        if (this.isAudioActive(audio)) this.startProgressTimer()
    },
    beforeDestroy() {
        this.stopProgressTimer()
        this.clearSeekThrottle()
        this.unbindDragListeners()
        this.unbindAudio()
    },
    methods: {
        getAudio() {
            return this.audioSession && this.audioSession.audio ? this.audioSession.audio : null
        },
        isAudioActive(audio) {
            return !!audio && !audio.paused && !audio.ended && !audio.error
        },
        bindAudio() {
            const audio = this.getAudio()
            if (!audio) return
            if (!this._audioHandlers) {
                this._audioHandlers = {
                    loadedmetadata: this.onLoadedMetadata.bind(this),
                    durationchange: this.onLoadedMetadata.bind(this),
                    play: this.onPlay.bind(this),
                    pause: this.onPause.bind(this),
                    ended: this.onEnded.bind(this),
                    error: this.onError.bind(this),
                }
            }
            if (this._audio === audio) return
            this.unbindAudio()
            this._audio = audio
            Object.entries(this._audioHandlers).forEach(([eventName, handler]) => {
                audio.addEventListener(eventName, handler)
            })
        },
        unbindAudio() {
            const audio = this._audio
            if (!audio || !this._audioHandlers) return
            Object.entries(this._audioHandlers).forEach(([eventName, handler]) => {
                audio.removeEventListener(eventName, handler)
            })
            this._audio = null
        },
        syncAudioSource() {
            const audio = this.getAudio()
            if (!audio || !this.src) return
            if (audio.getAttribute('src') !== this.src) {
                audio.pause()
                audio.src = this.src
                audio.load()
            }
            audio.playbackRate = this.playbackRate
            audio.volume = this.volume
            audio.muted = this.muted
        },
        syncLocalSettingsFromAudio() {
            const audio = this.getAudio()
            if (!audio) return
            this.playbackRate = audio.playbackRate || this.playbackRate
            this.volume = typeof audio.volume === 'number' ? audio.volume : this.volume
            this.muted = !!audio.muted
        },
        resetState() {
            this.isPlaying = false
            this.isDragging = false
            this.currentSec = 0
            this.durationSec = 0
            this.timeText = '0:00 / 0:00'
            this.hasError = false
            this._duration = 0
            this._dragRatio = 0
            this._lastShownSec = -1
            this._pendingSeekRatio = null
            this._lastSeekAt = 0
            this.clearSeekThrottle()
            this.applyProgress(0)
        },
        togglePlay() {
            const audio = this.getAudio()
            if (!audio || !this.src || this.hasError) return
            if (audio.paused || audio.ended) {
                audio.play().catch(() => {
                    this.isPlaying = false
                    this.stopProgressTimer()
                })
            } else {
                audio.pause()
            }
        },
        onLoadedMetadata() {
            const audio = this.getAudio()
            if (!audio) return
            const d = audio.duration
            // Chrome 有已知 bug：seek 到末尾附近会触发 durationchange 返回更大的 duration，
            // 导致正反馈循环使时长无限增长。一旦 _duration 已设为有效正值，绝不允许它变大。
            const newDuration = d && isFinite(d) ? d : 0
            if (this._duration > 0 && newDuration > this._duration) {
                // 忽略 Chrome 虚报的更大 duration，保持原始值
            } else {
                this._duration = newDuration
            }
            this.durationSec = Math.floor(this._duration)
            audio.playbackRate = this.playbackRate
            audio.volume = this.volume
            audio.muted = this.muted
            this.hasError = false
            const ct = audio.currentTime || 0
            this.updateTimeText(ct, true)
            this.applyProgress(this._duration ? ct / this._duration : 0)
        },
        onPlay() {
            this.isPlaying = true
            this.syncFromAudio(true)
            this.startProgressTimer()
        },
        onPause() {
            this.isPlaying = false
            this.stopProgressTimer()
            this.syncFromAudio(true)
        },
        onEnded() {
            this.isPlaying = false
            this.stopProgressTimer()
            this.updateTimeText(0, true)
            this.applyProgress(0)
        },
        onError() {
            this.hasError = true
            this.isPlaying = false
            this.stopProgressTimer()
        },
        startProgressTimer() {
            if (this._progressTimer) return
            this._progressTimer = setInterval(() => {
                if (!this.isPlaying || this.isDragging) return
                this.syncFromAudio(false)
            }, 250)
        },
        stopProgressTimer() {
            clearInterval(this._progressTimer)
            this._progressTimer = null
        },
        syncFromAudio(force) {
            const audio = this.getAudio()
            if (!audio) return
            const current = audio.currentTime || 0
            const duration = audio.duration && isFinite(audio.duration) ? audio.duration : this._duration || 0
            if (duration && duration !== this._duration) {
                this._duration = duration
                this.durationSec = Math.floor(duration)
            }
            const ratio = duration ? Math.max(0, Math.min(1, current / duration)) : 0
            this.applyProgress(ratio)
            this.updateTimeText(current, force)
            this.isPlaying = this.isAudioActive(audio)
        },
        applyProgress(ratio) {
            const safe = Math.max(0, Math.min(1, ratio))
            const percent = Math.round(safe * 1000) / 10
            const fill = this.$refs.progressFill
            const knob = this.$refs.progressKnob
            if (fill) fill.style.transform = `scaleX(${safe})`
            if (knob) knob.style.left = `${percent}%`
        },
        updateTimeText(current, force) {
            const sec = Math.floor(current || 0)
            if (!force && sec === this._lastShownSec) return
            this._lastShownSec = sec
            this.currentSec = sec
            this.timeText = `${this.formatTime(sec)} / ${this.formatTime(this.durationSec)}`
        },
        cycleRate() {
            const idx = this.playbackRates.indexOf(this.playbackRate)
            const next = this.playbackRates[(idx + 1) % this.playbackRates.length]
            this.setPlaybackRate(next)
        },
        setPlaybackRate(rate) {
            this.playbackRate = rate
            const audio = this.getAudio()
            if (audio) audio.playbackRate = rate
        },
        toggleMute() {
            this.muted = !this.muted
            const audio = this.getAudio()
            if (audio) audio.muted = this.muted
        },
        onVolumeInput(e) {
            const value = Number(e.target.value)
            this.volume = value
            this.muted = value === 0
            const audio = this.getAudio()
            if (audio) {
                audio.volume = value
                audio.muted = this.muted
            }
        },
        getRatioFromEvent(e) {
            const el = this.$refs.progress
            if (!el) return 0
            const rect = el.getBoundingClientRect()
            if (!rect.width) return 0
            return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
        },
        /**
         * @param {number} ratio
         * @param {{ commitAudio?: boolean, force?: boolean }} [options]
         * commitAudio: 是否同步 audio.currentTime
         * force: 立即 seek（忽略节流），用于 mousedown/mouseup/click
         */
        seekToRatio(ratio, options = {}) {
            const { commitAudio = false, force = false } = options
            const duration = this._duration || 0
            if (!duration || !isFinite(duration)) return
            const safe = Math.max(0, Math.min(1, ratio))
            this.applyProgress(safe)
            this.updateTimeText(safe * duration, true)
            if (!commitAudio) return
            this._pendingSeekRatio = safe
            if (force) {
                this.flushPendingSeek()
                return
            }

            const now = performance.now()
            const minInterval = 80
            if (now - this._lastSeekAt >= minInterval) {
                this.flushPendingSeek()
                return
            }
            if (this._seekThrottleTimer) return
            this._seekThrottleTimer = setTimeout(
                () => {
                    this._seekThrottleTimer = null
                    this.flushPendingSeek()
                },
                minInterval - (now - this._lastSeekAt),
            )
        },
        flushPendingSeek() {
            this.clearSeekThrottle()
            const duration = this._duration || 0
            if (!duration || !isFinite(duration)) return
            const ratio = this._pendingSeekRatio
            if (ratio == null) return
            const audio = this.getAudio()
            if (!audio) return
            const target = ratio * duration
            // 避免极小抖动反复 seek
            if (Math.abs((audio.currentTime || 0) - target) < 0.02) return
            try {
                audio.currentTime = target
                this._lastSeekAt = performance.now()
            } catch (e) {}
        },
        clearSeekThrottle() {
            clearTimeout(this._seekThrottleTimer)
            this._seekThrottleTimer = null
        },
        onProgressClick(e) {
            if (this.isDragging) return
            this.seekToRatio(this.getRatioFromEvent(e), { commitAudio: true, force: true })
        },
        onProgressMouseDown(e) {
            if (!this._duration || !isFinite(this._duration)) return
            this.isDragging = true
            this.stopProgressTimer()
            this._dragRatio = this.getRatioFromEvent(e)
            // 按下立即 seek，后续拖动实时 + 节流
            this.seekToRatio(this._dragRatio, { commitAudio: true, force: true })
            this.bindDragListeners()
        },
        onProgressMouseMove(e) {
            if (!this.isDragging) return
            this._dragRatio = this.getRatioFromEvent(e)
            this.seekToRatio(this._dragRatio, { commitAudio: true, force: false })
        },
        onProgressMouseUp() {
            if (!this.isDragging) return
            this.isDragging = false
            this.unbindDragListeners()
            this.seekToRatio(this._dragRatio, { commitAudio: true, force: true })
            if (this.isPlaying) this.startProgressTimer()
        },
        bindDragListeners() {
            document.addEventListener('mousemove', this.onProgressMouseMove)
            document.addEventListener('mouseup', this.onProgressMouseUp)
        },
        unbindDragListeners() {
            document.removeEventListener('mousemove', this.onProgressMouseMove)
            document.removeEventListener('mouseup', this.onProgressMouseUp)
        },
        formatTime(seconds) {
            if (!seconds || !isFinite(seconds) || seconds < 0) return '0:00'
            const total = Math.floor(seconds)
            const m = Math.floor(total / 60)
            const s = total % 60
            return `${m}:${s < 10 ? '0' : ''}${s}`
        },
    },
}
</script>

<style lang="scss" scoped>
.vac-audio-player {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 220px;
    max-width: 300px;
    padding: 8px 10px;
    box-sizing: border-box;
    border-radius: 16px;
    background: var(--chat-message-bg-color-media, rgba(0, 0, 0, 0.06));
    color: var(--chat-message-color, inherit);
    user-select: none;
}

.vac-audio-play {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 50%;
    flex-shrink: 0;
    cursor: pointer;
    color: #1976d2;
    background: rgba(25, 118, 210, 0.12);
    transition: background 0.15s ease;

    &:hover:not(:disabled) {
        background: rgba(25, 118, 210, 0.2);
    }

    &:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }
}

.vac-audio-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.vac-audio-progress {
    position: relative;
    height: 16px;
    display: flex;
    align-items: center;
    cursor: pointer;
}

.vac-audio-progress-track {
    position: relative;
    width: 100%;
    height: 4px;
    border-radius: 999px;
    background: rgba(127, 127, 127, 0.28);
    overflow: visible;
}

.vac-audio-progress-fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 100%;
    border-radius: 999px;
    background: #1976d2;
    transform: scaleX(0);
    transform-origin: left center;
    pointer-events: none;
}

.vac-audio-progress-knob {
    position: absolute;
    top: 50%;
    left: 0%;
    width: 12px;
    height: 12px;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: #1976d2;
    /* 用 box-shadow 画白边，避免 border 参与盒模型导致视觉尺寸变化 */
    box-shadow:
        0 0 0 2px rgba(255, 255, 255, 0.92),
        0 1px 2px rgba(0, 0, 0, 0.18);
    box-sizing: border-box;
    transform: translate3d(-50%, -50%, 0);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.12s ease;
}

.vac-audio-player:hover .vac-audio-progress-knob,
.vac-audio-player.is-dragging .vac-audio-progress-knob,
.vac-audio-player.is-playing .vac-audio-progress-knob {
    opacity: 1;
}

.vac-audio-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
}

.vac-audio-time {
    font-size: 11px;
    line-height: 1;
    opacity: 0.75;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
}

.vac-audio-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
}

.vac-audio-rate-dropdown {
    display: inline-flex;
}

.vac-audio-rate-menu {
    min-width: 72px;
}

.vac-audio-rate-menu ::v-deep .el-dropdown-menu__item {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 30px;
    line-height: 30px;
    padding: 0 12px;
    font-size: 11px;
}

.vac-audio-rate-menu ::v-deep .el-dropdown-menu__item.is-active {
    color: #1976d2;
    font-weight: 600;
    background: rgba(25, 118, 210, 0.08);
}

.vac-audio-rate-popper {
    padding: 4px 0;
}

.vac-audio-chip {
    border: none;
    border-radius: 999px;
    padding: 3px 7px;
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
    color: inherit;
    background: rgba(127, 127, 127, 0.16);
    opacity: 0.9;

    &:hover {
        background: rgba(127, 127, 127, 0.24);
    }
}

.vac-audio-volume {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
}

.vac-audio-volume-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border: none;
    border-radius: 50%;
    padding: 0;
    cursor: pointer;
    color: inherit;
    background: transparent;
    opacity: 0.8;

    &:hover {
        background: rgba(127, 127, 127, 0.14);
        opacity: 1;
    }
}

.vac-audio-volume-slider {
    width: 56px;
    height: 4px;
    margin: 0;
    padding: 0;
    cursor: pointer;
    appearance: none;
    background: transparent;

    &::-webkit-slider-runnable-track {
        height: 4px;
        border-radius: 999px;
        background: rgba(127, 127, 127, 0.28);
    }

    &::-webkit-slider-thumb {
        appearance: none;
        width: 10px;
        height: 10px;
        margin-top: -3px;
        border-radius: 50%;
        background: #1976d2;
        border: 1px solid rgba(255, 255, 255, 0.85);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
    }

    &::-moz-range-track {
        height: 4px;
        border-radius: 999px;
        background: rgba(127, 127, 127, 0.28);
    }

    &::-moz-range-thumb {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #1976d2;
        border: 1px solid rgba(255, 255, 255, 0.85);
    }
}

audio {
    display: none;
}
</style>
