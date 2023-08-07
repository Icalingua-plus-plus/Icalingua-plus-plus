/**
 * 所有的全局配置文件里面的东西还有初始设置啥的都在这里面
 */
import AllConfig from '@icalingua/types/AllConfig'
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
    protocol: 2,
    autologin: false,
    onlineStatus: OnlineStatusType.Online,
    signAPIAddress: '',
}
const defaultAria2Config: Aria2Config = {
    enabled: false,
    slient: false,
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
    darkTaskIcon: 'auto',
    winSize: defaultWinSize,
    socketIo: '',
    adapter: 'oicq',
    fetchHistoryOnChatOpen: false,
    //给 @rain15z3 一点面子，而且第一次用的人也没有本地表情
    lastUsedStickerType: 'remote',
    keyToSendMessage: 'Enter',
    clearRoomsBehavior: 'disabled',
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
    disableChatGroups: false,
    singleImageMode: false,
    disableChatGroupsRedPoint: false,
    localImageViewerByDefault: false,
    disableQLottie: false,
    disableNotification: false,
    lockPassword: '',
    useSinglePanel: false,
    disableAtAll: false,
    removeGroupNameEmotes: false,
    usePanguJsSend: false,
    usePanguJsRecv: false,
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
    for (const i in emptyLoginForm) {
        if (!(i in config['account'])) {
            config['account'][i] = emptyLoginForm[i]
        }
    }
    for (const i in defaultAria2Config) {
        if (!(i in config['aria2'])) {
            config['aria2'][i] = defaultAria2Config[i]
        }
    }
    for (const i in defaultWinSize) {
        if (!(i in config['winSize'])) {
            config['winSize'][i] = defaultWinSize[i]
        }
    }

    if (typeof config.darkTaskIcon === 'boolean') config.darkTaskIcon = config.darkTaskIcon ? 'true' : 'false'
    saveConfigFile()
} else {
    config = defaultConfig
    saveConfigFile()
}
