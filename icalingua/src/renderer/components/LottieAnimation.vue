<template>
    <video
        v-if="videoUrl"
        ref="videoEl"
        :src="videoUrl"
        :style="style"
        :autoplay="autoPlay"
        muted
        playsinline
        @loadeddata="onVideoLoaded"
        @ended="onVideoEnded"
        @timeupdate="onVideoTimeUpdate"
    />
    <div v-else-if="style" :style="style" ref="lavContainer" />
</template>

<script>
import lottie from 'lottie-web'
import fs from 'fs'
import path from 'path'
import {
    hasCache,
    getCacheUrl,
    isSupported as isWebmSupported,
    queueRender,
    onRenderComplete,
} from '../utils/lottieWebmCache'

const lottieJsonCache = new Map()

function loadLottieJsonData(filePath) {
    if (lottieJsonCache.has(filePath)) {
        return lottieJsonCache.get(filePath)
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    lottieJsonCache.set(filePath, data)
    return data
}

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
        name: 'lottie-animation',
        rendererSettings: {
            scaleMode: 'centerCrop',
            progressiveLoad: true,
            hideOnTransparent: true,
        },
        anim: null,
        style: null,
        isVisible: false,
        observer: null,
        videoUrl: null,
        isReplaying: false,
    }),
    computed: {
        isTwoSegment() {
            return this.pathResult && this.pathResult !== this.path
        },
    },
    mounted() {
        this.init()
        this.setupObserver()
        // 如果已有 WebM 缓存，直接切换到视频模式
        this.tryUseVideoCache()
        // 没有缓存则立即排队后台渲染（离屏渲染，不依赖组件可见性）
        if (!this.videoUrl) {
            this.$nextTick(() => this.queueWebmRender())
        }
    },
    destroyed() {
        if (this.observer) {
            this.observer.disconnect()
            this.observer = null
        }
        if (this.loopTimer) {
            clearTimeout(this.loopTimer)
            this.loopTimer = null
        }
        if (this.anim) {
            this.anim.destroy()
            this.anim = null
        }
    },
    methods: {
        init() {
            this.style = {
                width: this.width !== -1 ? `${this.width}px` : '100%',
                height: this.height !== -1 ? `${this.height}px` : '100%',
                overflow: 'hidden',
                margin: '0 auto',
            }
        },
        initAnimation() {
            const jsonData = loadLottieJsonData(this.path)
            let jsonResultData = null
            if (this.pathResult && this.pathResult !== this.path) {
                try {
                    jsonResultData = loadLottieJsonData(this.pathResult)
                } catch (error) {
                    console.error(error)
                }
            }

            if (this.anim) {
                this.anim.destroy() // Releases resources. The DOM element will be emptied.
            }

            lottie.setQuality('medium')
            this.anim = lottie.loadAnimation({
                container: this.$refs.lavContainer,
                renderer: 'svg',
                loop: jsonResultData ? false : this.loop,
                autoplay: this.autoPlay,
                animationData: jsonData,
                rendererSettings: this.rendererSettings,
            })

            this.$emit('AnimControl', this.anim)

            this.anim.setSpeed(this.speed)
            if (this.loopDelayMin > 0) {
                this.anim.loop = false
                this.anim.autoplay = false
                this.executeLoop()
            }
            // 如果有第二个动画，就等第一个动画播放完毕后再播放第二个动画
            if (jsonResultData) {
                this.anim.addEventListener('complete', () => {
                    this.anim.destroy() // Releases resources. The DOM element will be emptied.
                    this.anim = lottie.loadAnimation({
                        container: this.$refs.lavContainer,
                        renderer: 'svg',
                        loop: false,
                        autoplay: true,
                        animationData: jsonResultData,
                        rendererSettings: this.rendererSettings,
                    })
                    this.anim.setSpeed(this.speed)
                })
            }

            this.isVisible = true
        },
        getRandomInt(min, max) {
            min = Math.ceil(min)
            max = Math.floor(max)
            // The maximum is exclusive and the minimum is inclusive
            return Math.floor(Math.random() * (max - min)) + min
        },
        executeLoop() {
            if (!this.anim || !this.isVisible) return
            this.anim.play()
            this.loopTimer = setTimeout(
                () => {
                    if (!this.anim || !this.isVisible) return
                    this.anim.stop()
                    this.executeLoop()
                },
                this.getRandomInt(this.loopDelayMin, this.loopDelayMax === 0 ? this.loopDelayMin : this.loopDelayMax),
            )
        },
        tryUseVideoCache() {
            if (!isWebmSupported()) return
            const jsonData = loadLottieJsonData(this.path)
            let resultData = null
            if (this.pathResult && this.pathResult !== this.path) {
                try {
                    resultData = loadLottieJsonData(this.pathResult)
                } catch {
                    /* ignore */
                }
            }
            if (hasCache(jsonData, resultData)) {
                this.videoUrl = getCacheUrl(jsonData, resultData)
            }
        },
        setupObserver() {
            this.observer = new IntersectionObserver(
                (entries) => {
                    for (const entry of entries) {
                        if (entry.target !== this.$el) continue
                        if (entry.isIntersecting) {
                            this.onEnterViewport()
                        } else {
                            this.onLeaveViewport()
                        }
                    }
                },
                { rootMargin: '100px' },
            )
            this.$nextTick(() => {
                if (this.$el) this.observer.observe(this.$el)
            })
        },
        onEnterViewport() {
            if (!this.path) return
            this.isVisible = true
            if (this.videoUrl && this.$refs.videoEl) {
                // 视频模式：直接恢复播放
                this.$refs.videoEl.play()
            } else if (!this.anim) {
                // 首次进入视口：创建 lottie 动画
                this.initAnimation()
            } else {
                // 再次进入视口：恢复播放（而非重建）
                this.anim.play()
                if (this.loopDelayMin > 0) {
                    this.executeLoop()
                }
            }
        },
        onLeaveViewport() {
            this.isVisible = false
            if (this.loopTimer) {
                clearTimeout(this.loopTimer)
                this.loopTimer = null
            }
            if (this.videoUrl && this.$refs.videoEl) {
                // 视频模式：暂停
                this.$refs.videoEl.pause()
            } else if (this.anim) {
                // lottie 模式：暂停而非销毁，下次进入时直接恢复
                this.anim.pause()
            }
        },
        /**
         * 将当前动画加入后台 WebM 渲染队列
         * 由 lottieWebmCache 串行执行，不阻塞前台
         */
        queueWebmRender() {
            if (!isWebmSupported() || !this.path) {
                console.log('[LottieAnim]', 'WebM not supported or no path')
                return
            }
            const jsonData = loadLottieJsonData(this.path)
            let resultData = null
            if (this.pathResult && this.pathResult !== this.path) {
                try {
                    resultData = loadLottieJsonData(this.pathResult)
                } catch {
                    /* result JSON 不存在，忽略 */
                }
            }
            if (hasCache(jsonData, resultData)) return
            console.log('[LottieAnim]', 'Queuing render for', this.path)
            queueRender(this.path, this.pathResult || undefined, jsonData, resultData)
            // 如果渲染已完成（缓存命中），queueRender 内部会 skip
            // 这里注册监听，下次渲染完成后自动切换到视频模式
            onRenderComplete(this.path, this.pathResult || undefined, jsonData, resultData, () => {
                this.videoUrl = getCacheUrl(jsonData, resultData)
                if (this.anim) {
                    this.anim.destroy()
                    this.anim = null
                }
                // v-if 切换后 DOM 重建，需要重新观察新元素
                this.$nextTick(() => {
                    if (this.observer && this.$el) {
                        this.observer.disconnect()
                        this.observer.observe(this.$el)
                    }
                    // 根据当前可见性决定播放或暂停
                    if (this.$refs.videoEl) {
                        if (this.isVisible) {
                            this.$refs.videoEl.play()
                        } else {
                            this.$refs.videoEl.pause()
                        }
                    }
                })
            })
        },
        onVideoLoaded() {
            if (this.$refs.videoEl) {
                this.$refs.videoEl.playbackRate = this.speed
            }
            this.$emit('AnimControl', this.$refs.videoEl)
        },
        onVideoEnded() {
            if (!this.loop || this.isTwoSegment) return
            this.replayVideo()
        },
        onVideoTimeUpdate() {
            const el = this.$refs.videoEl
            if (!el || !this.loop || this.isTwoSegment || el.paused || this.isReplaying) return
            if (el.duration && el.duration > 0 && el.currentTime >= el.duration - 0.1) {
                this.replayVideo()
            }
        },
        replayVideo() {
            // 两段式动画（先播A再播B）不该循环，单段 pathResult===path 的可以循环
            if (!this.loop || this.isTwoSegment || this.isReplaying) return
            const el = this.$refs.videoEl
            if (!el) return
            this.isReplaying = true
            if (this.loopDelayMin > 0) {
                const delay = this.getRandomInt(
                    this.loopDelayMin,
                    this.loopDelayMax === 0 ? this.loopDelayMin : this.loopDelayMax,
                )
                this.loopTimer = setTimeout(() => {
                    el.currentTime = 0
                    el.play()
                    // seek 完成后才解除防重入
                    el.addEventListener(
                        'seeked',
                        () => {
                            this.isReplaying = false
                        },
                        { once: true },
                    )
                }, delay)
            } else {
                el.currentTime = 0
                el.play()
                el.addEventListener(
                    'seeked',
                    () => {
                        this.isReplaying = false
                    },
                    { once: true },
                )
            }
        },
    },
    watch: {
        path() {
            // 完整清理旧状态
            this.videoUrl = null
            if (this.anim) {
                this.anim.destroy()
                this.anim = null
            }
            if (this.observer) {
                this.observer.disconnect()
                this.observer = null
            }
            if (this.loopTimer) {
                clearTimeout(this.loopTimer)
                this.loopTimer = null
            }
            this.init()
            this.setupObserver()
        },
    },
}
</script>
