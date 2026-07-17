import OnlineStatusType from './OnlineStatusType'

type LoginForm = {
    username: string | number
    password: string
    protocol: number
    autologin?: boolean
    onlineStatus?: OnlineStatusType
    storageType: 'mdb' | 'redis' | 'sqlite' | 'mysql' | 'pg'
    mdbConnStr: string
    rdsHost?: string
    sqlHost?: string
    sqlUsername?: string
    sqlPassword?: string
    sqlDatabase?: string
    signAPIAddress?: string
    signAPIKey?: string
    forceAlgoT544?: boolean
    useNT?: boolean
    /** 自定义 APK 信息，JSON 字符串，传给 createClient 的 apk_info 参数 */
    apkInfo?: string
}

export default LoginForm
