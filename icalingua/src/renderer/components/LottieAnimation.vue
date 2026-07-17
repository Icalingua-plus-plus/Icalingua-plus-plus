<template>
    <div v-if="style" :style="style" ref="lavContainer" />
</template>

<script>
import lottie from 'lottie-web'
import fs from 'fs'
import path from 'path'

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
    }),
    mounted() {
        this.init()
        // 使用 IntersectionObserver 替代 scroll 事件监听
        // 浏览器原生优化，非阻塞，不会随滚动频繁触发
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
            { rootMargin: '100px' }, // 提前 100px 开始加载，减少视觉空白
        )
        this.$nextTick(() => {
            if (this.$el) this.observer.observe(this.$el)
        })
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
        onEnterViewport() {
            if (!this.path) return
            if (!this.anim) {
                // 首次进入视口：创建动画
                this.initAnimation()
            } else {
                // 再次进入视口：恢复播放（而非重建）
                this.isVisible = true
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
            if (this.anim) {
                // 暂停而非销毁，下次进入时直接恢复，避免重复 IO 和解析
                this.anim.pause()
            }
        },
    },
    watch: {
        path: function (newVal, oldVal) {
            // path 变化时销毁旧动画，下次 IntersectionObserver 触发时重建
            if (this.anim) {
                this.anim.destroy()
                this.anim = null
            }
            this.init()
        },
    },
}
</script>
