export default (size: number): string => {
    if (size < 1024) return size + 'B'
    else if (size < 1024 * 1024) return (size / 1024).toFixed(2) + 'KB'
    else if (size < 1024 * 1024 * 1024) return (size / 1024 / 1024).toFixed(2) + 'MB'
    else if (size < 1024 * 1024 * 1024 * 1024) return (size / 1024 / 1024 / 1024).toFixed(2) + 'GB'
    else return (size / 1024 / 1024 / 1024 / 1024).toFixed(2) + 'TB'
}
