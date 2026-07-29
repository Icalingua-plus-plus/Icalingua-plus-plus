interface MessageFile {
    type?: string
    order?: number
    [key: string]: any
}

interface MessageLike {
    content?: string
    file?: MessageFile
    files?: MessageFile[]
}

export type MessageMediaPart =
    | { type: 'text'; content: string; key: string }
    | { type: 'image'; file: MessageFile; fileIndex: number; key: string }

const isImage = (file: MessageFile) => typeof file?.type === 'string' && file.type.startsWith('image/')

export const getMessageFiles = (message: MessageLike): MessageFile[] => {
    if (Array.isArray(message?.files) && message.files.length) return message.files
    return message?.file ? [message.file] : []
}

export const getOrderedMessageParts = (message: MessageLike): MessageMediaPart[] | null => {
    const content = String(message?.content ?? '')
    const files = getMessageFiles(message)
    const images = files.map((file, fileIndex) => ({ file, fileIndex })).filter(({ file }) => isImage(file))

    if (
        !images.length ||
        images.length !== files.length ||
        !images.every(({ file }) => Number.isInteger(file.order) && file.order >= 0)
    ) {
        return null
    }

    const orderedImages = images
        .map((item, imageIndex) => ({
            ...item,
            imageIndex,
            order: Math.min(item.file.order, content.length),
        }))
        .sort((a, b) => a.order - b.order || a.imageIndex - b.imageIndex)
    const parts: MessageMediaPart[] = []
    let cursor = 0

    for (const image of orderedImages) {
        if (image.order > cursor) {
            parts.push({
                type: 'text',
                content: content.slice(cursor, image.order),
                key: `text-${parts.length}`,
            })
        }
        parts.push({
            type: 'image',
            file: image.file,
            fileIndex: image.fileIndex,
            key: `image-${image.fileIndex}`,
        })
        cursor = image.order
    }
    if (cursor < content.length) {
        parts.push({ type: 'text', content: content.slice(cursor), key: `text-${parts.length}` })
    }

    return parts
}
