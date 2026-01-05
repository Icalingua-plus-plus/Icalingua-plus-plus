/**
 * Milky 消息 ID 编解码工具
 *
 * 群消息 ID 格式 (21 字节):
 * | 群号(4) | 发送者QQ(4) | 消息编号(4) | 随机数(4) | 时间戳(4) | 分片数(1) |
 *
 * 私聊消息 ID 格式 (17 字节):
 * | 对方QQ(4) | 消息编号(4) | 随机数(4) | 时间戳(4) | 发送flag(1) |
 */

export function encodeGroupMessageId(groupId: number, senderId: number, messageSeq: number, time: number): string {
    const buffer = Buffer.alloc(21)
    buffer.writeUInt32BE(groupId >>> 0, 0)
    buffer.writeUInt32BE(senderId >>> 0, 4)
    buffer.writeUInt32BE(messageSeq >>> 0, 8)
    buffer.writeUInt32BE(0, 12) // random，milky 没有这个字段，固定为 0
    buffer.writeUInt32BE(time >>> 0, 16)
    buffer.writeUInt8(1, 20) // pktnum，固定为 1
    return buffer.toString('base64')
}

export function encodePrivateMessageId(peerId: number, messageSeq: number, time: number, isSelf: boolean): string {
    const buffer = Buffer.alloc(17)
    buffer.writeUInt32BE(peerId >>> 0, 0)
    buffer.writeUInt32BE(messageSeq >>> 0, 4)
    buffer.writeUInt32BE(0, 8) // random，milky 没有这个字段，固定为 0
    buffer.writeUInt32BE(time >>> 0, 12)
    buffer.writeUInt8(isSelf ? 1 : 0, 16)
    return buffer.toString('base64')
}

export interface DecodedGroupMessageId {
    type: 'group'
    groupId: number
    senderId: number
    messageSeq: number
    random: number
    time: number
    pktnum: number
}

export interface DecodedPrivateMessageId {
    type: 'private'
    peerId: number
    messageSeq: number
    random: number
    time: number
    isSelf: boolean
}

export type DecodedMessageId = DecodedGroupMessageId | DecodedPrivateMessageId

export function decodeMessageId(messageId: string): DecodedMessageId | null {
    try {
        const buffer = Buffer.from(messageId, 'base64')
        if (buffer.length === 21) {
            // 群消息
            return {
                type: 'group',
                groupId: buffer.readUInt32BE(0),
                senderId: buffer.readUInt32BE(4),
                messageSeq: buffer.readUInt32BE(8),
                random: buffer.readUInt32BE(12),
                time: buffer.readUInt32BE(16),
                pktnum: buffer.readUInt8(20),
            }
        } else if (buffer.length === 17) {
            // 私聊消息
            return {
                type: 'private',
                peerId: buffer.readUInt32BE(0),
                messageSeq: buffer.readUInt32BE(4),
                random: buffer.readUInt32BE(8),
                time: buffer.readUInt32BE(12),
                isSelf: buffer.readUInt8(16) === 1,
            }
        }
        return null
    } catch {
        return null
    }
}
