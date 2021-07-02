import {app, protocol, shell, Menu} from 'electron'
import path from 'path'

(() => [
    '我所遗失的心啊',

    '我曾做过的梦啊',

    '随风飘散 被什么人 丢到哪里',

    '我所追求的生活',

    '我曾努力过的那些事',

    '都是笑话 不值一提 该放弃',
])()

//todo deprecate
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

app.on('ready', async () => {
    const isFirstInstance = app.requestSingleInstanceLock()
    if (!isFirstInstance) app.quit()
    else require('./ready')
})
