let timestamp = new Date().getTime()

export default (roomId: number, cache = false, original = false): string => {
    if (!roomId) return ''
    return roomId < 0
        ? `https://p.qlogo.cn/gh/${-roomId}/${-roomId}/${original ? '0' : '140'}` +
              (cache ? '' : `?timestamp=${timestamp}`)
        : `https://q1.qlogo.cn/g?b=qq&nk=${roomId}&s=${original ? '0' : '140'}` +
              (cache ? '' : `&timestamp=${timestamp}`)
}
