import pangu from 'pangu'
import AtCacheItem from '@icalingua/types/AtCacheElem'

type SpacingPart = { ignore: boolean; text: string }

export function spacingSendMessage(text: string, atCache: AtCacheItem[] = []) {
    if (/^\[QLottie: \d+,\d+]$/.test(text)) {
        return text
    }
    let parts: SpacingPart[] = [{ ignore: false, text: text }]
    for (const { text } of atCache) {
        const newParts: SpacingPart[] = []
        for (const part of parts) {
            if (part.ignore) {
                newParts.push(part)
                continue
            }
            let index: number
            while ((index = part.text.indexOf(text)) != -1) {
                const before = part.text.slice(0, index)
                before && newParts.push({ ignore: false, text: before })
                newParts.push({ ignore: true, text })
                part.text = part.text.slice(index + text.length)
            }
            part.text && newParts.push(part)
        }
        parts = newParts
    }
    const FACE_REGEX = /\[Face: \d+]/
    const newParts: SpacingPart[] = []
    for (const part of parts) {
        if (part.ignore) {
            newParts.push(part)
            continue
        }
        let match: RegExpExecArray
        while ((match = FACE_REGEX.exec(part.text))) {
            const index = match.index
            const text = match[0]
            const before = part.text.slice(0, index)
            before && newParts.push({ ignore: false, text: before })
            newParts.push({ ignore: true, text })
            part.text = part.text.slice(index + text.length)
        }
        part.text && newParts.push(part)
    }
    parts = newParts
    return parts.map((part) => (part.ignore ? part.text : pangu.spacing(part.text))).join('')
}

export function spacingNotification(desc: string): string {
    const FACE_REGEX = /\[\/[^\]]+\]/
    const parts: SpacingPart[] = []
    let match: RegExpExecArray
    while ((match = FACE_REGEX.exec(desc))) {
        const before = desc.slice(0, match.index)
        before && parts.push({ ignore: false, text: before })
        parts.push({ ignore: true, text: match[0] })
        desc = desc.slice(match.index + match[0].length)
    }
    desc && parts.push({ ignore: false, text: desc })
    return parts.map((part) => (part.ignore ? part.text : pangu.spacing(part.text))).join('')
}

export function spacingLinkifiedMessage(message: any[]) {
    message.forEach((m) => {
        if (!m.url && !m.face && !m.forward && !m.nestedforward && !m.tag && !m.inline && !m.multiline && !m.image) {
            m.value = pangu.spacing(m.value)
        }
    })
}
