/**
 * Lottie → WebM 预渲染缓存（v4 — Mediabunny + WebCodecs）
 *
 * 预渲染 Lottie 动画为 WebM 视频，提升播放性能，减少 CPU 占用。
 */
import lottie, { AnimationItem } from 'lottie-web'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { Output, WebMOutputFormat, BufferTarget, CanvasSource } from 'mediabunny'

const LOG_TAG = '[LottieWebmCache]'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LottieJsonData {
    fr: number
    ip: number
    op: number
    w: number
    h: number
    [key: string]: unknown
}

type RenderCompleteCallback = () => void

// ---------------------------------------------------------------------------
// Cache directory
// ---------------------------------------------------------------------------

let cacheDir: string | null = null

function ensureCacheDir(): string {
    if (cacheDir) return cacheDir
    try {
        const electron = require('electron')
        const app = electron.remote?.app || electron.app
        if (app?.getPath) {
            cacheDir = path.join(app.getPath('userData'), 'lottie-webm-cache')
        }
    } catch {
        /* ignore */
    }
    if (!cacheDir) {
        cacheDir = path.join(require('os').tmpdir(), 'icalingua-lottie-cache')
    }
    try {
        fs.mkdirSync(cacheDir, { recursive: true })
    } catch {
        /* ignore */
    }
    return cacheDir
}

// ---------------------------------------------------------------------------
// Cache key & path
// ---------------------------------------------------------------------------

function getCacheKey(jsonData: LottieJsonData, resultData?: LottieJsonData | null): string {
    // 用 JSON 内容哈希作为缓存 key，文件更新后自动失效
    const raw = resultData ? `${JSON.stringify(jsonData)}\0${JSON.stringify(resultData)}` : JSON.stringify(jsonData)
    return crypto.createHash('md5').update(raw).digest('hex')
}

function getWebmPath(cacheKey: string): string {
    return path.join(ensureCacheDir(), cacheKey + '.webm')
}

// ---------------------------------------------------------------------------
// Public: cache query
// ---------------------------------------------------------------------------

export function hasCache(jsonData: LottieJsonData, resultData?: LottieJsonData | null): boolean {
    try {
        return fs.existsSync(getWebmPath(getCacheKey(jsonData, resultData)))
    } catch {
        return false
    }
}

export function getCacheUrl(jsonData: LottieJsonData, resultData?: LottieJsonData | null): string | null {
    const p = getWebmPath(getCacheKey(jsonData, resultData))
    if (fs.existsSync(p)) {
        return 'file:///' + p.replace(/\\/g, '/')
    }
    return null
}

export function isSupported(): boolean {
    // Mediabunny 需要 VideoEncoder (WebCodecs API)
    try {
        const supported = typeof VideoEncoder !== 'undefined'
        console.log(LOG_TAG, 'isSupported:', supported)
        return supported
    } catch {
        return false
    }
}

// ---------------------------------------------------------------------------
// Render event system
// ---------------------------------------------------------------------------

let renderChain: Promise<void> = Promise.resolve()
const pendingKeys = new Set<string>() // cacheKey 正在渲染
const listeners = new Map<string, Set<RenderCompleteCallback>>() // cacheKey → callbacks

export function onRenderComplete(
    jsonPath: string,
    resultPath: string | undefined,
    jsonData: LottieJsonData,
    resultData: LottieJsonData | null | undefined,
    cb: RenderCompleteCallback,
): () => void {
    const key = getCacheKey(jsonData, resultData)
    // 渲染已完成且缓存存在 → 立即回调
    if (!pendingKeys.has(key) && hasCache(jsonData, resultData)) {
        cb()
        return () => {}
    }
    // 渲染中 → 注册监听，完成后回调
    const listener: RenderCompleteCallback = () => cb()
    if (!listeners.has(key)) listeners.set(key, new Set())
    listeners.get(key)!.add(listener)

    let cancelled = false
    return () => {
        if (cancelled) return
        cancelled = true

        const callbacks = listeners.get(key)
        if (!callbacks) return
        callbacks.delete(listener)
        if (!callbacks.size) listeners.delete(key)
    }
}

function notifyByCacheKey(key: string): void {
    const cbs = listeners.get(key)
    if (cbs) {
        for (const cb of cbs) {
            try {
                cb()
            } catch {
                /* ignore */
            }
        }
        listeners.delete(key)
    }
}

// ---------------------------------------------------------------------------
// SVG → Canvas (单帧)
// ---------------------------------------------------------------------------

function svgToCanvas(svgEl: SVGSVGElement, ctx: CanvasRenderingContext2D, w: number, h: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const svgStr = new XMLSerializer().serializeToString(svgEl)
        const url = URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' }))
        const img = new Image()
        img.onload = () => {
            ctx.clearRect(0, 0, w, h)
            ctx.drawImage(img, 0, 0, w, h)
            URL.revokeObjectURL(url)
            resolve()
        }
        img.onerror = () => {
            URL.revokeObjectURL(url)
            reject(new Error('SVG → Canvas draw failed'))
        }
        img.src = url
    })
}

