import {app, protocol, shell} from 'electron'
import {destroyWindow, showLoginWindow, showWindow} from './utils/windowManager'
import {createBot, logOut} from './ipc/botAndStorage'
import {getConfig} from './utils/configManager'

require('./utils/configManager')
require('./ipc/system')
require('./ipc/botAndStorage')
require('./ipc/openImage')
app.allowRendererProcessReuse = false
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
