import type Message from '@icalingua/types/Message'
import type StorageProvider from '@icalingua/types/StorageProvider'

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

export function readGroupReactions(data: object): Pick<Message, 'emoji_reactions'> {
    const group = data as { group_id?: number; emoji_reactions?: Message['emoji_reactions'] }
    if (!group?.group_id || !Array.isArray(group.emoji_reactions)) return {}
    return {
        emoji_reactions: group.emoji_reactions.filter(({ type, count }) => count > 0 && (type === 1 || type === 2)),
    }
}

export function enqueueGroupMessageUpdate(
    storage: StorageProvider,
    groupId: number,
    seq: number,
    update: () => Promise<void>,
): Promise<void> {
    let updates = pendingUpdates.get(storage)
    if (!updates) {
        updates = new Map()
        pendingUpdates.set(storage, updates)
    }

    const key = `${groupId}:${seq}`
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

    return enqueueGroupMessageUpdate(storage, event.group_id, event.seq, async () => {
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
        const message = await storage.getMessage(roomId, messageId)
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
