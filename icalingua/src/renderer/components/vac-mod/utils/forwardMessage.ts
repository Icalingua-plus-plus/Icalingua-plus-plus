export function resolveForwardResource(code: string | undefined, fallback: string): string | unknown[] {
    if (code) {
        try {
            const parsed = JSON.parse(code)
            if (Array.isArray(parsed)) return parsed
        } catch {}
    }

    return fallback
}

export function parseForwardPreview(code: string | undefined): string {
    if (!code) return ''

    const jsonPreview = parseJsonPreview(code)
    if (jsonPreview !== null) return jsonPreview

    return parseXmlPreview(code)
}

function parseJsonPreview(code: string): string | null {
    try {
        const detail = JSON.parse(code)?.meta?.detail
        if (!isRecord(detail)) return null

        const lines: string[] = []
        if (isNonEmptyString(detail.source)) lines.push(detail.source)

        if (Array.isArray(detail.news)) {
            for (const item of detail.news) {
                if (isRecord(item) && isNonEmptyString(item.text)) lines.push(item.text)
            }
        }

        return lines.length ? formatPreview(lines) : null
    } catch {
        return null
    }
}

function parseXmlPreview(code: string): string {
    const parsedTitles = parseTitlesWithDom(code)
    if (parsedTitles.length) return formatPreview(parsedTitles)

    const fallbackTitles = [...code.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)]
        .map((match) => unwrapCdata(match[1]))
        .filter(isNonEmptyString)

    return fallbackTitles.length ? formatPreview(fallbackTitles) : ''
}

function parseTitlesWithDom(code: string): string[] {
    if (typeof DOMParser === 'undefined') return []

    try {
        const parser = new DOMParser()
        const document = parser.parseFromString(code, 'text/xml')
        return Array.from(document.getElementsByTagName('title'))
            .map((title) => title.textContent)
            .filter(isNonEmptyString)
    } catch {
        return []
    }
}

function unwrapCdata(value: string): string {
    const match = value.match(/^<!\[CDATA\[([\s\S]*)]]>$/)
    return match ? match[1] : value
}

function formatPreview(lines: string[]): string {
    return `${lines.join('\n')}\n`
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0
}
