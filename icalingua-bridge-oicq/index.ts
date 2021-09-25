import adapter from './adapters/oicqAdapter'
import {userConfig} from './providers/configManager'
import {init as initSocketIo} from './providers/socketIoProvider'

initSocketIo()

if (userConfig.account.autologin)
    adapter.createBot(userConfig.account)