// ---------------------------------------------------------------------------
// Core: lottie JSON → WebM Blob
// ---------------------------------------------------------------------------

async function renderToWebm(
    jsonData: LottieJsonData,
    resultJsonData: LottieJsonData | null | undefined,
    w: number,
    h: number,
): Promise<Blob> {
    const fps = jsonData.fr || 30
    const durationPerFrame = 1 / fps // 秒

    // 离屏 lottie 容器
    const container = document.createElement('div')
    container.style.cssText = `position:fixed;left:-9999px;top:-9999px;width:${w}px;height:${h}px;overflow:hidden`
    document.body.appendChild(container)

    // 渲染 canvas — 同时用作 lottie 渲染目标和 CanvasSource 输入
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!

    // Mediabunny Output → BufferTarget (内存)
    const output = new Output({
        format: new WebMOutputFormat(),
        target: new BufferTarget(),
    })

    // CanvasSource — VP9 编码，保留 alpha 透明通道
    const videoSource = new CanvasSource(canvas, {
        codec: 'vp9',
        bitrate: 2_000_000,
        alpha: 'keep',
    })

    output.addVideoTrack(videoSource, { frameRate: fps })
    await output.start()

    // 渲染一个 lottie 片段的全部帧
    function renderSegment(animData: LottieJsonData, frameOffset: number): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const anim: AnimationItem = lottie.loadAnimation({
                container,
                renderer: 'svg',
                loop: false,
                autoplay: false,
                animationData: animData,
            })

            anim.addEventListener('data_failed', () => {
                anim.destroy()
                reject(new Error('Lottie data load failed'))
            })

            anim.addEventListener('DOMLoaded', async () => {
                try {
                    const svg = container.querySelector('svg')
                    if (!svg) {
                        anim.destroy()
                        reject(new Error('No SVG element found'))
                        return
                    }

                    const total = anim.totalFrames

                    for (let f = 0; f < total; f++) {
                        anim.goToAndStop(f, true)
                        await svgToCanvas(svg, ctx, w, h)

                        // CanvasSource.add(timestampSeconds, durationSeconds)
                        // 时间戳精确计算，不受实时时钟影响
                        const timestamp = (frameOffset + f) * durationPerFrame
                        await videoSource.add(timestamp, durationPerFrame)

                        if (f % 8 === 7) {
                            await new Promise<void>((r) => setTimeout(r, 0))
                        }
                    }

                    anim.destroy()
                    resolve()
                } catch (err) {
                    anim.destroy()
                    reject(err)
                }
            })
        })
    }

    try {
        const frames1Count = jsonData.op - jsonData.ip || jsonData.op
        await renderSegment(jsonData, 0)

        if (resultJsonData) {
            await renderSegment(resultJsonData, frames1Count)
        }

        videoSource.close()
        await output.finalize()

        try {
            document.body.removeChild(container)
        } catch {
            /* already removed */
        }

        return new Blob([(output.target as BufferTarget).buffer!], { type: 'video/webm' })
    } catch (e) {
        try {
            videoSource.close()
        } catch {
            /* ignore */
        }
        try {
            await output.cancel()
        } catch {
            /* ignore */
        }
        try {
            document.body.removeChild(container)
        } catch {
            /* ignore */
        }
        throw e
    }
}

// ---------------------------------------------------------------------------
// Public: queue a background render
// ---------------------------------------------------------------------------

export function queueRender(
    jsonPath: string,
    resultPath: string | undefined,
    jsonData: LottieJsonData,
    resultJsonData?: LottieJsonData | null,
): void {
    const key = getCacheKey(jsonData, resultJsonData)
    if (pendingKeys.has(key) || hasCache(jsonData, resultJsonData)) {
        console.log(LOG_TAG, 'Skip (already pending or cached):', path.basename(jsonPath))
        return
    }

    console.log(
        LOG_TAG,
        'Queued:',
        path.basename(jsonPath),
        `(${jsonData.w}x${jsonData.h}, ${jsonData.op - jsonData.ip} frames, ${jsonData.fr}fps)`,
    )
    pendingKeys.add(key)

    renderChain = renderChain.then(async () => {
        try {
            const w = jsonData.w || 250
            const h = jsonData.h || 250
            const blob = await renderToWebm(jsonData, resultJsonData, w, h)
            const buf = Buffer.from(await blob.arrayBuffer())
            fs.writeFileSync(getWebmPath(key), buf)
            console.log(LOG_TAG, 'Cached:', path.basename(jsonPath), `(${(buf.length / 1024).toFixed(1)} KB)`)
            notifyByCacheKey(key)
        } catch (err) {
            console.error(LOG_TAG, 'Render failed:', path.basename(jsonPath), err)
            notifyByCacheKey(key) // 清理 listeners，防止泄漏
        } finally {
            pendingKeys.delete(key)
        }
    })
}
