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
    const files = message.files?.length ? message.files : message.file ? [message.file] : []
    const audio = files.find((file) => file.type?.startsWith('audio/'))
    const images = files.filter((file) => file.type?.startsWith('image/'))

    if (!useCardMode && audio) {
        result.media = [
            {
                url: audio.url,
                type: audio.type,
                fid: audio.fid,
            },
        ]
    } else if (!useCardMode && images.length) {
        result.media = images.map(({ url, order }) => ({ url, order }))
    }

    return result
}
