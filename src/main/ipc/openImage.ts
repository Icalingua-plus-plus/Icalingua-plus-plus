import {execFileSync, execFile} from 'child_process'
import which from 'which'
import {BrowserWindow, ipcMain} from 'electron'
import path from 'path'
import querystring from 'querystring'
import getStaticPath from '../../utils/getStaticPath'

let viewer = ''
const VIEWERS = [
    'gwenview', 'eog', 'eom', 'ristretto', 'okular', 'gimp',
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
const openImage = (url: string, external: boolean = false) => {
    if (!external) {
        const viewerWindow = new BrowserWindow({
            autoHideMenuBar: true,
        })
        viewerWindow.loadURL('file://' + path.join(getStaticPath(), 'imgView.html') + '?' + querystring.stringify({url}))
        viewerWindow.maximize()
    } else if (viewer) {
        execFile(viewer, [url])
    } else {
        //todo
    }
}
ipcMain.on('openImage', (e, url: string, external: boolean = false) => openImage(url, external))
export default openImage
