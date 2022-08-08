import { app, Menu, protocol } from 'electron'
import { destroyWindow, showLoginWindow, showWindow } from './utils/windowManager'
import { createBot, logOut } from './ipc/botAndStorage'
import { getConfig } from './utils/configManager'
import repl from 'repl'

require('./utils/configManager')
require('./ipc/system')
require('./ipc/botAndStorage')
require('./ipc/openImage')
app.setAppUserModelId('Icalingua++')
protocol.registerBufferProtocol('jsbridge', () => {})
if (process.env.NODE_ENV === 'development')
    protocol.registerFileProtocol('file', (request, cb) => {
        const pathname = request.url.replace('file:///', '')
        cb(pathname)
    })
if (getConfig().account.autologin || getConfig().adapter === 'socketIo') {
    createBot(getConfig().account)
} else {
    showLoginWindow()
}

app.on('activate', showWindow)

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
