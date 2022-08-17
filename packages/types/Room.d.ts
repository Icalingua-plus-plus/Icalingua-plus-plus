import LastMessage from './LastMessage'

export default interface Room {
    roomId: number
    roomName: string
    index: number
    unreadCount: number
    priority: 1 | 2 | 3 | 4 | 5
    utime: number
    users:
        | [{ _id: 1; username: '1' }, { _id: 2; username: '2' }]
        | [{ _id: 1; username: '1' }, { _id: 2; username: '2' }, { _id: 3; username: '3' }]
    at?: boolean | 'all'
    lastMessage: LastMessage
    autoDownload?: boolean
    downloadPath?: string
}
