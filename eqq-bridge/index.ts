import adapter from './adapters/oicqAdapter'
import {config} from './providers/configManager'

adapter.createBot({
    username: config.account.qq,
    password: config.account.passwd,
    storageType: 'mdb',
    mdbConnStr: config.db,
    protocol: config.account.protocol
})
