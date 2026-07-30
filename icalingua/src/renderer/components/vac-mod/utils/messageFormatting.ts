import * as linkify from 'linkifyjs'
import pangu from 'pangu'

linkify.registerCustomProtocol('mqqapi')
linkify.registerCustomProtocol('qqapi')
linkify.registerCustomProtocol('icalingua')

export type MessagePartType = 'url' | 'face' | 'forward' | 'nestedforward' | 'breakLine' | 'at'

export interface MessagePart {
    value: string
    type?: MessagePartType
    href?: string
    title?: string
}

export interface MessageUser {
    _id: string | number
    username: string
}

export interface MessageFormattingOptions {
    linkify?: boolean
    disableQLottie?: boolean
    usePanguJs?: boolean
}

type PseudoMarkdownType = Exclude<MessagePartType, 'url'>

interface PseudoMarkdownRule {
    type: PseudoMarkdownType
    start: string
    end?: string
    allowedContent?: RegExp
}

interface TokenMatch {
    index: number
    endIndex: number
    part: MessagePart
}

interface UserTagIndex {
    usersById: Map<string, MessageUser>
    idLengths: number[]
}

/**
 * 适配器嵌入消息正文的协议标记。
 * 新增格式时只需在这里声明起止符和内容约束，扫描器不需要增加分支。
 */
const PSEUDO_MARKDOWN_RULES: readonly PseudoMarkdownRule[] = [
    {
        type: 'face',
        start: '[Face: ',
        end: ']',
        allowedContent: /^\d+$/,
    },
    {
        type: 'forward',
        start: '[Forward: ',
        end: ']',
        allowedContent: /^[^\r\n]+$/,
    },
    {
        type: 'nestedforward',
        start: '[NestedForward: ',
        end: ']',
        allowedContent: /^[^\r\n]+$/,
    },
    {
        type: 'at',
        start: '<IcalinguaAt qq=',
        end: '</IcalinguaAt>',
        allowedContent: /^[^\r\n]+$/,
    },
    {
        type: 'breakLine',
        start: '\n',
    },
]

// 从规则表生成一次扫描所需的起始标记匹配器；长标记优先，避免未来出现前缀冲突。
const RULE_BY_START = new Map(PSEUDO_MARKDOWN_RULES.map((rule) => [rule.start, rule]))
const TOKEN_START_PATTERN_SOURCE = PSEUDO_MARKDOWN_RULES.map((rule) => escapeRegExp(rule.start))
    .sort((left, right) => right.length - left.length)
    .join('|')

/**
 * linkify 会把中文和紧邻链接的成对标点误算进 URL。
 * 这里用等长空格临时遮罩，确保 linkify 返回的位置仍能映射回原文。
 */
