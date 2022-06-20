import { app, Menu, protocol } from 'electron'
import { destroyWindow, showLoginWindow, showWindow } from './utils/windowManager'
import { createBot, logOut } from './ipc/botAndStorage'
import { getConfig } from './utils/configManager'
import repl from 'repl'

require('./utils/configManager')
require('./ipc/system')
require('./ipc/botAndStorage')
require('./ipc/openImage')
protocol.registerBufferProtocol('jsbridge', () => {})
if (process.env.NODE_ENV === 'development')
    protocol.registerFileProtocol('file', (request, cb) => {
        const pathname = request.url.replace('file:///', '')
        cb(pathname)
    })
if (process.platform === 'darwin') {
    const template = [
        {
            label: "Edit",
            submenu: [
                { label: "Undo", accelerator: "CmdOrCtrl+Z", selector: "undo:" },
                { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", selector: "redo:" },
                { label: "Cut", accelerator: "CmdOrCtrl+X", selector: "cut:" },
                { label: "Copy", accelerator: "CmdOrCtrl+C", selector: "copy:" },
                { label: "Paste", accelerator: "CmdOrCtrl+V", selector: "paste:" },
                { label: "Select All", accelerator: "CmdOrCtrl+A", selector: "selectAll:" }
            ]
        }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
if (getConfig().account.autologin || getConfig().adapter === 'socketIo') {
    createBot(getConfig().account)
} else {
    showLoginWindow()
}
app.on('window-all-closed', () => {
    logOut()
    setTimeout(() => {
        app.quit()
    }, 1000)
})

app.on('second-instance', showWindow)

app.on('before-quit', () => {
    logOut()
    destroyWindow()
})

app.on('will-quit', () => {
    logOut()
    destroyWindow()
})

repl.start('icalingua> ')
