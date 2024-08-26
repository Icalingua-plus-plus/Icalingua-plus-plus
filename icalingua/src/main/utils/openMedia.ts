import { execFileSync, execFile } from 'child_process'
import which from 'which'
import ui from '../utils/ui'
import fs from 'fs'
import path = require('path')

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
    const queryRegistry = (key: string, name: string) => {
        try {
            const stdout = execFileSync(path.join(process.env.windir, 'system32', 'reg.exe'), [
                'query',
                key,
                '/v',
                name,
            ]).toString()
            const match = stdout.match(/REG_SZ\s+([^\r\n]+)/)
            if (match && !match[1].startsWith('AppX') && !match[1].startsWith('(')) {
                // Windows Store Apps are not supported
                return match[1]
            }
        } catch (e) {
            console.error(e)
        }
        return ''
    }
    try {
        let ext: string
        //用户设置
        ext = queryRegistry(
            'HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.mp4\\UserChoice',
            'Progid',
        )
        ext = ext || queryRegistry('HKEY_CURRENT_USER\\SOFTWARE\\Classes\\.mp4', '')
        ext = ext || queryRegistry('HKEY_CLASSES_ROOT\\.mp4', '')
        if (!ext) {
            const assoc = execFileSync(path.join(process.env.windir, 'system32', 'cmd.exe'), [
                '/c',
                'assoc',
                '.mp4',
            ]).toString()
            ext = assoc.split('=')[1].trim()
        }
        const ftype = execFileSync(path.join(process.env.windir, 'system32', 'cmd.exe'), [
            '/c',
            'ftype',
            ext,
        ]).toString()
        const viewerCmd = ftype.split('=')[1].trim()
        if (viewerCmd[0] === '"') {
            viewer = viewerCmd.slice(1, viewerCmd.indexOf('"', 1))
        } else {
            viewer = viewerCmd.split(' ')[0]
        }
        viewer = viewer || '%ProgramFiles(x86)%\\Windows Media Player\\wmplayer.exe'
        viewer = execFileSync(path.join(process.env.windir, 'system32', 'cmd.exe'), ['/c', 'echo', viewer])
            .toString()
            .trim()
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
