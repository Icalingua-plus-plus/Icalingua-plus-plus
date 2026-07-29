import type { ImageAttachment } from '@icalingua/types/SendMessageParams'

const MEDIA_PART_PREFIX = '\u0000icalingua-media:'

export const splitContentByMediaOrder = (content: string, media: ImageAttachment[]): string[] => {
    if (!content || !media?.length || !media.every((item) => Number.isInteger(item.order) && item.order >= 0)) {
        return [content]
    }

    const orderedMedia = media
        .map((item, index) => ({ index, order: Math.min(item.order, content.length) }))
        .sort((a, b) => a.order - b.order || a.index - b.index)
    const parts: string[] = []
    let cursor = 0

    for (const item of orderedMedia) {
        if (item.order > cursor) parts.push(content.slice(cursor, item.order))
        parts.push(`${MEDIA_PART_PREFIX}${item.index}`)
        cursor = item.order
    }
    if (cursor < content.length) parts.push(content.slice(cursor))

    return parts
}

export const getMediaPartIndex = (part: string): number | null => {
    if (!part.startsWith(MEDIA_PART_PREFIX)) return null
    const index = Number(part.slice(MEDIA_PART_PREFIX.length))
    return Number.isInteger(index) && index >= 0 ? index : null
}

export const shiftMediaOrdersAfterTextReplacement = (
    media: ImageAttachment[],
    start: number,
    replacedLength: number,
    replacementLength: number,
) => {
    const end = start + replacedLength
    const delta = replacementLength - replacedLength
    for (const item of media || []) {
        if (Number.isInteger(item.order) && item.order >= end) item.order += delta
    }
}
