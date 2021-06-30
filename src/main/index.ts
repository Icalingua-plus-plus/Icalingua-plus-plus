import {app, protocol, shell, Menu} from 'electron'
import path from 'path'
import {destroyWindow, ready, showWindow} from './utils/windowManager'
import initSettingsManager from './utils/initSettingsManager'

(() => {
    '我所遗失的心啊'

    '我曾做过的梦啊'

    '随风飘散 被什么人 丢到哪里'

    '我所追求的生活'

    '我曾努力过的那些事'

    '都是笑话 不值一提 该放弃'


})()
require('@electron/remote/main').initialize()

if (process.env.NODE_ENV !== 'development') {
    global.STATIC = global.__static = path.join(__dirname, '/static').replace(/\\/g, '\\\\')
} else {
    global.STATIC = global.__static = path.join(__dirname, '../../static')
}

global.STORE_PATH = app.getPath('userData')

global.winURL =
    process.env.NODE_ENV === 'development'
        ? `http://localhost:9080`
        : `file://${__dirname}/index.html`

var isLoggingin = false

app.on('ready', async () => {
    const isFirstInstance = app.requestSingleInstanceLock()
    if (!isFirstInstance) app.quit()
    else {
        await initSettingsManager()
        require('./ipc/system')
        require('./ipc/ipcBotAndStorage')
        require('./ipc/openImage')
        app.allowRendererProcessReuse = false
        if (process.env.NODE_ENV === 'development')
            protocol.registerFileProtocol('file', (request, cb) => {
                const pathname = request.url.replace('file:///', '')
                cb(pathname)
            })
        ready()
        Menu.setApplicationMenu(Menu.buildFromTemplate([
            {
                role: 'toggleDevTools',
            },
        ]))
    }
})

app.on('window-all-closed', () => {
    if (isLoggingin) return
    if (global.bot) global.bot.logout()
    setTimeout(() => {
        app.quit()
    }, 1000)
})

app.on('web-contents-created', (e, webContents) => {
    webContents.on('new-window', (event, url) => {
        event.preventDefault()
        shell.openExternal(url)
    })
})

app.on('second-instance', showWindow)

app.on('before-quit', () => {
    destroyWindow()
    if (global.bot) global.bot.logout()
})

app.on('will-quit', () => {
    destroyWindow()
    if (global.bot) global.bot.logout()
})

