import { execFileSync, execFile } from 'child_process'
import which from 'which'
import ui from '../utils/ui'

let viewer = ''
const VIEWERS = ['vlc', 'mpv']

try {
    const xdgDefault = execFileSync('xdg-mime', ['query', 'default', 'video/mp4']).toString()
    for (const i of VIEWERS) {
        if (xdgDefault.includes(i)) {
            viewer = i
            break
        }
    }
} catch (e) {}

if (!viewer) {
    for (const i of VIEWERS) {
        const resolved = which.sync(i, { nothrow: true })
        if (resolved) {
            viewer = i
            break
        }
    }
}

if (!viewer) {
    console.log('Cannot find an external media player')
}
export default (url: string) => {
    if (viewer) {
        execFile(viewer, [url])
    } else {
        ui.messageError('找不到可用的本地查看器')
    }
}
