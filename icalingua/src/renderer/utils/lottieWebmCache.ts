/**
 * Lottie → WebM 预渲染缓存（v4 — Mediabunny + WebCodecs）
 *
 * 预渲染 Lottie 动画为 WebM 视频，提升播放性能，减少 CPU 占用。
 */
import lottie, { AnimationItem } from 'lottie-web'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { pathToFileURL } from 'url'
import { Output, WebMOutputFormat, BufferTarget, CanvasSource } from 'mediabunny'

const LOG_TAG = '[LottieWebmCache]'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LottieJsonData {
    fr: number
    ip: number
    op: number
    w: number
    h: number
    [key: string]: unknown
}

type RenderCompleteCallback = (url: string) => void

const jsonCache = new Map<string, Promise<LottieJsonData>>()

export function loadLottieJsonData(filePath: string): Promise<LottieJsonData> {
    let data = jsonCache.get(filePath)
    if (!data) {
        data = fs.promises
            .readFile(filePath, 'utf-8')
            .then((content) => JSON.parse(content))
            .catch((error) => {
                jsonCache.delete(filePath)
                throw error
            })
        jsonCache.set(filePath, data)
    }
    return data
}

// ---------------------------------------------------------------------------
// Cache directory
// ---------------------------------------------------------------------------

let cacheDir: string | null = null

function getCacheDir(): string {
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
    return cacheDir
}

// ---------------------------------------------------------------------------
// Cache key & path
// ---------------------------------------------------------------------------

const cacheKeys = new WeakMap<LottieJsonData, Map<LottieJsonData | null, string>>()

export function getCacheKey(jsonData: LottieJsonData, resultData: LottieJsonData | null): string {
    let variants = cacheKeys.get(jsonData)
    if (!variants) {
        variants = new Map()
        cacheKeys.set(jsonData, variants)
    }
    let key = variants.get(resultData)
    if (!key) {
        // 保留原有磁盘缓存键。播放和转码都只把副本交给会修改数据的 lottie-web。
        const hash = crypto.createHash('md5').update(JSON.stringify(jsonData))
        if (resultData) hash.update('\0').update(JSON.stringify(resultData))
        key = hash.digest('hex')
        variants.set(resultData, key)
    }
    return key
}

function getWebmPath(cacheKey: string): string {
    return path.join(getCacheDir(), cacheKey + '.webm')
}

// ---------------------------------------------------------------------------
// Public: cache query
// ---------------------------------------------------------------------------

export async function getCacheUrl(key: string): Promise<string | null> {
    const filePath = getWebmPath(key)
    try {
        const entry = await fs.promises.stat(filePath)
        return entry.isFile() && entry.size > 0 ? pathToFileURL(filePath).href : null
    } catch {
        return null
    }
}

export function isSupported(): boolean {
    return typeof VideoEncoder !== 'undefined'
}

// ---------------------------------------------------------------------------
// Render event system
// ---------------------------------------------------------------------------

let renderChain: Promise<void> = Promise.resolve()
const renderListeners = new Map<string, Set<RenderCompleteCallback>>()

function waitForIdle(): Promise<void> {
    // 前台持续播放动画时也让转码按批推进。
    return new Promise((resolve) => requestIdleCallback(() => resolve(), { timeout: 250 }))
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
            try {
                ctx.clearRect(0, 0, w, h)
                ctx.drawImage(img, 0, 0, w, h)
                resolve()
            } catch (error) {
                reject(error)
            } finally {
                URL.revokeObjectURL(url)
            }
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
    resultJsonData: LottieJsonData | null,
    w: number,
    h: number,
): Promise<ArrayBuffer> {
    const fps = jsonData.fr || 30
    const durationPerFrame = 1 / fps // 秒

    // 离屏 lottie 容器
    const container = document.createElement('div')
    container.style.cssText = `position:fixed;left:-9999px;top:-9999px;width:${w}px;height:${h}px;overflow:hidden`

    // 渲染 canvas — 同时用作 lottie 渲染目标和 CanvasSource 输入
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!

    // Mediabunny Output → BufferTarget (内存)
    const target = new BufferTarget()
    const output = new Output({
        format: new WebMOutputFormat(),
        target,
    })

    // CanvasSource — VP9 编码，保留 alpha 透明通道
    const videoSource = new CanvasSource(canvas, {
        codec: 'vp9',
        bitrate: 2_000_000,
        alpha: 'keep',
    })

    output.addVideoTrack(videoSource, { frameRate: fps })

    // 渲染一个 lottie 片段的全部帧
    function renderSegment(animData: LottieJsonData, frameOffset: number): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const anim: AnimationItem = lottie.loadAnimation({
                container,
                renderer: 'svg',
                loop: false,
                autoplay: false,
                animationData: structuredClone(animData),
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
                            await waitForIdle()
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
        await output.start()
        document.body.appendChild(container)
        const frames1Count = jsonData.op - jsonData.ip || jsonData.op
        await renderSegment(jsonData, 0)

        if (resultJsonData) {
            await renderSegment(resultJsonData, frames1Count)
        }

        videoSource.close()
        await output.finalize()

        if (!target.buffer?.byteLength) throw new Error('Empty Lottie WebM')
        return target.buffer
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
        throw e
    } finally {
        container.remove()
    }
}

// ---------------------------------------------------------------------------
// Public: queue a background render
// ---------------------------------------------------------------------------

async function writeWebm(key: string, data: ArrayBuffer): Promise<string> {
    const filePath = getWebmPath(key)
    const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`
    await fs.promises.mkdir(getCacheDir(), { recursive: true })
    try {
        await fs.promises.writeFile(tempPath, new Uint8Array(data))
        await fs.promises.rename(tempPath, filePath)
    } catch (error) {
        await fs.promises.unlink(tempPath).catch(() => undefined)
        throw error
    }
    return pathToFileURL(filePath).href
}

async function runRender(
    key: string,
    jsonData: LottieJsonData,
    resultJsonData: LottieJsonData | null,
    callbacks: Set<RenderCompleteCallback>,
): Promise<void> {
    let url: string | null = null
    try {
        if (!callbacks.size) return
        await waitForIdle()
        if (!callbacks.size) return
        url = await getCacheUrl(key)
        if (!url && callbacks.size) {
            const data = await renderToWebm(jsonData, resultJsonData, jsonData.w || 250, jsonData.h || 250)
            url = await writeWebm(key, data)
        }
    } catch (error) {
        console.error(LOG_TAG, 'Render failed:', key, error)
    } finally {
        renderListeners.delete(key)
    }

    if (url) {
        for (const callback of callbacks) {
            try {
                callback(url)
            } catch (error) {
                console.error(LOG_TAG, 'Render callback failed:', error)
            }
        }
    }
    callbacks.clear()
}

export function queueRender(
    key: string,
    jsonData: LottieJsonData,
    resultJsonData: LottieJsonData | null,
    onComplete: RenderCompleteCallback,
): () => void {
    const callbacks = renderListeners.get(key) || new Set<RenderCompleteCallback>()
    if (!renderListeners.has(key)) {
        renderListeners.set(key, callbacks)
        renderChain = renderChain.then(() => runRender(key, jsonData, resultJsonData, callbacks))
    }
    callbacks.add(onComplete)
    return () => {
        callbacks.delete(onComplete)
    }
}
