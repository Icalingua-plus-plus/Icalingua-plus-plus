import Message from '@icalingua/types/Message'

export const normalizeSearchText = (value: unknown): string => String(value || '').toLowerCase()

export const escapeSearchLikePattern = (value: string): string =>
    value.replace(/[!%_]/g, (character) => `!${character}`)

export const messageMatchesKeyword = (message: Pick<Message, 'content'>, keyword: string): boolean =>
    normalizeSearchText(message.content).includes(normalizeSearchText(keyword))

export const compareSearchIdsAsStrings = (left: Message['_id'], right: Message['_id']): number =>
    Buffer.compare(Buffer.from(String(left)), Buffer.from(String(right)))

type SearchPosition = Pick<Message, 'time' | '_id' | 'roomId'>

export const compareSearchPositions = (
    left: SearchPosition,
    right: SearchPosition,
    compareIds = compareSearchIdsAsStrings,
): number =>
    Number(left.time || 0) - Number(right.time || 0) ||
    compareIds(left._id, right._id) ||
    Number(left.roomId || 0) - Number(right.roomId || 0)
