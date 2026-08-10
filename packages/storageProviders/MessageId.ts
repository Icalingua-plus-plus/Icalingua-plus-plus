interface GroupMessageIdParts {
    type: 'group'
    groupId: number
    senderId: number
    messageSeq: number
    random: number
    time: number
    packetCount: number
}

interface PrivateMessageIdParts {
    type: 'private'
    peerId: number
    messageSeq: number
    random: number
    time: number
    self: number
}

type MessageIdParts = GroupMessageIdParts | PrivateMessageIdParts

const decodeMessageId = (messageId: unknown): MessageIdParts | null => {
    if (typeof messageId !== 'string') return null
    try {
        const buffer = Buffer.from(messageId, 'base64')
        if (buffer.length === 21) {
            return {
                type: 'group',
                groupId: buffer.readUInt32BE(0),
                senderId: buffer.readUInt32BE(4),
                messageSeq: buffer.readUInt32BE(8),
                random: buffer.readUInt32BE(12),
                time: buffer.readUInt32BE(16),
                packetCount: buffer.readUInt8(20),
            }
        }
        if (buffer.length === 17) {
            return {
                type: 'private',
                peerId: buffer.readUInt32BE(0),
                messageSeq: buffer.readUInt32BE(4),
                random: buffer.readUInt32BE(8),
                time: buffer.readUInt32BE(12),
                self: buffer.readUInt8(16),
            }
        }
    } catch {}
    return null
}

/**
 * QQ/OICQ and Milky can encode the same message with different random fields
 * (and Milky may leave sender/time as zero). Keep the comparison identical to
 * the renderer's reply target matching, so storage fallback and UI selection
 * resolve the same message.
 */
export const messageIdsEquivalent = (left: unknown, right: unknown): boolean => {
    if (left === right) return true
    if (left === undefined || left === null || right === undefined || right === null) return false
    if (String(left) === String(right)) return true

    const candidate = decodeMessageId(left)
    const target = decodeMessageId(right)
    if (!candidate || !target || candidate.type !== target.type) return false

    if (candidate.type === 'group' && target.type === 'group') {
        return (
            candidate.groupId === target.groupId &&
            (target.senderId === 0 || candidate.senderId === target.senderId) &&
            candidate.messageSeq === target.messageSeq &&
            // (target.time === 0 || candidate.time === target.time) && // 不需要匹配时间了（实际上群聊消息只需要匹配seq就行）
            candidate.packetCount === target.packetCount
        )
    }

    if (candidate.type === 'private' && target.type === 'private') {
        return (
            candidate.peerId === target.peerId &&
            candidate.messageSeq === target.messageSeq &&
            // (target.time === 0 || candidate.time === target.time) && // 不需要匹配时间了（因为已经过滤了4s范围的，而私聊有可能会出现时间差）
            candidate.self === target.self
        )
    }
    return false
}

export const messageIdTime = (messageId: unknown): number | null => {
    const parsed = decodeMessageId(messageId)
    if (!parsed || parsed.time === 0) return null
    return parsed.time
}
