type LoginForm = {
    username: string
    password: string
    protocol: 1 | 2 | 3 | 4 | 5
    autologin: boolean
    onlineStatus: number
    storageType: 'mdb' | 'redis' | 'idb',
    mdbConnStr: string,
    rdsHost: string
}

export default LoginForm
