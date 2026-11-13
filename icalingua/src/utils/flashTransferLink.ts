export function isFlashTransferLink(input: string): boolean {
    try {
        const url = new URL(input)
        return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname === 'qfile.qq.com'
    } catch {
        return false
    }
}

export function flashTransferInput(input: string): string {
    const value = String(input || '').trim()
    if (value.length > 2048) throw new Error('闪传链接过长')
    return value
}
