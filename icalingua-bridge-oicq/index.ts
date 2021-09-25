import adapter from './adapters/oicqAdapter'
import {userConfig} from './providers/configManager'
import {init as initSocketIo} from './providers/socketIoProvider'

initSocketIo()

if (userConfig.autologin)
    adapter.createBot(userConfig)
