let timestamp = new Date().getTime()

export default (roomId: number, cache = false): string => {
    if(!roomId) return ''
    return (roomId < 0)
        ? `https://p.qlogo.cn/gh/${-roomId}/${-roomId}/0` + (cache ? '' : `?timestamp=${timestamp}`)
        : `https://q1.qlogo.cn/g?b=qq&nk=${roomId}&s=140` + (cache ? '' : `&timestamp=${timestamp}`)
}
