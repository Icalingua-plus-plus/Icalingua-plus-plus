import OnlineStatusType from './OnlineStatusType'

type LoginForm = {
    username: number
    password: string
    protocol: 1 | 2 | 3 | 4 | 5
    autologin?: boolean
    onlineStatus?: OnlineStatusType
    storageType: 'mdb' | 'redis' | 'idb',
    mdbConnStr: string,
    rdsHost?: string
}

export default LoginForm
