export default (roomId: number): string => {
    return (roomId < 0)
        ? `https://p.qlogo.cn/gh/${-roomId}/${-roomId}/0`
        : `https://q1.qlogo.cn/g?b=qq&nk=${roomId}&s=640`
}
