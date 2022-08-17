import Room from '@icalingua/types/Room'

export default (roomId: number, roomName: string): Room => {
    const room = {
        roomId,
        roomName,
        index: 0,
        unreadCount: 0,
        priority: roomId > 0 ? 4 : 2,
        utime: new Date().getTime(),
        users: [
            { _id: 1, username: '1' },
            { _id: 2, username: '2' },
        ],
        lastMessage: { content: '', timestamp: '' },
    }
    if (roomId < 0) room.users.push({ _id: 3, username: '3' })
    return <Room>room
}
