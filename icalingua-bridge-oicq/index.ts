import oicqAdapter from './adapters/oicqAdapter'
import { userConfig } from './providers/configManager'
import { init as initSocketIo } from './providers/socketIoProvider'

const adapter: typeof oicqAdapter = oicqAdapter;

initSocketIo(adapter)

if (userConfig.account.autologin) adapter.createBot(userConfig.account)
