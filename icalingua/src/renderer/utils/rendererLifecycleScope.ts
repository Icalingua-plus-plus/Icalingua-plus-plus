import { ipcRenderer } from 'electron'

type Cleanup = () => void
type IpcListener = (event: unknown, ...args: any[]) => void

interface IpcRendererLike {
    on(channel: string, listener: IpcListener): unknown
    removeListener(channel: string, listener: IpcListener): unknown
}

export function createRendererLifecycleScope(renderer: IpcRendererLike = ipcRenderer) {
    const cleanups = new Set<Cleanup>()
    const timeoutCleanups = new Map<ReturnType<typeof setTimeout>, Cleanup>()
    const intervalCleanups = new Map<ReturnType<typeof setInterval>, Cleanup>()
    const animationFrameCleanups = new Map<number, Cleanup>()
    let disposed = false

    const track = (cleanup: Cleanup) => {
        if (disposed) {
            cleanup()
            return () => undefined
        }

        cleanups.add(cleanup)
        return () => {
            if (!cleanups.delete(cleanup)) return
            cleanup()
        }
    }

    const onIpc = (channel: string, listener: IpcListener) => {
        if (disposed) return () => undefined
        renderer.on(channel, listener)
        return track(() => renderer.removeListener(channel, listener))
    }

    const onEvent = (
        target: EventTarget,
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
    ) => {
        if (disposed) return () => undefined
        target.addEventListener(type, listener, options)
        return track(() => target.removeEventListener(type, listener, options))
    }

    const timeout = (handler: () => void, delay = 0) => {
        if (disposed) return null

        let handle: ReturnType<typeof setTimeout>
        handle = setTimeout(() => {
            timeoutCleanups.get(handle)?.()
            if (!disposed) handler()
        }, delay)
        const cleanup = track(() => clearTimeout(handle))
        timeoutCleanups.set(handle, () => {
            timeoutCleanups.delete(handle)
            cleanup()
        })
        return handle
    }

    const cancelTimeout = (handle: ReturnType<typeof setTimeout> | null) => {
        if (handle === null) return
        const cleanup = timeoutCleanups.get(handle)
        if (cleanup) cleanup()
        else clearTimeout(handle)
    }

    const interval = (handler: () => void, delay = 0) => {
        if (disposed) return null

        const handle = setInterval(handler, delay)
        const cleanup = track(() => clearInterval(handle))
        intervalCleanups.set(handle, () => {
            intervalCleanups.delete(handle)
            cleanup()
        })
        return handle
    }

    const cancelInterval = (handle: ReturnType<typeof setInterval> | null) => {
        if (handle === null) return
        const cleanup = intervalCleanups.get(handle)
        if (cleanup) cleanup()
        else clearInterval(handle)
    }

    const animationFrame = (handler: FrameRequestCallback) => {
        if (disposed) return null

        let handle: number
        handle = requestAnimationFrame((time) => {
            animationFrameCleanups.get(handle)?.()
            if (!disposed) handler(time)
        })
        const cleanup = track(() => window.cancelAnimationFrame(handle))
        animationFrameCleanups.set(handle, () => {
            animationFrameCleanups.delete(handle)
            cleanup()
        })
        return handle
    }

    const cancelAnimationFrame = (handle: number | null) => {
        if (handle === null) return
        const cleanup = animationFrameCleanups.get(handle)
        if (cleanup) cleanup()
        else window.cancelAnimationFrame(handle)
    }

    const dispose = () => {
        if (disposed) return
        disposed = true
        for (const cleanup of cleanups) {
            try {
                cleanup()
            } catch (error) {
                console.error('Failed to release renderer resource:', error)
            }
        }
        cleanups.clear()
        timeoutCleanups.clear()
        intervalCleanups.clear()
        animationFrameCleanups.clear()
    }

    return {
        addCleanup: track,
        onIpc,
        onEvent,
        timeout,
        cancelTimeout,
        interval,
        cancelInterval,
        animationFrame,
        cancelAnimationFrame,
        dispose,
    }
}

export type RendererLifecycleScope = ReturnType<typeof createRendererLifecycleScope>
