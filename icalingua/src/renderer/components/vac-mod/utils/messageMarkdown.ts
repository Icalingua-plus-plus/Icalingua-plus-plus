export interface MessageMarkdownOptions {
    hideImages?: boolean
}

export interface MessageMarkdownInlineCommand {
    command: string
    reply: boolean
}

interface MarkdownLink {
    destination: string
    end: number
    label: string
}

interface ListMatch {
    content: string
    indent: number
    ordered: boolean
}

interface LatexGroup {
    content: string
    end: number
}

interface LatexMath {
    end: number
    expression: string
}

const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mqqapi:', 'qqapi:', 'icalingua:'])
const IMAGE_PROTOCOLS = new Set(['http:', 'https:'])
const LATEX_SIMPLE_FORMATS: Record<string, { close: string; open: string }> = {
    emph: { open: '<em>', close: '</em>' },
    text: { open: '<span>', close: '</span>' },
    textbf: { open: '<strong>', close: '</strong>' },
    textit: { open: '<em>', close: '</em>' },
    tiny: { open: '<span class="vac-markdown-latex-tiny">', close: '</span>' },
    underline: { open: '<span class="vac-markdown-underline">', close: '</span>' },
}

export function renderMessageMarkdown(source: string, options: MessageMarkdownOptions = {}): string {
    const normalized = String(source || '')
        .replace(/\r\n?/g, '\n')
        .replace(/\0/g, '')
    return renderBlocks(normalized.split('\n'), options)
}

export function parseMessageMarkdownInlineCommand(source: string): MessageMarkdownInlineCommand | null {
    try {
        const url = new URL(source)
        if (url.protocol !== 'mqqapi:' || url.hostname !== 'aio' || url.pathname !== '/inlinecmd') return null

        const command = url.searchParams.get('command')
        if (!command) return null
        return {
            command,
            reply: url.searchParams.get('reply') === 'true',
        }
    } catch {
        return null
    }
}

