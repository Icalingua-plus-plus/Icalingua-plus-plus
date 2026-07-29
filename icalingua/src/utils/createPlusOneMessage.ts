import Message from '@icalingua/types/Message'
import SendMessageParams from '@icalingua/types/SendMessageParams'

const getCardMessageType = (code: string): 'json' | 'xml' => {
    try {
        if (typeof JSON.parse(code) === 'object') return 'json'
    } catch (e) {}
    return 'xml'
}

export default (message: Message, overrides: Partial<SendMessageParams> = {}): SendMessageParams => {
    const useCardMode = Boolean(message.code) && overrides.messageType === undefined
    const result: SendMessageParams = {
        content: useCardMode ? message.code : message.content,
        replyMessage: message.replyMessage,
        at: [],
        ...(useCardMode ? { messageType: getCardMessageType(message.code) } : {}),
        ...overrides,
    }
    const images = message.files?.length
        ? message.files.filter((file) => file.type?.startsWith('image/'))
        : message.file?.type?.startsWith('image/')
          ? [message.file]
          : []

    if (!useCardMode && images.length) {
        result.media = images.map(({ url, order }) => ({ url, order }))
    }

    return result
}
