import type Adapter from '@icalingua/types/Adapter'
import type Message from '@icalingua/types/Message'
import formatDate from '../../utils/formatDate'

export type ForwardResId = string | Message[]

export interface ForwardMessagesResult {
    messages: Message[]
    resId: ForwardResId
}

function getForwardErrorContent(error: unknown): string {
    if (error instanceof Error) return error.message || '获取转发消息失败'
    if (typeof error === 'string') return error || '获取转发消息失败'
    if (error && typeof error === 'object' && 'message' in error) return String(error.message)
    return '获取转发消息失败'
}

function createForwardErrorMessage(error: unknown): Message {
    const now = new Date()
    return {
        senderId: 0,
        username: '错误',
        content: getForwardErrorContent(error),
        timestamp: formatDate('hh:mm:ss', now),
        date: formatDate('yyyy/MM/dd', now),
        _id: 0,
        time: 0,
        files: [],
    }
}

function isForwardErrorMessage(messages: Message[]): boolean {
    return messages.length === 1 && messages[0].senderId === 0 && messages[0]._id === 0
}

function shouldUseForwardMessages(messages: Message[], fileName?: string, fallbackResId?: string): boolean {
    return !fileName || fallbackResId == null || (messages.length > 0 && !isForwardErrorMessage(messages))
}

export async function loadForwardMessages(
    adapter: Pick<Adapter, 'getForwardMsg'>,
    resId: ForwardResId,
    fileName?: string,
    fallbackResId?: string,
): Promise<ForwardMessagesResult> {
    if (Array.isArray(resId)) return { messages: resId, resId }

    let loadedMessages: Message[] | undefined
    try {
        loadedMessages = await adapter.getForwardMsg(resId, fileName)
        if (shouldUseForwardMessages(loadedMessages, fileName, fallbackResId)) {
            return { messages: loadedMessages, resId }
        }
    } catch (error) {
        if (!fileName || fallbackResId == null) {
            return { messages: [createForwardErrorMessage(error)], resId }
        }
    }

    if (fallbackResId == null) {
        return { messages: loadedMessages ?? [createForwardErrorMessage(undefined)], resId }
    }

    try {
        const fallbackMessages = await adapter.getForwardMsg(fallbackResId)
        return { messages: fallbackMessages, resId: fallbackResId }
    } catch (error) {
        return { messages: [createForwardErrorMessage(error)], resId: fallbackResId }
    }
}
