import assert from 'node:assert/strict'
import test from 'node:test'

import { parseMessageMarkdownInlineCommand, renderMessageMarkdown } from './messageMarkdown'

test('renders QQ Markdown cards and hides the version metadata line', () => {
    const source = `[](%7B%22version%22%3A2%7D)
# 邦邦咔邦，老师您好
  > ![img #480px #270px](https://example.com/card.png)
  > ➢ [🎶心奈唱歌表情包](mqqapi://aio/inlinecmd?command=%2F%E5%BF%83%E5%A5%88%E5%94%B1%E6%AD%8C&enter=false&reply=true)`
    const html = renderMessageMarkdown(source)

    assert.match(html, /<h1>邦邦咔邦，老师您好<\/h1>/)
    assert.match(html, /<blockquote>/)
    assert.match(html, /src="https:\/\/example\.com\/card\.png"/)
    assert.doesNotMatch(html, /\s(?:width|height)="/)
    assert.match(html, /draggable="true"/)
    assert.match(html, /href="mqqapi:\/\/aio\/inlinecmd\?command=.*&amp;enter=false&amp;reply=true"/)
    assert.doesNotMatch(html, /version|%7B/)
})

test('parses QQ inline commands and their reply flag', () => {
    assert.deepEqual(
        parseMessageMarkdownInlineCommand(
            'mqqapi://aio/inlinecmd?command=%2F%E6%94%BB%E7%95%A5%20&enter=false&reply=true',
        ),
        { command: '/攻略 ', reply: true },
    )
    assert.deepEqual(parseMessageMarkdownInlineCommand('mqqapi://aio/inlinecmd?command=%2F%E6%8A%BD%E5%8D%A1'), {
        command: '/抽卡',
        reply: false,
    })
    assert.equal(parseMessageMarkdownInlineCommand('https://example.com/inlinecmd?command=%2Ftest'), null)
})

test('renders QQ TeX colors and bold text in display, inline, and quoted Markdown', () => {
    const source = `[](%7B%22version%22%3A2%7D)
$$\\colorbox{#E8F5E9}{\\textcolor{#2E7D32}{\\textbf{ 🎣 已收竿 }}}$$
抛竿14次 | $\\textcolor{#2E7D32}{\\textbf{✅钓获14条}}$ | 💨逃脱0条 | 💥断线0条
灵力:0/999
状态:$$\\colorbox{#F5F5F5}{\\textcolor{#424242}{\\textbf{⏸ 空闲}}}$$

**📋 钓获清单（已结算入包）**
> 🐟 $\\textcolor{#6A1B9A}{\\textbf{紫烟鳅}}$ ×3 最大 3.400万亿吨`
    const html = renderMessageMarkdown(source)

    assert.match(html, /<div class="vac-markdown-math vac-markdown-math-display">/)
    assert.match(html, /class="katex-display"/)
    assert.match(html, /background-color:#E8F5E9/)
    assert.match(html, /color:#2E7D32/)
    assert.match(html, /background-color:#F5F5F5/)
    assert.match(html, /color:#6A1B9A/)
    assert.match(html, /<blockquote><p>🐟 <span class="vac-markdown-math">/)
    assert.doesNotMatch(html, /katex-error/)
    assert.doesNotMatch(html, /version|%7B/)
})

test('keeps unmatched double-dollar delimiters intact instead of splitting them', () => {
    const html = renderMessageMarkdown('状态:$$未完成')

    assert.match(html, /状态:\$\$未完成/)
    assert.doesNotMatch(html, /vac-markdown-math/)
})

test('does not put unsafe TeX colors into inline styles', () => {
    const html = renderMessageMarkdown('$\\textcolor{javascript:alert(1)}{安全文本}$')

    assert.match(html, /安全文本/)
    assert.doesNotMatch(html, /javascript/i)
    assert.doesNotMatch(html, /katex-error/)
})

test('renders grouped and declaration-style LaTeX tiny text', () => {
    const html = renderMessageMarkdown('$\\tiny{小字}$ / $\\tiny 后续小字$')

    assert.match(html, /class="[^\"]*katex-sizing[^\"]*size1[^\"]*"/)
    assert.match(html, /小字/)
    assert.match(html, /后续小字/)
    assert.doesNotMatch(html, /katex-error/)
})

test('renders common LaTeX formulas, delimiters, operators, and aligned matrices', () => {
    const html = renderMessageMarkdown(
        [
            '行内 $\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$ 与 \\(\\alpha_1^2 + \\beta^2\\)',
            '\\[',
            '\\begin{aligned}',
            'S_n &= \\sum_{i=1}^{n} i = \\frac{n(n+1)}{2} \\\\',
            'I &= \\int_0^1 x^2 \\, dx',
            '\\end{aligned}',
            '\\]',
        ].join('\n'),
    )

    assert.match(html, /class="mfrac"/)
    assert.match(html, /class="[^"]*sqrt[^"]*"/)
    assert.match(html, /class="msupsub"/)
    assert.match(html, /class="[^"]*op-symbol large-op[^"]*"/)
    assert.match(html, /class="mtable"/)
    assert.match(html, /class="katex-display"/)
    assert.doesNotMatch(html, /katex-error/)
})

test('keeps untrusted LaTeX links disabled', () => {
    const html = renderMessageMarkdown('$\\href{javascript:alert(1)}{危险链接}$')

    assert.doesNotMatch(html, /<a\s/i)
    assert.doesNotMatch(html, /href="javascript:/i)
})

test('renders every formatting type supported by QQ Markdown', () => {
    const html = renderMessageMarkdown(`# 一级标题
## 二级标题
**加粗** __下划线加粗__ _斜体_ *星号斜体* ***加粗斜体*** ~~删除线~~
<https://doc.qq.com>
***`)

    assert.match(html, /<h1>一级标题<\/h1>/)
    assert.match(html, /<h2>二级标题<\/h2>/)
    assert.match(html, /<strong>加粗<\/strong>/)
    assert.match(html, /<strong class="vac-markdown-underline">下划线加粗<\/strong>/)
    assert.match(html, /<em>斜体<\/em>/)
    assert.match(html, /<strong><em>加粗斜体<\/em><\/strong>/)
    assert.match(html, /<del>删除线<\/del>/)
    assert.match(html, /href="https:\/\/doc\.qq\.com"/)
    assert.match(html, /<hr>/)
})

test('renders ordered, unordered, and nested lists', () => {
    const html = renderMessageMarkdown(`1. 第一项
    - 子项一
    - 子项二
2. 第二项
    1. 有序子项`)

    assert.match(html, /^<ol>/)
    assert.match(html, /<li>第一项<ul><li>子项一<\/li><li>子项二<\/li><\/ul><\/li>/)
    assert.match(html, /<li>第二项<ol><li>有序子项<\/li><\/ol><\/li>/)
})

test('escapes raw HTML and rejects unsafe links and image sources', () => {
    const html = renderMessageMarkdown(
        '<img src=x onerror=alert(1)> [危险](javascript:alert(1)) ![图片](data:image/svg+xml,bad)',
    )

    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
    assert.doesNotMatch(html, /href="javascript:/)
    assert.doesNotMatch(html, /src="data:/)
    assert.match(html, / 危险 /)
    assert.match(html, /vac-markdown-image-alt">图片/)
})

test('can keep Markdown images collapsed by default', () => {
    const html = renderMessageMarkdown('![预览 #208px #320px](https://example.com/image.png)', {
        hideImages: true,
    })

    assert.match(html, /<details class="vac-markdown-hidden-image">/)
    assert.match(html, /<summary>Hidden image<\/summary>/)
})

test('renders fenced code blocks without changing indentation or parsing Markdown', () => {
    const html = renderMessageMarkdown(`\`\`\`ts
function example() {
\tconst value = "<tag>"
    return **value**
}
\`\`\``)

    assert.match(html, /class="vac-markdown-code-container"/)
    assert.match(html, /class="vac-markdown-code-copy"/)
    assert.match(html, /<pre class="vac-markdown-code-block"><code data-language="ts">/)
    assert.match(html, /function example\(\) \{\n\tconst value = &quot;&lt;tag&gt;&quot;\n    return \*\*value\*\*/)
    assert.doesNotMatch(html, /<strong>value<\/strong>/)
})
