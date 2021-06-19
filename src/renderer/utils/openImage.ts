import {execFileSync, execFile} from 'child_process'
import which from 'which'
import remote from '@electron/remote'

let viewer = ''
const VIEWERS = [
    'gwenview', 'eog', 'eom', 'ristretto', 'okular', 'gimp'
]

try {
    const xdgDefault = execFileSync('xdg-mime', ['query', 'default', 'image/jpeg']).toString()
    for (const i of VIEWERS) {
        if (xdgDefault.includes(i)) {
            console.log('xdg', i)
            viewer = i
            break
        }
    }
} catch (e) {
}

if (!viewer) {
    for (const i of VIEWERS) {
        const resolved = which.sync(i, {nothrow: true})
        if (resolved) {
            console.log('which', i)
            viewer = i
            break
        }
    }
}

if (!viewer) {
    console.log('Cannot find an external image viewer')
}

export default (url: string) => {
    if (viewer) {
        execFile(viewer, [url])
    } else {
        //todo
    }
}
