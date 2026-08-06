import Message from '@icalingua/types/Message'

export const normalizeSearchText = (value: unknown): string => String(value || '').toLowerCase()

export const escapeSearchLikePattern = (value: string): string =>
    value.replace(/[!%_]/g, (character) => `!${character}`)

export const messageMatchesKeyword = (message: Pick<Message, 'content'>, keyword: string): boolean =>
    normalizeSearchText(message.content).includes(normalizeSearchText(keyword))
