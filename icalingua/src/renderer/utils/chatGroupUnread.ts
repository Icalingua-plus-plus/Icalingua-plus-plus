import type Room from '@icalingua/types/Room'

type ChatGroupUnreadRoom = Pick<Room, 'unreadCount' | 'priority' | 'at'>

export const shouldCountChatGroupUnread = (
    room: ChatGroupUnreadRoom,
    priority: Room['priority'],
    countAtAll: boolean,
) => room.unreadCount > 0 && (room.priority >= priority || room.at === true || (room.at === 'all' && countAtAll))
