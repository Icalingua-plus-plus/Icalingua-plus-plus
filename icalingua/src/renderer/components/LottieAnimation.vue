<template>
    <div v-if="style" :style="style" ref="lavContainer" />
</template>

<script>
import lottie from 'lottie-web'
import fs from 'fs'

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
            clearCanvas: true,
            progressiveLoad: false,
            hideOnTransparent: true,
        },
        anim: null,
        style: null,
    }),
    mounted() {
        this.init()
        window.addEventListener('scroll', this.scrollHandle, true)
    },
    destroyed() {
        if (this.anim) this.anim.destroy() // Releases resources. The DOM element will be emptied.
        window.removeEventListener('scroll', this.scrollHandle, true)
        console.log('lottie animation destroyed.')
    },
    methods: {
        async loadJsonData(path) {
            return JSON.parse(fs.readFileSync(path, 'utf-8'))
        },
        async init() {
            this.style = {
                width: this.width !== -1 ? `${this.width}px` : '100%',
                height: this.height !== -1 ? `${this.height}px` : '100%',
                overflow: 'hidden',
                margin: '0 auto',
            }
        },
        async initAnimation() {
            let jsonData = await this.loadJsonData(this.path)
            let jsonResultData = null
            if (this.pathResult && this.pathResult !== this.path) {
                try {
                    jsonResultData = await this.loadJsonData(this.pathResult)
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
            //如果有第二个动画，就等第一个动画播放完毕后再播放第二个动画
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
        },
        getRandomInt(min, max) {
            min = Math.ceil(min)
            max = Math.floor(max)
            // The maximum is exclusive and the minimum is inclusive
            return Math.floor(Math.random() * (max - min)) + min
        },
        executeLoop() {
            this.anim.play()
            setTimeout(() => {
                this.anim.stop()
                this.executeLoop()
            }, this.getRandomInt(this.loopDelayMin, this.loopDelayMax === 0 ? this.loopDelayMin : this.loopDelayMax))
        },
        scrollHandle() {
            const offset = this.$el.parentElement.getBoundingClientRect()
            const offsetTop = offset.top
            const offsetBottom = offset.bottom
            if (offsetTop <= window.innerHeight && offsetBottom >= 0) {
                if (!this.anim && this.path) {
                    this.initAnimation()
                }
                // console.log('进入可视区域');
                if (this.anim) this.anim.play() // Play the animation if it is in the viewport
            } else {
                // console.log('移出可视区域');
                if (this.anim) {
                    this.anim.destroy() // Destroy the animation if it is not in the viewport
                    this.anim = null
                }
            }
        },
    },
    watch: {
        path: function (newVal, oldVal) {
            this.init()
        },
    },
}
</script>
