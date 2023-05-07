import fs from 'fs'
import YAML from 'yaml'
import argv from './argv'
import LoginForm from '@icalingua/types/LoginForm'
import OnlineStatusType from '@icalingua/types/OnlineStatusType'

type Config = {
    pubKey: string
    custom: boolean
    port: number
    host: string
    unix?: string
    onebot?: string
}

type UserConfig = {
    account: LoginForm
}

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

const CONFIG_PATH = argv.config || 'config.yaml'
export const config: Config = YAML.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))

if (!fs.existsSync('data')) fs.mkdirSync('data')

const USER_CONFIG_PATH = argv.data || `data/${config.port}.json`
export const userConfig: UserConfig = fs.existsSync(USER_CONFIG_PATH)
    ? JSON.parse(fs.readFileSync(USER_CONFIG_PATH, 'utf8'))
    : { account: emptyLoginForm }
if (!userConfig.account) userConfig.account = Object.assign({}, emptyLoginForm)
Object.keys(emptyLoginForm).forEach((key) => {
    console.log(key, userConfig.account[key], emptyLoginForm[key])
    if (userConfig.account[key] === undefined) userConfig.account[key] = emptyLoginForm[key]
})
export const saveUserConfig = () => {
    fs.writeFileSync(USER_CONFIG_PATH, JSON.stringify(userConfig), 'utf-8')
}
