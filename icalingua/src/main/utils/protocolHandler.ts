import { tryToShowAllWindows } from './windowManager'
import ui from './ui'
import { clearRoomUnread, sendMessage } from '../ipc/botAndStorage'

/**
 * 解析并处理 icalingua:// 协议 URL
 * 格式: icalingua:action=xxx&roomId=xxx&replyText=xxx
 */
export function handleProtocolUrl(url: string): void {
    if (!url || !url.startsWith('icalingua:')) return

    try {
        // 移除 icalingua: 前缀
        const paramsStr = url.replace('icalingua:', '')
        const params = new URLSearchParams(paramsStr)

        const action = params.get('action')
        const roomId = params.get('roomId')

        if (!action || !roomId) return

        const roomIdNum = Number(roomId)
        if (isNaN(roomIdNum)) return

        switch (action) {
            case 'open':
                // 打开聊天窗口并跳转到对应房间
                tryToShowAllWindows()
                ui.chroom(roomIdNum)
                break

            case 'read':
                // 标记为已读
                clearRoomUnread(roomIdNum)
                break

            case 'reply':
                // 回复消息
                const replyText = params.get('replyText')
                if (replyText) {
                    clearRoomUnread(roomIdNum)
                    sendMessage({
                        content: replyText,
                        roomId: roomIdNum,
                        at: [],
                    })
                }
                break
        }
    } catch (e) {
        console.error('Failed to handle protocol URL:', url, e)
    }
}

/**
 * 从命令行参数中提取协议 URL
 */
export function extractProtocolUrl(argv: string[]): string | undefined {
    return argv.find((arg) => arg.startsWith('icalingua:'))
}
