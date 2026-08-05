import Message from '@icalingua/types/Message'
import { MessageCursor } from '@icalingua/types/MessagePage'

export const normalizeSearchText = (value: unknown): string => String(value || '').toLowerCase()

export const escapeSearchLikePattern = (value: string): string =>
    value.replace(/[!%_]/g, (character) => `!${character}`)

export const buildSearchGrams = (value: unknown): string[] => {
    const chars = Array.from(normalizeSearchText(value))
    const grams = new Set<string>()
    for (const char of chars) grams.add(char)
    for (let i = 0; i + 1 < chars.length; i++) grams.add(chars[i] + chars[i + 1])
    return Array.from(grams)
}

export const messageMatchesKeyword = (message: Pick<Message, 'content'>, keyword: string): boolean =>
    normalizeSearchText(message.content).includes(normalizeSearchText(keyword))

export const cursorFromMessage = (message: Pick<Message, '_id' | 'time' | 'roomId'>): MessageCursor => ({
    time: Number(message.time || 0),
    id: String(message._id),
    ...(message.roomId === undefined ? {} : { roomId: Number(message.roomId) }),
})

export const compareMessageDesc = (
    left: Pick<Message, '_id' | 'time' | 'roomId'>,
    right: Pick<Message, '_id' | 'time' | 'roomId'>,
): number => {
    const timeDiff = Number(right.time || 0) - Number(left.time || 0)
    if (timeDiff) return timeDiff
    const roomDiff = Number(right.roomId || 0) - Number(left.roomId || 0)
    if (roomDiff) return roomDiff
    const leftId = String(left._id)
    const rightId = String(right._id)
    return rightId === leftId ? 0 : rightId > leftId ? 1 : -1
}

export const isBeforeCursor = (message: Pick<Message, '_id' | 'time' | 'roomId'>, cursor?: MessageCursor): boolean => {
    if (!cursor) return true
    const messageTime = Number(message.time || 0)
    if (messageTime !== cursor.time) return messageTime < cursor.time
    if (cursor.roomId !== undefined && Number(message.roomId || 0) !== cursor.roomId)
        return Number(message.roomId || 0) < cursor.roomId
    return String(message._id) < cursor.id
}
