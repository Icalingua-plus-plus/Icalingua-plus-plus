import { execFileSync, execFile } from 'child_process'
import which from 'which'
import ui from '../utils/ui'
import fs from 'fs'

let viewer = ''
const VIEWERS = ['vlc', 'mpv', 'xdg-open']

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
if (!viewer && process.platform === 'win32') {
    try {
        const assoc = execFileSync('cmd', ['/c', 'assoc', '.mp4']).toString()
        const ext = assoc.split('=')[1].trim()
        const ftype = execFileSync('cmd', ['/c', 'ftype', ext]).toString()
        const viewerCmd = ftype.split('=')[1].trim()
        if (viewerCmd[0] === '"') {
            viewer = viewerCmd.slice(1, viewerCmd.indexOf('"', 1))
        } else {
            viewer = viewerCmd.split(' ')[0]
        }
        viewer = execFileSync('cmd', ['/c', 'echo', viewer]).toString().trim()
        if (viewer[0] === '"') {
            viewer = viewer.slice(1, viewer.indexOf('"', 1))
        }
        if (!fs.existsSync(viewer)) {
            console.log(viewer + ' not found')
            viewer = ''
        }
    } catch (e) {
        console.error(e)
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
