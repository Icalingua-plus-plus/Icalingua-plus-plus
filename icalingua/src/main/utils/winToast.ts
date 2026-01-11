import { create } from 'xmlbuilder2'
import { Notification as ElectronNotification } from 'electron'

export interface WinToastOptions {
    title: string
    body: string
    icon?: string // 头像路径，会显示为圆形
    image?: string // 消息中的图片，会显示为大图
    roomId: number
    hasReply?: boolean
    replyPlaceholder?: string
}

/**
 * 构建 Windows Toast XML
 */
function buildToastXml(options: WinToastOptions): string {
    const { title, body, icon, image, roomId, hasReply, replyPlaceholder } = options

    const root = create({ version: '1.0', encoding: 'UTF-8' })
        .ele('toast', {
            launch: `icalingua:action=open&roomId=${roomId}`,
            activationType: 'protocol',
        })
        .ele('visual')
        .ele('binding', { template: 'ToastGeneric' })

    // 圆形头像
    if (icon) {
        root.ele('image', {
            placement: 'appLogoOverride',
            'hint-crop': 'circle',
            src: icon,
        })
    }

    // 标题和正文
    root.ele('text').txt(title)
    root.ele('text').txt(body)

    // 消息图片（大图）
    if (image) {
        root.ele('image', { src: image })
    }

    // 回到 toast 根节点
    const toast = root.up().up()

    // 添加 actions
    const actions = toast.ele('actions')

    // 内联回复输入框
    if (hasReply) {
        actions.ele('input', {
            id: 'replyText',
            type: 'text',
            placeHolderContent: replyPlaceholder || '输入回复...',
        })
        actions.ele('action', {
            content: '发送',
            arguments: `icalingua:action=reply&roomId=${roomId}`,
            activationType: 'protocol',
            'hint-inputId': 'replyText',
        })
    }

    // 标为已读按钮
    actions.ele('action', {
        content: '标为已读',
        arguments: `icalingua:action=read&roomId=${roomId}`,
        activationType: 'protocol',
    })

    return toast.doc().end()
}

/**
 * 显示 Windows Toast 通知
 */
export function showWinToast(options: WinToastOptions): ElectronNotification | null {
    if (!ElectronNotification.isSupported()) return null

    const toastXml = buildToastXml(options)
    const notif = new ElectronNotification({ toastXml })
    notif.show()
    return notif
}
