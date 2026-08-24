export interface IcalinguaAtMarkup {
    qq: number
    encodedName: string
    raw: string
    index: number
}

const XML_ENTITIES: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
}

const AT_MARKUP_REGEX = /<IcaAt qq=(\d+)>([^<]*)<\/IcaAt>/
const LEGACY_AT_MARKUP_PATTERN = /<IcalinguaAt qq=(\d+)>([\s\S]*?)<\/IcalinguaAt>/g

/** Encode text used inside the new <IcaAt> message marker as XML text. */
export function escapeXml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => {
        switch (character) {
            case '&':
                return '&amp;'
            case '<':
                return '&lt;'
            case '>':
                return '&gt;'
            case '"':
                return '&quot;'
            default:
                return '&apos;'
        }
    })
}

/** Decode XML named and numeric entities without recursively decoding the result. */
export function decodeXml(value: string): string {
    return value.replace(/&(?:amp|lt|gt|quot|apos|#(?:x[0-9a-f]+|[0-9]+));/gi, (entity) => {
        const normalizedEntity = entity.toLowerCase()
        const namedEntity = XML_ENTITIES[normalizedEntity]
        if (namedEntity !== undefined) return namedEntity

        const numericPart = normalizedEntity.slice(2, -1)
        const codePoint = numericPart.startsWith('x')
            ? Number.parseInt(numericPart.slice(1), 16)
            : Number.parseInt(numericPart, 10)
        if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return entity
        return String.fromCodePoint(codePoint)
    })
}

/** New messages use the XML-escaped <IcaAt> tag. */
export function encodeIcalinguaAt(qq: number | string, name: string): string {
    return `<IcaAt qq=${qq}>${escapeXml(name)}</IcaAt>`
}

/** Convert legacy URI-encoded markers to the current XML-escaped format. */
export function convertLegacyIcalinguaAt(
    content: string,
    onReplacement?: (index: number, replacedLength: number, replacementLength: number) => void,
): string {
    if (!content.includes('<IcalinguaAt qq=')) return content
    let offsetDelta = 0
    return content.replace(LEGACY_AT_MARKUP_PATTERN, (match, qq: string, encodedName: string, offset: number) => {
        const replacement = encodeIcalinguaAt(qq, decodeLegacyIcalinguaAtName(encodedName))
        onReplacement?.(offset + offsetDelta, match.length, replacement.length)
        offsetDelta += replacement.length - match.length
        return replacement
    })
}

/** Find a new XML-escaped marker. */
export function findIcalinguaAtMarkup(content: string): IcalinguaAtMarkup | null {
    const match = AT_MARKUP_REGEX.exec(content)
    if (!match) return null

    return {
        qq: Number(match[1]),
        encodedName: match[2],
        raw: match[0],
        index: match.index,
    }
}

/** Decode the XML payload of a new marker. */
export function decodeIcalinguaAtName(encodedName: string): string {
    return decodeXml(encodedName)
}

function decodeLegacyIcalinguaAtName(encodedName: string): string {
    try {
        return decodeURIComponent(encodedName)
    } catch {
        return encodedName
    }
}
