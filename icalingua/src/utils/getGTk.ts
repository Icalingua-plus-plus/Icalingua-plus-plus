export default (pSkey: string) => {
    let t = 5381
    for (let r = 0, o = pSkey.length; r < o; ++r) {
        t += (t << 5) + pSkey.charCodeAt(r)
    }
    return t & 2147483647
}
