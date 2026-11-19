<template>
    <div :style="style">
        <div v-if="!videoReady" ref="lavContainer" style="width: 100%; height: 100%" />
        <video
            v-if="videoUrl"
            ref="videoEl"
            :src="videoUrl"
            :style="{ visibility: videoReady ? 'visible' : 'hidden' }"
            style="position: absolute; inset: 0; width: 100%; height: 100%"
            muted
            playsinline
            preload="auto"
            @loadeddata="onVideoLoaded"
            @error="onVideoError"
            @ended="replayVideo"
            @timeupdate="onVideoTimeUpdate"
            @seeked="onVideoSeeked"
        />
    </div>
</template>

<script>
import lottie from 'lottie-web'
import {
    getCacheKey,
    getCacheUrl,
    isSupported as isWebmSupported,
    loadLottieJsonData,
    queueRender,
} from '../utils/lottieWebmCache'
import { createRendererLifecycleScope } from '../utils/rendererLifecycleScope'

export default {
    props: {
        path: {
            required: true,
        },
        pathResult: {
            required: false,
            default: null,
        },
        speed: {
            type: Number,
            required: false,
            default: 1,
        },
        width: {
            type: Number,
            required: false,
            default: -1,
        },
        height: {
            type: Number,
            required: false,
            default: -1,
        },
        loop: {
            type: Boolean,
            required: false,
            default: true,
        },
        autoPlay: {
            type: Boolean,
            required: false,
            default: true,
        },
        loopDelayMin: {
            type: Number,
            required: false,
            default: 0,
        },
        loopDelayMax: {
            type: Number,
            required: false,
            default: 0,
        },
    },
    data: () => ({
        rendererSettings: {
            scaleMode: 'centerCrop',
            progressiveLoad: true,
            hideOnTransparent: true,
        },
        isVisible: false,
        videoUrl: null,
        videoReady: false,
        isReplaying: false,
    }),
    created() {
        this.lifecycleScope = createRendererLifecycleScope()
        this._animationGeneration = 0
        this._loadingGeneration = null
        this._animation = null
        this._loopTimer = null
        this._previewTimer = null
        this._cancelWebmRender = null
        this._skipVideoCache = false
        this.lifecycleScope.addCleanup(() => this.cancelWebmRender())
        this.lifecycleScope.addCleanup(() => this.destroyAnimation())
    },
    computed: {
        style() {
            return {
                position: 'relative',
                width: this.width !== -1 ? `${this.width}px` : '100%',
                height: this.height !== -1 ? `${this.height}px` : '100%',
                overflow: 'hidden',
                margin: '0 auto',
            }
        },
        animationPaths() {
            return [this.path, this.pathResult]
        },
        isTwoSegment() {
            return this.pathResult && this.pathResult !== this.path
        },
    },
    mounted() {
        const observer = new IntersectionObserver((entries) => {
            const entry = entries.at(-1)
            if (!entry || this._isBeingDestroyed || this._isDestroyed) return
            if (entry.isIntersecting) this.onEnterViewport()
            else this.onLeaveViewport()
        })
        observer.observe(this.$el)
        this.lifecycleScope.addCleanup(() => observer.disconnect())
    },
    beforeDestroy() {
        this._animationGeneration++
        this.lifecycleScope.dispose()
    },
    methods: {
        cancelWebmRender() {
            this._cancelWebmRender?.()
            this._cancelWebmRender = null
        },
        cancelPreview() {
            this.lifecycleScope.cancelTimeout(this._previewTimer)
            this._previewTimer = null
        },
        cancelLoop() {
            this.lifecycleScope.cancelTimeout(this._loopTimer)
            this._loopTimer = null
            this.isReplaying = false
        },
        destroyAnimation() {
            this._animation?.destroy()
            this._animation = null
        },
        async loadAnimation() {
            if (!this.isVisible || this.videoReady || !this.path || this._isBeingDestroyed || this._isDestroyed) return
            const generation = this._animationGeneration
            if (this._loadingGeneration === generation) return
            this._loadingGeneration = generation
            try {
                const [jsonData, resultData] = await Promise.all([
                    loadLottieJsonData(this.path),
                    this.isTwoSegment ? loadLottieJsonData(this.pathResult).catch(() => null) : null,
                ])
                if (generation !== this._animationGeneration || !this.isVisible) return

                const showPreview = () => {
                    if (
                        generation !== this._animationGeneration ||
                        !this.isVisible ||
                        this.videoReady ||
                        this._animation
                    )
                        return
                    this.initAnimation(jsonData, resultData)
                }
                if (!this._animation) {
                    this.cancelPreview()
                    // 给缓存视频一次直接显示的机会，等待过久时先显示 SVG。
                    this._previewTimer = this.lifecycleScope.timeout(() => {
                        this._previewTimer = null
                        try {
                            showPreview()
                        } catch (error) {
                            console.error('Failed to load Lottie preview:', error)
                        }
                    }, 100)
                }
                if (this.videoUrl) return

                const key = !this._skipVideoCache && isWebmSupported() ? getCacheKey(jsonData, resultData) : null
                const url = key && (await getCacheUrl(key))
                if (generation !== this._animationGeneration || !this.isVisible) return
                if (url) {
                    this.videoUrl = url
                    return
                }

                this.cancelPreview()
                showPreview()
                if (!key) return

                this._cancelWebmRender = queueRender(key, jsonData, resultData, (cacheUrl) => {
                    this._cancelWebmRender = null
                    if (generation !== this._animationGeneration || !this.isVisible) return
                    this.videoUrl = cacheUrl
                })
            } catch (error) {
                if (generation === this._animationGeneration) console.error('Failed to load Lottie animation:', error)
            } finally {
                if (this._loadingGeneration === generation) this._loadingGeneration = null
            }
        },
        initAnimation(jsonData, resultData) {
            this._videoFrameRate = jsonData.fr || 30
            this._videoFrameOffset = 0
            this._animationCompleted = false
            lottie.setQuality('medium')
            const animation = lottie.loadAnimation({
                container: this.$refs.lavContainer,
                renderer: 'svg',
                loop: !resultData && this.loop && this.loopDelayMin <= 0,
                autoplay: this.autoPlay,
                animationData: structuredClone(jsonData),
                rendererSettings: this.rendererSettings,
            })
            this._animation = animation
            animation.setSpeed(this.speed)
            this.$emit('AnimControl', animation)
            animation.addEventListener('complete', () => {
                if (this._animation !== animation) return
                if (!resultData) {
                    this._animationCompleted = !this.loop || this.isTwoSegment
                    return
                }
                this.destroyAnimation()
                this._videoFrameOffset = jsonData.op - jsonData.ip || jsonData.op
                const result = lottie.loadAnimation({
                    container: this.$refs.lavContainer,
                    renderer: 'svg',
                    loop: false,
                    autoplay: this.isVisible,
                    animationData: structuredClone(resultData),
                    rendererSettings: this.rendererSettings,
                })
                this._animation = result
                result.setSpeed(this.speed)
                result.addEventListener('complete', () => {
                    if (this._animation === result) this._animationCompleted = true
                })
            })
            if (!resultData && this.autoPlay && this.loop && this.loopDelayMin > 0) {
                this.executeLoop()
            }
        },
        getRandomInt(min, max) {
            min = Math.ceil(min)
            max = Math.floor(max)
            // The maximum is exclusive and the minimum is inclusive
            return Math.floor(Math.random() * (max - min)) + min
        },
        executeLoop() {
            if (!this._animation || !this.isVisible) return
            this._animation.play()
            this._loopTimer = this.lifecycleScope.timeout(
                () => {
                    this._loopTimer = null
                    if (!this._animation || !this.isVisible) return
                    this._animation.stop()
                    this.executeLoop()
                },
                this.getRandomInt(this.loopDelayMin, this.loopDelayMax === 0 ? this.loopDelayMin : this.loopDelayMax),
            )
        },
        onEnterViewport() {
            if (this.isVisible) return
            this.isVisible = true
            const video = this.$refs.videoEl
            if (this.videoReady && video) {
                if (video.ended) this.replayVideo()
                else this.playVideo(video)
                return
            }
            if (this._animation) {
                if (!this.isTwoSegment && this.loop && this.loopDelayMin > 0) this.executeLoop()
                else this._animation.play()
            }
            void this.loadAnimation()
        },
        onLeaveViewport() {
            this.isVisible = false
            this._animationGeneration++
            this.cancelWebmRender()
            this.cancelPreview()
            this.cancelLoop()
            this.$refs.videoEl?.pause()
            this._animation?.pause()
        },
        playVideo(video) {
            void video.play().catch(() => undefined)
        },
        onVideoLoaded() {
            const video = this.$refs.videoEl
            if (!video || this.videoReady || video.seeking) return
            const animation = this._animation
            if (animation && Number.isFinite(video.duration)) {
                // 两段合成的 WebM 共用第一段的帧率，第二段从其帧偏移开始。
                const time = this._animationCompleted
                    ? video.duration
                    : (this._videoFrameOffset + animation.currentFrame) / this._videoFrameRate
                if (time > 0) {
                    video.currentTime = Math.min(time, video.duration)
                    if (video.seeking) return
                }
            }
            this.showVideo(video)
        },
        onVideoSeeked() {
            this.isReplaying = false
            const video = this.$refs.videoEl
            if (video && !this.videoReady) this.showVideo(video)
        },
        showVideo(video) {
            const playing = this._animation ? !this._animation.isPaused : this.autoPlay
            const waitingForLoop = this._animation && this._loopTimer !== null
            this.cancelPreview()
            this.cancelLoop()
            this.destroyAnimation()
            this.videoReady = true
            video.playbackRate = this.speed
            if (this.isVisible) {
                if (playing) this.playVideo(video)
                else if (waitingForLoop) this.replayVideo()
            }
            this.$emit('AnimControl', video)
        },
        onVideoError() {
            this._skipVideoCache = true
            this.videoUrl = null
            if (this.videoReady) this.cancelLoop()
            this.videoReady = false
            if (!this._animation) this.$nextTick(() => this.loadAnimation())
        },
        onVideoTimeUpdate() {
            const el = this.$refs.videoEl
            if (!el || !this.loop || this.isTwoSegment || el.paused || this.isReplaying) return
            if (el.duration && el.duration > 0 && el.currentTime >= el.duration - 0.1) {
                this.replayVideo()
            }
        },
        replayVideo() {
            if (!this.videoReady || !this.isVisible || !this.loop || this.isTwoSegment || this.isReplaying) return
            const el = this.$refs.videoEl
            if (!el) return
            this.isReplaying = true
            const restart = () => {
                this._loopTimer = null
                el.currentTime = 0
                this.playVideo(el)
            }
            if (this.loopDelayMin > 0) {
                const delay = this.getRandomInt(
                    this.loopDelayMin,
                    this.loopDelayMax === 0 ? this.loopDelayMin : this.loopDelayMax,
                )
                this._loopTimer = this.lifecycleScope.timeout(restart, delay)
            } else {
                restart()
            }
        },
    },
    watch: {
        animationPaths() {
            this._animationGeneration++
            this.cancelWebmRender()
            this.cancelPreview()
            this.cancelLoop()
            this.destroyAnimation()
            this._skipVideoCache = false
            this.videoUrl = null
            this.videoReady = false
            this.$nextTick(() => this.loadAnimation())
        },
    },
}
</script>
