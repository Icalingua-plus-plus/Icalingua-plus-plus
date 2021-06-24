import {execFileSync, execFile} from 'child_process'
import which from 'which'
import {BrowserWindow, ipcMain} from 'electron'
import path from "path";
import querystring from 'querystring'

let viewer = ''
const VIEWERS = [
    'gwenview', 'eog', 'eom', 'ristretto', 'okular', 'gimp'
]

declare global {
    namespace NodeJS {
        interface Global {
            STATIC: string
        }
    }
}

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
console.log(global.STATIC)
ipcMain.on('openImage', (e, url: string, external: boolean = false) => {
    if (!external) {
        const viewerWindow = new BrowserWindow({
            autoHideMenuBar: true,
            webPreferences: {
                nodeIntegration: true,
                enableRemoteModule: true,
                webSecurity: false,
                contextIsolation: false
            },
        });
        viewerWindow.loadURL('file://' + path.join(global.STATIC, "imgView.html") + '?' + querystring.stringify({url}))
        viewerWindow.maximize()
    } else if (viewer) {
        execFile(viewer, [url])
    } else {
        //todo
    }
})
