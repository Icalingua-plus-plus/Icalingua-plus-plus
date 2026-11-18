import type { BrowserWindow } from 'electron'
import path from 'path'
import { newIcalinguaWindow } from '../../utils/IcalinguaWindow'
import getStaticPath from '../../utils/getStaticPath'

const videoWindows = new Set<BrowserWindow>()

export function closeVideoWindows() {
    for (const win of videoWindows) {
        if (!win.isDestroyed()) win.destroy()
    }
}

function parseVideoSource(url: unknown): URL | undefined {
    if (typeof url !== 'string' || !URL.canParse(url)) return
    const source = new URL(url)
    if (['http:', 'https:', 'file:'].includes(source.protocol)) return source
}

function isProtobufVideoUrl(url: unknown): boolean {
    return typeof url === 'string' && /^protobuf:\/\//i.test(url)
}

export async function openVideo(freshUrl: unknown, storedUrl: unknown): Promise<boolean | 'expired'> {
    if (isProtobufVideoUrl(freshUrl)) return 'expired'

    const freshSource = parseVideoSource(freshUrl)
    if (!freshSource && isProtobufVideoUrl(storedUrl)) return 'expired'
    const source = freshSource ?? parseVideoSource(storedUrl)
    if (!source) return false

    const win = newIcalinguaWindow(
        {
            width: 960,
            height: 600,
            show: false,
            backgroundColor: '#101010',
            autoHideMenuBar: true,
            webPreferences: {
                autoplayPolicy: 'no-user-gesture-required',
            },
        },
        { stableTitle: 'Icalingua++ 视频播放' },
    )
    videoWindows.add(win)
    win.once('closed', () => videoWindows.delete(win))
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (event) => event.preventDefault())

    try {
        await win.loadFile(path.join(getStaticPath(), 'videoPlayer.html'), {
            hash: new URLSearchParams({ url: source.href }).toString(),
        })
        if (win.isDestroyed()) return false
        win.show()
        return true
    } catch {
        if (!win.isDestroyed()) win.destroy()
        return false
    }
}
