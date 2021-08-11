/**
 * 所有的全局配置文件里面的东西还有初始设置啥的都在这里面
 */
import LoginForm from '../../types/LoginForm'
import Aria2Config from '../../types/Aria2Config'
import fs from 'fs'
import path from 'path'
import YAML from 'yaml'
import {app, screen} from 'electron'
import OnlineStatusType from '../../types/OnlineStatusType'
import argv from './argv'
import migrateData from './migrateData'

type AllConfig = {
    account: LoginForm
    priority: 1 | 2 | 3 | 4 | 5
    aria2: Aria2Config
    darkTaskIcon: boolean
    winSize: WinSize
    socketIo: string
    adapter: 'oicq' | 'socketIo'
    server: string
    privateKey: string
    fetchHistoryOnChatOpen: boolean
    lastUsedStickerType: 'remote' | 'stickers' | 'emojis'
}


const configFilePath = argv.config || path.join(app.getPath('userData'), 'config.yaml')
const oldConfigFilePath = argv.config || path.join(app.getPath('userData'), '../electron-qq/config.yaml')

let config: AllConfig

export const saveConfigFile = () => fs.writeFileSync(configFilePath, YAML.stringify(config), 'utf8')
/**
 * 要记得保存哦
 */
export const getConfig = () => config

const emptyLoginForm: LoginForm = {
    mdbConnStr: 'mongodb://localhost',
    rdsHost: '127.0.0.1',
    storageType: 'sqlite',
    sqlHost: '127.0.0.1',
    sqlUsername: '',
    sqlPassword: '',
    sqlDatabase: '',
    username: '',
    password: '',
    protocol: 5,
    autologin: false,
    onlineStatus: OnlineStatusType.Online,
}
const defaultAria2Config: Aria2Config = {
    enabled: false,
    host: '127.0.0.1',
    port: 6800,
    secure: false,
    secret: '',
    path: '/jsonrpc',
}
const size = screen.getPrimaryDisplay().size
const defaultWinSize: WinSize = {
    height: size.height - 200,
    width: size.width - 300,
    max: false,
}
if (defaultWinSize.width > 1440)
    defaultWinSize.width = 1440
const defaultConfig: AllConfig = {
    privateKey: '',
    server: '',
    account: emptyLoginForm,
    priority: 3,
    aria2: defaultAria2Config,
    darkTaskIcon: false,
    winSize: defaultWinSize,
    socketIo: '',
    adapter: 'oicq',
    fetchHistoryOnChatOpen: true,
    //给 @rain15z3 一点面子，而且第一次用的人也没有本地表情
    lastUsedStickerType: 'remote',
}
if (!fs.existsSync(configFilePath) && fs.existsSync(oldConfigFilePath)) {
    migrateData()
}
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

