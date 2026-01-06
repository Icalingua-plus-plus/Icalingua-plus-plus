import oicqAdapter from './adapters/oicqAdapter'
import { config, userConfig } from './providers/configManager'
import { init as initSocketIo } from './providers/socketIoProvider'
import onebotAdapter from './adapters/onebotAdapter'
import milkyAdapter from './adapters/milkyAdapter'
import { cleanupOnStartup, setTempDir } from './utils/uploadFileManager'

process.on('unhandledRejection', (error) => {
    console.error('UnhandledException: ', error)
})

// 配置临时文件目录
if (config.tempDir) {
    setTempDir(config.tempDir)
}

// 清理残留的临时上传文件
cleanupOnStartup()

let adapter: typeof oicqAdapter

if (config.milky) {
    adapter = milkyAdapter
} else if (config.onebot) {
    adapter = onebotAdapter
} else {
    adapter = oicqAdapter
}

initSocketIo(adapter)

if (userConfig.account.autologin) adapter.createBot(userConfig.account)