const LINKIFY_MASK_PATTERNS = [
    /[^\x00-\xff]+/g, // 中文和全角符号不能成为链接的一部分
    /["()']/g, // 链接两侧常见的成对标点
]

export function parseMessageText(text: string, shouldLinkify = true): MessagePart[] {
    const result: MessagePart[] = []
    const tokenStartMatcher = new RegExp(TOKEN_START_PATTERN_SOURCE, 'g')
    let cursor = 0
    let match: RegExpExecArray | null

    while ((match = tokenStartMatcher.exec(text))) {
        const rule = RULE_BY_START.get(match[0])
        if (!rule) continue

        const token = matchRuleAt(text, match.index, rule)
        if (!token) continue

        result.push(...parsePlainText(text.slice(cursor, token.index), shouldLinkify), token.part)
        cursor = token.endIndex
        tokenStartMatcher.lastIndex = token.endIndex
    }

    result.push(...parsePlainText(text.slice(cursor), shouldLinkify))
    return result
}

export function formatMessageParts(
    content: string,
    { linkify: shouldLinkify = true, disableQLottie = false, usePanguJs = false }: MessageFormattingOptions = {},
): MessagePart[] {
    const normalizedContent = disableQLottie ? downgradeQLottie(content) : content
    const parts = parseMessageText(normalizedContent, shouldLinkify)

    // HTML 需要额外一个换行才能显示末尾的空白行。
    if (normalizedContent.endsWith('\n')) {
        parts.push(createLineBreak())
    }

    return parts.map((part) => {
        const formattedPart = part.type === 'at' ? formatAtPart(part) : part
        return usePanguJs && shouldAddSpacing(formattedPart) ? spacePart(formattedPart) : formattedPart
    })
}

export function formatUserTags(content: string, users: MessageUser[] = []): string {
    const parts = content.split('<usertag>')
    if (parts.length === 1 || !users.length) return content

    const userTagIndex = createUserTagIndex(users)
    return parts
        .map((part, index) => {
            if (index === 0) return part

            const userId = findTaggedUserId(part, userTagIndex)
            if (!userId) return `<usertag>${part}`

            const user = userTagIndex.usersById.get(userId)!
            return `<usertag>@${user.username}${part.slice(userId.length)}`
        })
        .join('')
}

export function padFaceId(value: number, length = 3): string {
    return String(value).padStart(length, '0')
}

function parsePlainText(text: string, shouldLinkify: boolean): MessagePart[] {
    if (!text) return []
    if (!shouldLinkify) return [{ value: text }]

    const maskedText = maskTextForLinkify(text)
    const links = linkify.find(maskedText)

    if (!links.length) return [{ value: text }]

    const result: MessagePart[] = []
    let cursor = 0

    for (const link of links) {
        if (link.start > cursor) {
            result.push({ value: text.slice(cursor, link.start) })
        }

        result.push({
            value: text.slice(link.start, link.end),
            type: 'url',
            href: link.href,
        })
        cursor = link.end
    }

    if (cursor < text.length) {
        result.push({ value: text.slice(cursor) })
    }

    return result
}

function maskTextForLinkify(text: string): string {
    return LINKIFY_MASK_PATTERNS.reduce(
        (maskedText, pattern) => maskedText.replace(pattern, (value) => ' '.repeat(value.length)),
        text,
    )
}

function createUserTagIndex(users: MessageUser[]): UserTagIndex {
    const usersById = new Map<string, MessageUser>()

    for (const user of users) {
        const userId = String(user._id)
        if (userId && !usersById.has(userId)) usersById.set(userId, user)
    }

    const idLengths = [...new Set([...usersById.keys()].map((userId) => userId.length))].sort(
        (left, right) => right - left,
    )
    return { usersById, idLengths }
}

function findTaggedUserId(contentAfterTag: string, { usersById, idLengths }: UserTagIndex): string | undefined {
    for (const length of idLengths) {
        const userId = contentAfterTag.slice(0, length)
        if (usersById.has(userId)) return userId
    }
}

function matchRuleAt(text: string, index: number, rule: PseudoMarkdownRule): TokenMatch | null {
    if (!rule.end) {
        return {
            index,
            endIndex: index + rule.start.length,
            part: { value: '', type: rule.type },
        }
    }

    const contentStart = index + rule.start.length
    const contentEnd = text.indexOf(rule.end, contentStart)
    if (contentEnd < 0) return null

    const value = text.slice(contentStart, contentEnd)
    if (rule.allowedContent && !rule.allowedContent.test(value)) return null

    return {
        index,
        endIndex: contentEnd + rule.end.length,
        part: { value, type: rule.type },
    }
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createLineBreak(): MessagePart {
    return { value: '', type: 'breakLine' }
}

function downgradeQLottie(content: string): string {
    const match = content.match(/^\[QLottie: \d+,(\d+)(?:,\d+)?]$/)
    return match ? `[Face: ${match[1]}]` : content
}

function formatAtPart(part: MessagePart): MessagePart {
    const separatorIndex = part.value.indexOf('>')
    const qq = Number(part.value.slice(0, separatorIndex))

    if (separatorIndex < 0 || !Number.isFinite(qq) || qq <= 0) {
        return { ...part, value: `<IcalinguaAt qq=${part.value}</IcalinguaAt>` }
    }

    const encodedName = part.value.slice(separatorIndex + 1)
    const name = decodeAtName(encodedName)

    return {
        ...part,
        value: name,
        href: `icalingua://at?name=${encodedName}&qq=${qq}`,
        title: qq === 1 ? name : `${name}(${qq})`,
    }
}

function decodeAtName(encodedName: string): string {
    try {
        return decodeURIComponent(encodedName)
    } catch {
        return encodedName
    }
}

function shouldAddSpacing(part: MessagePart): boolean {
    return part.type === undefined
}

function spacePart(part: MessagePart): MessagePart {
    return { ...part, value: pangu.spacing(part.value) }
}