function renderBlocks(lines: string[], options: MessageMarkdownOptions): string {
    const result: string[] = []
    let index = 0

    while (index < lines.length) {
        const line = lines[index]
        const trimmed = line.trim()

        if (isMetadataLine(trimmed)) {
            index++
            continue
        }

        if (!trimmed) {
            result.push('<div class="vac-markdown-spacer" aria-hidden="true"></div>')
            index++
            continue
        }

        const displayMath = readDisplayMathBlock(lines, index)
        if (displayMath) {
            result.push(renderLatexMath(displayMath.expression, true))
            index = displayMath.next
            continue
        }

        const heading = line.match(/^\s{0,3}(#{1,2})\s+(.+?)\s*$/)
        if (heading) {
            const level = heading[1].length
            result.push(`<h${level}>${renderInline(heading[2], options)}</h${level}>`)
            index++
            continue
        }

        if (isHorizontalRule(line)) {
            result.push('<hr>')
            index++
            continue
        }

        const fence = matchCodeFence(line)
        if (fence) {
            const codeLines: string[] = []
            index++
            while (index < lines.length && !isClosingCodeFence(lines[index], fence)) {
                codeLines.push(lines[index])
                index++
            }
            if (index < lines.length) index++

            // TODO: Add opt-in syntax highlighting based on the language hint.
            const language = fence.language ? ` data-language="${escapeAttribute(fence.language)}"` : ''
            result.push(
                `<div class="vac-markdown-code-container"><button type="button" class="vac-markdown-code-copy" title="复制代码" aria-label="复制代码">复制</button><pre class="vac-markdown-code-block"><code${language}>${escapeHtml(
                    codeLines.join('\n'),
                )}</code></pre></div>`,
            )
            continue
        }

        if (/^\s*>/.test(line)) {
            const quoteLines: string[] = []
            while (index < lines.length && /^\s*>/.test(lines[index])) {
                quoteLines.push(lines[index].replace(/^\s*>\s?/, ''))
                index++
            }
            result.push(`<blockquote>${renderBlocks(quoteLines, options)}</blockquote>`)
            continue
        }

        if (matchListLine(line)) {
            const list = renderList(lines, index, options)
            result.push(list.html)
            index = list.next
            continue
        }

        const paragraphLines: string[] = []
        while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
            if (!isMetadataLine(lines[index].trim())) paragraphLines.push(lines[index].trim())
            index++
        }

        if (!paragraphLines.length) {
            paragraphLines.push(trimmed)
            index++
        }

        const actionLink = paragraphLines.length === 1 ? readMarkdownLink(paragraphLines[0], 0, false) : null
        const isAction =
            actionLink &&
            actionLink.label.length > 0 &&
            actionLink.end === paragraphLines[0].length &&
            sanitizeUrl(actionLink.destination, false)
        result.push(
            `<p${isAction ? ' class="vac-markdown-action"' : ''}>${paragraphLines
                .map((paragraphLine) => renderInline(paragraphLine, options))
                .join('<br>')}</p>`,
        )
    }

    return result.join('')
}

function renderList(lines: string[], start: number, options: MessageMarkdownOptions): { html: string; next: number } {
    const first = matchListLine(lines[start])
    const tag = first.ordered ? 'ol' : 'ul'
    const items: string[] = []
    let index = start

    while (index < lines.length) {
        const current = matchListLine(lines[index])
        if (!current || current.indent !== first.indent || current.ordered !== first.ordered) break

        let item = renderInline(current.content, options)
        index++

        while (index < lines.length) {
            const nested = matchListLine(lines[index])
            if (nested && nested.indent > first.indent) {
                const nestedList = renderList(lines, index, options)
                item += nestedList.html
                index = nestedList.next
                continue
            }
            if (nested || !lines[index].trim() || leadingIndent(lines[index]) <= first.indent) break

            item += `<br>${renderInline(lines[index].trim(), options)}`
            index++
        }

        items.push(`<li>${item}</li>`)
    }

    return { html: `<${tag}>${items.join('')}</${tag}>`, next: index }
}

function renderInline(source: string, options: MessageMarkdownOptions): string {
    const result: string[] = []
    let index = 0

    while (index < source.length) {
        const math = source[index] === '$' ? readInlineLatexMath(source, index) : null
        if (math) {
            result.push(renderLatexMath(math.expression, false))
            index = math.end
            continue
        }

        // Prefer the two-character delimiter as one token. An unmatched `$$` must not
        // fall through and let its second `$` start a separate inline-math token.
        if (source.startsWith('$$', index)) {
            result.push('$$')
            index += 2
            continue
        }

        if (source[index] === '\\' && index + 1 < source.length) {
            result.push(escapeHtml(source[index + 1]))
            index += 2
            continue
        }

        const image = source.startsWith('![', index) ? readMarkdownLink(source, index, true) : null
        if (image) {
            result.push(renderImage(image.label, image.destination, options))
            index = image.end
            continue
        }

        const link = source[index] === '[' ? readMarkdownLink(source, index, false) : null
        if (link) {
            result.push(renderLink(link.label, link.destination, options))
            index = link.end
            continue
        }

        if (source[index] === '<') {
            const end = source.indexOf('>', index + 1)
            if (end > index) {
                const destination = source.slice(index + 1, end)
                const safeDestination = sanitizeUrl(destination, false)
                if (safeDestination) {
                    result.push(renderAnchor(destination, safeDestination))
                    index = end + 1
                    continue
                }
            }
        }

        const formatting = matchFormatting(source, index, options)
        if (formatting) {
            result.push(formatting.html)
            index = formatting.end
            continue
        }

        result.push(escapeHtml(source[index]))
        index++
    }

    return result.join('')
}

function matchFormatting(
    source: string,
    index: number,
    options: MessageMarkdownOptions,
): { html: string; end: number } | null {
    const formats = [
        { delimiter: '***', open: '<strong><em>', close: '</em></strong>' },
        { delimiter: '**', open: '<strong>', close: '</strong>' },
        { delimiter: '__', open: '<strong class="vac-markdown-underline">', close: '</strong>' },
        { delimiter: '~~', open: '<del>', close: '</del>' },
        { delimiter: '*', open: '<em>', close: '</em>' },
        { delimiter: '_', open: '<em>', close: '</em>' },
    ]

    for (const format of formats) {
        if (!source.startsWith(format.delimiter, index)) continue
        const contentStart = index + format.delimiter.length
        const contentEnd = source.indexOf(format.delimiter, contentStart)
        if (contentEnd <= contentStart) continue
        return {
            html: `${format.open}${renderInline(source.slice(contentStart, contentEnd), options)}${format.close}`,
            end: contentEnd + format.delimiter.length,
        }
    }

    return null
}

function renderLatexMath(expression: string, display: boolean): string {
    const className = display ? 'vac-markdown-math vac-markdown-math-display' : 'vac-markdown-math'
    const tag = display ? 'div' : 'span'
    return `<${tag} class="${className}">${renderLatexExpression(expression)}</${tag}>`
}

function renderLatexExpression(source: string): string {
    const result: string[] = []
    let index = 0

    while (index < source.length) {
        if (source[index] === '\\') {
            const command = readLatexCommand(source, index)
            if (!command) {
                result.push('\\')
                index++
                continue
            }

            const simpleFormat = LATEX_SIMPLE_FORMATS[command.name]
            if (simpleFormat) {
                const group = readLatexGroup(source, command.end)
                if (group) {
                    result.push(`${simpleFormat.open}${renderLatexExpression(group.content)}${simpleFormat.close}`)
                    index = group.end
                    continue
                }

                if (command.name === 'tiny') {
                    result.push(
                        `${simpleFormat.open}${renderLatexExpression(source.slice(command.end))}${simpleFormat.close}`,
                    )
                    break
                }
            }

            if (command.name === 'colorbox' || command.name === 'textcolor') {
                const colorGroup = readLatexGroup(source, command.end)
                const contentGroup = colorGroup && readLatexGroup(source, colorGroup.end)
                if (colorGroup && contentGroup) {
                    const content = renderLatexExpression(contentGroup.content)
                    const color = sanitizeLatexColor(colorGroup.content.trim())
                    if (color) {
                        const property = command.name === 'colorbox' ? 'background-color' : 'color'
                        const className =
                            command.name === 'colorbox' ? 'vac-markdown-colorbox' : 'vac-markdown-textcolor'
                        result.push(
                            `<span class="${className}" style="${property}:${escapeAttribute(color)}">${content}</span>`,
                        )
                    } else {
                        result.push(content)
                    }
                    index = contentGroup.end
                    continue
                }
            }

            if (command.name.length === 1 && command.name !== '\\') {
                result.push(escapeHtml(command.name))
            } else {
                result.push(escapeHtml(`\\${command.name}`))
            }
            index = command.end
            continue
        }

        if (source[index] === '\n') {
            result.push('<br>')
        } else {
            result.push(escapeHtml(source[index]))
        }
        index++
    }

    return result.join('')
}

function readLatexCommand(source: string, start: number): { end: number; name: string } | null {
    if (source[start] !== '\\' || start + 1 >= source.length) return null

    const next = source[start + 1]
    if (!/[A-Za-z]/.test(next)) return { name: next, end: start + 2 }

    let end = start + 2
    while (end < source.length && /[A-Za-z]/.test(source[end])) end++
    return { name: source.slice(start + 1, end), end }
}

function readLatexGroup(source: string, start: number): LatexGroup | null {
    if (source[start] !== '{') return null

    let depth = 0
    for (let index = start; index < source.length; index++) {
        if (source[index] === '\\') {
            index++
            continue
        }
        if (source[index] === '{') {
            depth++
            continue
        }
        if (source[index] !== '}') continue

        depth--
        if (depth === 0) {
            return {
                content: source.slice(start + 1, index),
                end: index + 1,
            }
        }
    }
    return null
}

function sanitizeLatexColor(rawColor: string): string | null {
    return /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(rawColor) ? rawColor : null
}

function readDisplayMathBlock(lines: string[], start: number): { expression: string; next: number } | null {
    const firstLine = lines[start].trim()
    if (!firstLine.startsWith('$$')) return null

    const firstContent = firstLine.slice(2)
    const sameLineEnd = findLatexDelimiter(firstContent, 0, '$$')
    if (sameLineEnd >= 0 && !firstContent.slice(sameLineEnd + 2).trim()) {
        return { expression: firstContent.slice(0, sameLineEnd), next: start + 1 }
    }

    const expressionLines = [firstContent]
    for (let index = start + 1; index < lines.length; index++) {
        const end = findLatexDelimiter(lines[index], 0, '$$')
        if (end >= 0 && !lines[index].slice(end + 2).trim()) {
            expressionLines.push(lines[index].slice(0, end))
            return { expression: expressionLines.join('\n'), next: index + 1 }
        }
        expressionLines.push(lines[index])
    }
    return null
}

function readInlineLatexMath(source: string, start: number): LatexMath | null {
    const delimiter = source.startsWith('$$', start) ? '$$' : '$'
    const contentStart = start + delimiter.length
    const end = findLatexDelimiter(source, contentStart, delimiter)
    if (end <= contentStart) return null
    return {
        expression: source.slice(contentStart, end),
        end: end + delimiter.length,
    }
}

function findLatexDelimiter(source: string, start: number, delimiter: string): number {
    let state: 'content' | 'escaped' = 'content'

    for (let index = start; index <= source.length - delimiter.length; index++) {
        if (state === 'escaped') {
            state = 'content'
            continue
        }

        if (source[index] === '\\') {
            state = 'escaped'
            continue
        }

        if (source.startsWith(delimiter, index)) return index
    }
    return -1
}

function renderLink(label: string, destination: string, options: MessageMarkdownOptions): string {
    const safeDestination = sanitizeUrl(destination, false)
    if (!safeDestination) return renderInline(label, options)
    return renderAnchor(renderInline(label, options), safeDestination, true)
}

function renderAnchor(label: string, destination: string, labelIsHtml = false): string {
    return `<a href="${escapeAttribute(destination)}" target="_blank" rel="noopener noreferrer">${
        labelIsHtml ? label : escapeHtml(label)
    }</a>`
}

function renderImage(altSource: string, destination: string, options: MessageMarkdownOptions): string {
    const safeDestination = sanitizeUrl(destination, true)
    const dimensions = altSource.match(/\s*#(\d+)px(?:\s+#(\d+)px)?\s*$/i)
    const alt = dimensions ? altSource.slice(0, dimensions.index).trim() : altSource
    if (!safeDestination) return `<span class="vac-markdown-image-alt">${escapeHtml(alt)}</span>`

    const image = `<img class="vac-markdown-image" src="${escapeAttribute(safeDestination)}" alt="${escapeAttribute(
        alt,
    )}" loading="lazy" referrerpolicy="no-referrer" draggable="true">`

    if (options.hideImages) {
        return `<details class="vac-markdown-hidden-image"><summary>Hidden image</summary>${image}</details>`
    }
    return `<span class="vac-markdown-image-wrap">${image}</span>`
}

function readMarkdownLink(source: string, start: number, image: boolean): MarkdownLink | null {
    const labelStart = start + (image ? 2 : 1)
    const labelEnd = source.indexOf('](', labelStart)
    if (labelEnd < 0) return null

    const destinationStart = labelEnd + 2
    let depth = 0
    for (let index = destinationStart; index < source.length; index++) {
        if (source[index] === '\\') {
            index++
            continue
        }
        if (source[index] === '(') depth++
        if (source[index] !== ')') continue
        if (depth > 0) {
            depth--
            continue
        }
        return {
            destination: source.slice(destinationStart, index).trim(),
            end: index + 1,
            label: source.slice(labelStart, labelEnd),
        }
    }
    return null
}

function sanitizeUrl(rawUrl: string, image: boolean): string | null {
    try {
        const parsed = new URL(rawUrl)
        const allowedProtocols = image ? IMAGE_PROTOCOLS : LINK_PROTOCOLS
        return allowedProtocols.has(parsed.protocol) ? rawUrl : null
    } catch {
        return null
    }
}

function matchListLine(line: string): ListMatch | null {
    const match = line.match(/^(\s*)([-+*]|\d+\.)\s+(.+)$/)
    if (!match) return null
    return {
        content: match[3],
        indent: indentationWidth(match[1]),
        ordered: /\d+\./.test(match[2]),
    }
}

function isBlockStart(line: string): boolean {
    return (
        /^\s{0,3}#{1,2}\s+/.test(line) ||
        /^\s*>/.test(line) ||
        /^\s*\$\$/.test(line) ||
        !!matchListLine(line) ||
        !!matchCodeFence(line) ||
        isHorizontalRule(line)
    )
}

function matchCodeFence(line: string): { character: string; length: number; language: string } | null {
    const match = line.match(/^\s{0,3}(`{3,}|~{3,})\s*([^\s`]*)\s*$/)
    if (!match) return null
    return {
        character: match[1][0],
        length: match[1].length,
        language: match[2],
    }
}

function isClosingCodeFence(line: string, fence: { character: string; length: number }): boolean {
    const match = line.match(/^\s{0,3}(`{3,}|~{3,})\s*$/)
    return !!match && match[1][0] === fence.character && match[1].length >= fence.length
}

function isHorizontalRule(line: string): boolean {
    return /^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(line)
}

function isMetadataLine(line: string): boolean {
    const link = readMarkdownLink(line, 0, false)
    if (!link || link.label || link.end !== line.length) return false
    try {
        const metadata = JSON.parse(decodeURIComponent(link.destination))
        return Number.isFinite(metadata?.version)
    } catch {
        return false
    }
}

function leadingIndent(line: string): number {
    return indentationWidth(line.match(/^\s*/)?.[0] || '')
}

function indentationWidth(indentation: string): number {
    return [...indentation].reduce((width, character) => width + (character === '\t' ? 4 : 1), 0)
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => {
        const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
        return entities[character]
    })
}

function escapeAttribute(value: string): string {
    return escapeHtml(value)
}
