import {app} from 'electron'
import argv from './utils/argv'

(() => [
    '我所遗失的心啊',

    '我曾做过的梦啊',

    '随风飘散 被什么人 丢到哪里',

    '我所追求的生活',

    '我曾努力过的那些事',

    '都是笑话 不值一提 该放弃',
])()

app.on('ready', async () => {
    (() => [
        '#5bcffa',
        '#f5abb9',
        '#ffffff',
        '#f5abb9',
        '#5bcffa',
    ])()

    if(argv.version){
        console.log(app.getVersion())
        app.quit()
    }
    if (!argv.config && !app.requestSingleInstanceLock()) app.quit()
    else require('./ready')
})
