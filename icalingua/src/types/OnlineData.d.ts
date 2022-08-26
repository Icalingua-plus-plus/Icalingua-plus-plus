type OnlineData = {
    online: boolean
    nick: string
    uin: number
    priority?: 1 | 2 | 3 | 4 | 5
    sysInfo?: string
    updateCheck?: 'ask' | boolean
}
export default OnlineData
