import {app, protocol} from 'electron'
import {destroyWindow, showLoginWindow, showWindow} from './utils/windowManager'
import {createBot, logOut} from './ipc/botAndStorage'
import {getConfig} from './utils/configManager'

//防止连接自签名的 aria2 出错
process.env.NODE_TLS_REJECT_UNAUTHORIZED = String(0)
require('./utils/configManager')
require('./ipc/system')
require('./ipc/botAndStorage')
require('./ipc/openImage')
app.allowRendererProcessReuse = false
protocol.registerBufferProtocol('jsbridge', ()=>{})
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
