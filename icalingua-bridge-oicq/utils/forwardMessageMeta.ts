const DEFAULT_FORWARD_PROMPT = '[聊天记录]'

export type MilkyForwardSegmentData = {
    readonly forward_id: string
    readonly title?: string | null
    readonly preview?: readonly string[] | null
    readonly summary?: string | null
    readonly prompt?: string | null
}

type ForwardNewsItem = {
    readonly text: string
}

type ForwardDetail = {
    readonly resid: string
    readonly source?: string
    readonly news?: readonly ForwardNewsItem[]
    readonly summary?: string
}

type ForwardPayload = {
    readonly app: 'com.tencent.multimsg'
    readonly desc: string
    readonly meta: {
        readonly detail: ForwardDetail
    }
    readonly prompt: string
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const nonEmptyString = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined
    const trimmed = value.trim()
    return trimmed ? trimmed : undefined
}

const getForwardDetail = (payload: unknown): Record<string, unknown> | undefined => {
    if (!isRecord(payload)) return undefined
    const meta = payload['meta']
    if (!isRecord(meta)) return undefined
    const detail = meta['detail']
    return isRecord(detail) ? detail : undefined
}

export const buildMilkyForwardJson = (data: MilkyForwardSegmentData): string => {
    const prompt = nonEmptyString(data.prompt) ?? DEFAULT_FORWARD_PROMPT
    const detail: {
        resid: string
        source?: string
        news?: ForwardNewsItem[]
        summary?: string
    } = {
        resid: data.forward_id,
    }
    const title = nonEmptyString(data.title)
    const summary = nonEmptyString(data.summary)
    const preview = data.preview?.map(nonEmptyString).filter((text): text is string => text !== undefined) ?? []

    if (title) detail.source = title
    if (preview.length) detail.news = preview.map((text) => ({ text }))
    if (summary) detail.summary = summary

    const payload: ForwardPayload = {
        app: 'com.tencent.multimsg',
        desc: prompt,
        meta: { detail },
        prompt,
    }
    return JSON.stringify(payload)
}

export const getForwardMessagePrompt = (payload: unknown): string | undefined => {
    if (!isRecord(payload)) return undefined
    return nonEmptyString(payload['prompt']) ?? nonEmptyString(payload['desc'])
}

export const formatForwardMessageBodyPrefix = (payload: unknown): string => {
    const detail = getForwardDetail(payload)
    if (!detail) return ''

    const lines: string[] = []
    const title = nonEmptyString(detail['source']) ?? nonEmptyString(detail['title'])
    const news = detail['news']

    if (title) lines.push(title)
    if (Array.isArray(news)) {
        for (const item of news) {
            const text = isRecord(item) ? nonEmptyString(item['text']) : nonEmptyString(item)
            if (text) lines.push(text)
        }
    }

    return lines.length ? `${lines.join('\n')}\n` : ''
}
