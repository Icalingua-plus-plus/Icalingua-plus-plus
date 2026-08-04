export interface ForwardCardPreview {
    title: string
    messages: string[]
    footer: string
}

const DEFAULT_FORWARD_FOOTER = '聊天记录'

export function resolveForwardResource(code: string | undefined, fallback: string): string | unknown[] {
    if (code) {
        try {
            const parsed = JSON.parse(code)
            if (Array.isArray(parsed)) return parsed
        } catch {}
    }

    return fallback
}

export function parseForwardCard(code: string | undefined): ForwardCardPreview {
    if (!code) return emptyForwardCard()

    return parseJsonCard(code) || parseXmlCard(code) || emptyForwardCard()
}

export function parseForwardPreview(code: string | undefined): string {
    return formatForwardPreview(parseForwardCard(code))
}

export function stripForwardPreview(content: string, card: ForwardCardPreview): string {
    const preview = formatForwardPreview(card)
    if (!preview || !content.startsWith(preview)) return content

    const remainder = content.slice(preview.length).trimStart()
    return /^\[(?:Forward|NestedForward): [^\r\n]+\]/.test(remainder) ? content.slice(preview.length) : content
}

function parseJsonCard(code: string): ForwardCardPreview | null {
    try {
        const payload = JSON.parse(code)
        if (!isRecord(payload) || !isRecord(payload.meta) || !isRecord(payload.meta.detail)) return null

        const detail = payload.meta.detail
        const title = firstNonEmptyString(detail.source, detail.title) || ''
        const messages: string[] = []

        const news = Array.isArray(detail.news) ? detail.news : []
        messages.push(...news.map((item) => (isRecord(item) ? item.text : item)).filter(isNonEmptyString))

        const footer = formatForwardLabel(firstNonEmptyString(detail.summary, payload.prompt, payload.desc))
        return createForwardCard(title, messages, footer)
    } catch {
        return null
    }
}

function parseXmlCard(code: string): ForwardCardPreview | null {
    if (typeof DOMParser !== 'undefined') {
        try {
            const parser = new DOMParser()
            const document = parser.parseFromString(code, 'text/xml')
            const titles = Array.from(document.getElementsByTagName('title'))
                .map((element) => element.textContent)
                .filter(isNonEmptyString)
            if (titles.length) {
                const summary = Array.from(document.getElementsByTagName('summary'))
                    .map((element) => element.textContent)
                    .find(isNonEmptyString)
                const brief = document.documentElement?.getAttribute('brief')
                return createForwardCard(
                    titles[0],
                    titles.slice(1),
                    formatForwardLabel(firstNonEmptyString(summary, brief)),
                )
            }
        } catch {}
    }

    const titles = [...code.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)]
        .map((match) => unwrapCdata(match[1]))
        .filter(isNonEmptyString)
    if (!titles.length) return null

    const summaryMatch = code.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i)
    const summary = summaryMatch ? unwrapCdata(summaryMatch[1]) : undefined
    const briefMatch = code.match(/\bbrief\s*=\s*(['"])([\s\S]*?)\1/i)
    return createForwardCard(
        titles[0],
        titles.slice(1),
        formatForwardLabel(firstNonEmptyString(summary, briefMatch?.[2])),
    )
}

function emptyForwardCard(): ForwardCardPreview {
    return createForwardCard()
}

function createForwardCard(title = '', messages: string[] = [], footer = ''): ForwardCardPreview {
    return { title, messages, footer: footer || DEFAULT_FORWARD_FOOTER }
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
    return values.find(isNonEmptyString)
}

function formatForwardLabel(value: string | undefined): string {
    if (!value) return ''

    const trimmed = value.trim()
    const bracketed = trimmed.match(/^\[([\s\S]+)]$/)
    return bracketed ? bracketed[1] : trimmed
}

function formatForwardPreview(card: ForwardCardPreview): string {
    const lines = [card.title, ...card.messages].filter(isNonEmptyString)
    return lines.length ? `${lines.join('\n')}\n` : ''
}

function unwrapCdata(value: string): string {
    const match = value.match(/^<!\[CDATA\[([\s\S]*)]]>$/)
    return match ? match[1] : value
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0
}
