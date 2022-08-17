import OnlineStatusType from './OnlineStatusType'

type LoginForm = {
    username: string | number
    password: string
    protocol: 1 | 2 | 3 | 4 | 5
    autologin?: boolean
    onlineStatus?: OnlineStatusType
    storageType: 'mdb' | 'redis' | 'sqlite' | 'mysql' | 'pg'
    mdbConnStr: string
    rdsHost?: string
    sqlHost?: string
    sqlUsername?: string
    sqlPassword?: string
    sqlDatabase?: string
}

export default LoginForm
