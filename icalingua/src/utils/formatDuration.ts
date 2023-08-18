export default (seconds: number) => {
    const segments: string[] = []
    const days = Math.floor(seconds / 86400)
    if (days) {
        segments.push(`${days} 天`)
    }
    const hours = Math.floor((seconds / 3600) % 24)
    if (hours) {
        segments.push(`${hours} 时`)
    }
    const minutes = Math.floor((seconds / 60) % 60)
    if (minutes) {
        segments.push(`${minutes} 分`)
    }
    seconds = Math.floor(seconds % 60)
    if (seconds || !segments.length) {
        segments.push(`${seconds} 秒`)
    }
    return segments.join(' ')
}
