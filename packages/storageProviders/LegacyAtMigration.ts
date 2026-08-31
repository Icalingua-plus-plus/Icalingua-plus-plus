import type DatabaseUpgradeProgress from '@icalingua/types/DatabaseUpgradeProgress'

const legacyAtMarkupPattern = /<IcalinguaAt qq=(\d+)>([\s\S]*?)<\/IcalinguaAt>/g

export const legacyAtSearchKeyword = '<IcalinguaAt qq='
export const legacyAtMigrationVersion = '1'
export const legacyAtMetadataName = 'messageAtMarkupVersion'
export const legacyAtMigrationBatchSize = 200

export interface LegacyAtMessageLike {
    content?: unknown
    file?: unknown
    files?: unknown
}

export interface LegacyAtMessageMigration {
    content: string
    file?: unknown
    files?: unknown
    mediaChanged: boolean
}

export interface LegacyAtSearchIndex {
    countTimes(keyword: string): Promise<number | null>
    searchTimes(keyword: string, options: { maxTime?: number; limit: number }): Promise<number[] | null>
    syncMessages(messages: Array<{ time: number }>): Promise<void>
}

export interface LegacyAtMigrationOptions {
    searchIndex: LegacyAtSearchIndex
    isClosed: () => boolean
    hasCompleted: () => Promise<boolean>
    migrateBatch: (times: number[]) => Promise<boolean | void>
    markCompleted: () => Promise<void>
    reportProgress: (progress: DatabaseUpgradeProgress) => void
}

const escapeXml = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')

const decodeLegacyAtName = (value: string): string => {
    try {
        return decodeURIComponent(value)
    } catch {
        // A malformed old URI should not keep the message in the legacy
        // format forever. Preserve its visible bytes and still remove the
        // obsolete wrapper.
        return value
    }
}

type LegacyAtTextReplacementCallback = (index: number, replacedLength: number, replacementLength: number) => void

const yieldToMigrationPeers = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

/** One-time database migration for the removed URI-encoded At markup. */
export const migrateLegacyAtContent = (content: unknown, onReplacement?: LegacyAtTextReplacementCallback): string => {
    const source = String(content ?? '')
    let offsetDelta = 0
    return source.replace(legacyAtMarkupPattern, (match, qq: string, encodedName: string, offset: number) => {
        const replacement = `<IcaAt qq=${qq}>${escapeXml(decodeLegacyAtName(encodedName))}</IcaAt>`
        onReplacement?.(offset + offsetDelta, match.length, replacement.length)
        offsetDelta += replacement.length - match.length
        return replacement
    })
}

export const containsLegacyAtContent = (content: unknown): boolean =>
    /<IcalinguaAt qq=\d+>[\s\S]*?<\/IcalinguaAt>/.test(String(content ?? ''))

const shiftMediaOrder = (
    value: unknown,
    start: number,
    replacedLength: number,
    replacementLength: number,
): [unknown, boolean] => {
    const end = start + replacedLength
    const delta = replacementLength - replacedLength
    if (!delta) return [value, false]

    const shiftItem = (item: unknown): [unknown, boolean] => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [item, false]
        const record = item as Record<string, unknown>
        const order = record.order
        if (!Number.isInteger(order) || Number(order) < end) return [item, false]
        return [{ ...record, order: Number(order) + delta }, true]
    }

    if (Array.isArray(value)) {
        let changed = false
        const shifted = value.map((item) => {
            const [nextItem, itemChanged] = shiftItem(item)
            changed ||= itemChanged
            return nextItem
        })
        return [changed ? shifted : value, changed]
    }

    return shiftItem(value)
}

/** Convert legacy content and keep ordered media offsets aligned with it. */
export const tryMigrateLegacyAtMessage = (message: LegacyAtMessageLike): LegacyAtMessageMigration | null => {
    try {
        const source = String(message?.content ?? '')
        if (!containsLegacyAtContent(source)) return null

        let file = message?.file
        let files = message?.files
        let mediaChanged = false
        const migratedContent = migrateLegacyAtContent(source, (index, replacedLength, replacementLength) => {
            const shiftedFile = shiftMediaOrder(file, index, replacedLength, replacementLength)
            const shiftedFiles = shiftMediaOrder(files, index, replacedLength, replacementLength)
            file = shiftedFile[0]
            files = shiftedFiles[0]
            mediaChanged = mediaChanged || shiftedFile[1] || shiftedFiles[1]
        })

        return { content: migratedContent, file, files, mediaChanged }
    } catch {
        return null
    }
}

/**
 * Converts one message without allowing an unexpected malformed value to
 * reject the whole migration batch. Normal database strings should never
 * reach the catch path; malformed URI escape sequences are handled inside
 * `decodeLegacyAtName` and are converted using their original bytes.
 */
export const tryMigrateLegacyAtContent = (content: unknown): string | null => {
    return tryMigrateLegacyAtMessage({ content })?.content ?? null
}

export async function runLegacyAtMigration(options: LegacyAtMigrationOptions): Promise<void> {
    if (options.isClosed() || (await options.hasCompleted()) || options.isClosed()) return

    let progressStarted = false
    try {
        options.reportProgress({
            active: true,
            step: 0,
            total: 0,
            message: '正在检查旧版 @ 消息...',
        })
        progressStarted = true

        const total = await options.searchIndex.countTimes(legacyAtSearchKeyword)
        if (total === null) return

        let step = 0
        let maxTime: number | undefined
        const progressTotal = Math.max(0, Math.trunc(Number(total || 0)))
        while (!options.isClosed()) {
            const times = await options.searchIndex.searchTimes(legacyAtSearchKeyword, {
                maxTime,
                limit: legacyAtMigrationBatchSize,
            })
            if (times === null) return
            if (!times.length) break

            const normalizedTimes = Array.from(
                new Set(times.map((time) => Math.trunc(Number(time))).filter((time) => time > 0)),
            ).sort((left, right) => right - left)
            if (!normalizedTimes.length) break

            const ftsSynchronized = await options.migrateBatch(normalizedTimes)
            // Let foreground database requests run after the primary-store part
            // of a batch and before the potentially expensive FTS synchronization.
            await yieldToMigrationPeers()
            if (ftsSynchronized !== true) {
                // Rewrite complete timestamp groups so the FTS sidecar is repaired
                // even if the process stopped after the primary-store write.
                await options.searchIndex.syncMessages(normalizedTimes.map((time) => ({ time })))
            }

            step += normalizedTimes.length
            options.reportProgress({
                active: true,
                step: Math.min(step, Math.max(progressTotal, step)),
                total: Math.max(progressTotal, step),
                message: '正在升级 @ 消息格式...',
            })
            const lastTime = normalizedTimes[normalizedTimes.length - 1]
            if (lastTime <= 0) break
            maxTime = lastTime - 1
            await yieldToMigrationPeers()
        }

        if (options.isClosed()) return
        await options.markCompleted()
    } finally {
        if (progressStarted && !options.isClosed()) {
            options.reportProgress({ active: false, step: 0, total: 0, message: '' })
        }
    }
}
