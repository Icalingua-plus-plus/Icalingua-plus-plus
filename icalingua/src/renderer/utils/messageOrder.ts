import Message from '@icalingua/types/Message'
import { MessageCursor } from '@icalingua/types/MessagePage'

export const messageIdKey = (id: Message['_id']): string => String(id)

export const compareMessageOrder = (left: Message, right: Message): number => {
    const timeDifference = Number(left.time || 0) - Number(right.time || 0)
    if (timeDifference) return timeDifference
    const leftId = String(left._id)
    const rightId = String(right._id)
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0
}

export const getMessageCursor = (message: Message): MessageCursor => ({
    time: Number(message.time || 0),
    id: message._id,
})

export const normalizeMessageList = (messages: Message[]): Message[] => {
    const unique = new Map<string, Message>()
    for (const message of messages || []) {
        const key = messageIdKey(message._id)
        if (!unique.has(key)) unique.set(key, message)
    }
    return Array.from(unique.values()).sort(compareMessageOrder)
}

export const mergeMessageLists = (current: Message[], incoming: Message[]): Message[] => {
    if (!incoming?.length) return current
    const next = normalizeMessageList(incoming)
    const merged: Message[] = []
    let currentIndex = 0
    let nextIndex = 0
    while (currentIndex < current.length && nextIndex < next.length) {
        const currentMessage = current[currentIndex]
        const nextMessage = next[nextIndex]
        const comparison = compareMessageOrder(currentMessage, nextMessage)
        if (comparison < 0) {
            merged.push(currentMessage)
            currentIndex++
        } else if (comparison > 0) {
            merged.push(nextMessage)
            nextIndex++
        } else {
            merged.push(currentMessage)
            currentIndex++
            nextIndex++
        }
    }
    if (currentIndex < current.length) merged.push(...current.slice(currentIndex))
    if (nextIndex < next.length) merged.push(...next.slice(nextIndex))
    return merged
}
