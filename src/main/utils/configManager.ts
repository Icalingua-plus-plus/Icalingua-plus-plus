import LoginForm from '../../types/LoginForm'
import Aria2Config from '../../types/Aria2Config'
import IgnoreChatInfo from '../../types/IgnoreChatInfo'
import fs from 'fs'
import path from 'path'
import YAML from 'yaml'
import {app} from 'electron'

type AllConfig = {
    account: LoginForm
    priority: 1 | 2 | 3 | 4 | 5
    aria2: Aria2Config
    ignoredChats: Array<IgnoreChatInfo>
    darkTaskIcon: boolean
}

const emptyLoginForm: LoginForm = {
    mdbConnStr: 'mongodb://localhost',
    rdsHost: '127.0.0.1',
    storageType: 'mdb',
    username: '',
    password: '',
    protocol: 5,
    autologin: false,
    onlineStatus: 11,
}
const defaultAria2Config: Aria2Config = {
    enabled: false,
    host: '127.0.0.1',
    port: 6800,
    secure: false,
    secret: '',
    path: '/jsonrpc',
}
const defaultConfig: AllConfig = {
    account: emptyLoginForm,
    priority: 3,
    aria2: defaultAria2Config,
    ignoredChats: [],
    darkTaskIcon: false,
}

const configFilePath = path.join(app.getPath('userData'), 'config.yaml')

let config: AllConfig

export const init = () => {
    if (fs.existsSync(configFilePath)) {
        config = YAML.parse(fs.readFileSync(configFilePath, 'utf8'))
        for (const i in defaultConfig) {
            //检查目前的配置文件是否完整，用于升级的情况
            if (!(i in config)) {
                config[i] = defaultConfig[i]
            }
        }
        saveConfigFile()
    } else {
        config = defaultConfig
        saveConfigFile()
    }
}

export const saveConfigFile = () => fs.writeFileSync(configFilePath, YAML.stringify(config), 'utf8')
/**
 * 要记得保存哦
 */
export const getConfig = () => config
