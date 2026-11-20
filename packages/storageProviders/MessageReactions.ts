import type Message from '@icalingua/types/Message'
import type { MessageReactionRequest } from '@icalingua/types/Message'
import type StorageProvider from '@icalingua/types/StorageProvider'
import type { Client } from 'oicq-icalingua-plus-plus'
import { decodeMessageId } from './MessageId'

export async function sendGroupReaction(bot: Pick<Client, 'setEmojiReaction'>, request: MessageReactionRequest) {
    const { roomId, messageId, id, type, set } = request
    const message = decodeMessageId(messageId)
    if (message?.type !== 'group' || message.groupId !== -roomId || !message.messageSeq)
        throw new Error('无法定位群消息')
    if (typeof id !== 'string' || !id || (type !== 1 && type !== 2) || typeof set !== 'boolean')
        throw new Error('无效的表情回应')

    const result = await bot.setEmojiReaction(message.groupId, message.messageSeq, id, type, set)
    if (result.error) throw new Error(result.error.message || '表情回应发送失败')
}

interface GroupReactionNotice {
    group_id: number
    seq: number
    message_id?: string
    user_id: number
    id: string
    type: number
    count?: number
    set: boolean
}

const pendingUpdates = new WeakMap<StorageProvider, Map<string, Promise<void>>>()
const messageSaveWaiters = new WeakMap<StorageProvider, Map<string, () => void>>()
const reactionMessageWaitMs = 30000

export function readGroupReactions(data: object): Pick<Message, 'emoji_reactions'> {
    const group = data as { group_id?: number; emoji_reactions?: Message['emoji_reactions'] }
    if (!group?.group_id || !Array.isArray(group.emoji_reactions)) return {}
    return {
        emoji_reactions: group.emoji_reactions.filter(({ type, count }) => count > 0 && (type === 1 || type === 2)),
    }
}

export function notifyGroupMessageSave(
    storage: StorageProvider,
    groupId: number,
    seq: number,
    write: Promise<unknown>,
) {
    return write.finally(() => messageSaveWaiters.get(storage)?.get(`${groupId}:${seq}`)?.())
}

async function getReactionMessage(
    storage: StorageProvider,
    roomId: number,
    key: string,
    messageId: string,
    deadline: number,
) {
    let waiters = messageSaveWaiters.get(storage)
    if (!waiters) {
        waiters = new Map()
        messageSaveWaiters.set(storage, waiters)
    }
    let wake: () => void
    const saved = new Promise<void>((resolve) => {
        wake = resolve
    })
    // Register before reading so a save that finishes during the lookup still wakes this reaction.
    waiters.set(key, wake)
    let timer: NodeJS.Timeout
    try {
        const message = await storage.getMessage(roomId, messageId)
        const remaining = deadline - Date.now()
        if (message || remaining <= 0) return message

        timer = setTimeout(wake, remaining).unref()
        await saved
        return await storage.getMessage(roomId, messageId)
    } finally {
        clearTimeout(timer)
        waiters.delete(key)
    }
}

function enqueueReactionUpdate(storage: StorageProvider, key: string, update: () => Promise<void>): Promise<void> {
    let updates = pendingUpdates.get(storage)
    if (!updates) {
        updates = new Map()
        pendingUpdates.set(storage, updates)
    }

    const previous = updates.get(key) ?? Promise.resolve()
    const next = previous
        .catch(() => {})
        .then(update)
        .finally(() => {
            if (updates.get(key) === next) updates.delete(key)
        })
    updates.set(key, next)
    return next
}

export function applyGroupReaction(
    storage: StorageProvider,
    selfId: number,
    event: GroupReactionNotice,
    publish: (roomId: number, messageId: string, patch: Partial<Message>) => void,
    fetchMessage: (messageId: string) => Promise<{ data?: { group_id?: number; seqid?: number; message_id: string } }>,
): Promise<void> {
    if (event.type !== 1 && event.type !== 2) return Promise.resolve()

    const key = `${event.group_id}:${event.seq}`
    const deadline = Date.now() + reactionMessageWaitMs
    return enqueueReactionUpdate(storage, key, async () => {
        const roomId = -event.group_id
        let messageId = event.message_id
        if (!messageId) {
            // Older oicq events provide only the sequence. getMsg reads the group and sequence from the ID.
            const probe = Buffer.alloc(21)
            probe.writeUInt32BE(event.group_id, 0)
            probe.writeUInt32BE(event.seq, 8)
            probe[20] = 1
            const { data } = await fetchMessage(probe.toString('base64'))
            if (data?.group_id !== event.group_id || data.seqid !== event.seq) return
            messageId = data.message_id
        }
        const message = await getReactionMessage(storage, roomId, key, messageId, deadline)
        if (!message || message.deleted) return

        const reactions = [...(message.emoji_reactions ?? [])]
        const index = reactions.findIndex((reaction) => reaction.type === event.type && reaction.id === event.id)
        const current = reactions[index]
        const bySelf = event.user_id === selfId
        const is_clicked = bySelf ? event.set : (current?.is_clicked ?? false)
        const delta = bySelf && !!current?.is_clicked === event.set ? 0 : event.set ? 1 : -1
        const count = Number.isSafeInteger(event.count) ? Number(event.count) : (current?.count ?? 0) + delta
        if (count <= 0) {
            if (index < 0) return
            reactions.splice(index, 1)
        } else {
            if (current?.count === count && current.is_clicked === is_clicked) return
            reactions[index < 0 ? reactions.length : index] = { id: event.id, type: event.type, count, is_clicked }
        }

        const patch = { emoji_reactions: reactions }
        await storage.updateMessage(roomId, message._id, patch)
        publish(roomId, String(message._id), patch)
    })
}
