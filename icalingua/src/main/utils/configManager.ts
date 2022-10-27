/**
 * 所有的全局配置文件里面的东西还有初始设置啥的都在这里面
 */
import Aria2Config from '@icalingua/types/Aria2Config'
import LoginForm from '@icalingua/types/LoginForm'
import OnlineStatusType from '@icalingua/types/OnlineStatusType'
import WinSize from '@icalingua/types/WinSize'
import { app, screen } from 'electron'
import fs from 'fs'
import path from 'path'
import YAML from 'yaml'
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
    lastUsedStickerType: 'face' | 'remote' | 'stickers' | 'emojis'
    keyToSendMessage: 'Enter' | 'CtrlEnter' | 'ShiftEnter'
    theme: string
    updateCheck: 'ask' | boolean
    disableBridgeVersionCheck: boolean
    shortcuts: { [key: string]: number }
    zoomFactor: number
    debugmode: boolean
    anonymous: boolean
    linkify: boolean
    roomPanelAvatarOnly: boolean
    roomPanelWidth: number
    sendRawMessage: boolean
    custom: boolean
    fetchHistoryOnStart: boolean
    showAppMenu: boolean
    optimizeMethod: string
    silentFetchHistory: boolean
    hideChatImageByDefault: boolean
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
if (defaultWinSize.width > 1440) defaultWinSize.width = 1440
const defaultConfig: AllConfig = {
    privateKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    server: '',
    account: emptyLoginForm,
    priority: 3,
    aria2: defaultAria2Config,
    darkTaskIcon: false,
    winSize: defaultWinSize,
    socketIo: '',
    adapter: 'oicq',
    fetchHistoryOnChatOpen: false,
    //给 @rain15z3 一点面子，而且第一次用的人也没有本地表情
    lastUsedStickerType: 'remote',
    keyToSendMessage: 'Enter',
    theme: 'auto',
    updateCheck: 'ask',
    disableBridgeVersionCheck: false,
    shortcuts: {},
    zoomFactor: 100,
    debugmode: false,
    anonymous: false,
    linkify: true,
    roomPanelAvatarOnly: false,
    roomPanelWidth: null,
    sendRawMessage: false,
    custom: false,
    fetchHistoryOnStart: false,
    showAppMenu: true,
    optimizeMethod: 'infinite-loading',
    silentFetchHistory: false,
    hideChatImageByDefault: false,
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
