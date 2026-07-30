/**
 * 从回复消息的 base64 _id 中解析出发送者 QQ 号
 * 格式参考 processMessage.ts 的 reply 分支解析逻辑：
 *   群消息 (>24 chars): user_id 在 bytes 4-7 (大端)
 *   C2C 消息 (<=24 chars): user_id 在 bytes 0-3 (大端)
 */
export function parseReplySenderId(replyMessage: { _id?: string; senderId?: number }): string {
    try {
        const raw = atob(replyMessage._id || '')
        if (!raw) return String(replyMessage.senderId || '未知用户')
        const start = replyMessage._id!.length > 24 ? 4 : 0
        const id = [...raw.slice(start, start + 4)].reduce((n, c) => (n << 8) + c.charCodeAt(0), 0)
        return (id >>> 0).toString()
    } catch {
        return String(replyMessage.senderId || '未知用户')
    }
}
