import path from 'path'

const map = new Map<string, number>([
    ['/打call', 1],
    ['/变形', 2],
    ['/嗑到了', 3],
    ['/仔细分析', 4],
    ['/加油', 5],
    ['/我没事', 6],
    ['/菜汪', 7],
    ['/崇拜', 8],
    ['/比心', 9],
    ['/庆祝', 10],
    ['/老色痞', 11],
    ['/吃糖', 12],
    ['/篮球', 13],
    ['/惊吓', 14],
    ['/生气', 15],
    ['/流泪', 16],
    ['/蛋糕', 17],
    ['/鞭炮', 18],
    ['/烟花', 19],
    ['/我想开了', 20],
    ['/舔屏', 21],
    ['/花朵脸', 22],
    ['/热化了', 23],
    ['/打招呼', 24],
    ['/你真棒棒', 25],
    ['/酸Q', 26],
    ['/我方了', 27],
    ['/大怨种', 28],
    ['/红包多多', 29],
    ['[打call]', 1],
    ['[变形]', 2],
    ['[嗑到了]', 3],
    ['[仔细分析]', 4],
    ['[加油]', 5],
    ['[我没事]', 6],
    ['[菜汪]', 7],
    ['[崇拜]', 8],
    ['[比心]', 9],
    ['[庆祝]', 10],
    ['[老色痞]', 11],
    ['[吃糖]', 12],
    ['[篮球]', 13],
    ['[惊吓]', 14],
    ['[生气]', 15],
    ['[流泪]', 16],
    ['[蛋糕]', 17],
    ['[鞭炮]', 18],
    ['[烟花]', 19],
    ['[我想开了]', 20],
    ['[舔屏]', 21],
    ['[花朵脸]', 22],
    ['[热化了]', 23],
    ['[打招呼]', 24],
    ['[你真棒棒]', 25],
    ['[酸Q]', 26],
    ['[我方了]', 27],
    ['[大怨种]', 28],
    ['[红包多多]', 29],
])

const map2 = new Map([
    [324, 12],
    [114, 13],
    [325, 14],
    [326, 15],
    [5, 16],
    [53, 17],
    [137, 18],
    [333, 19],
    [338, 20],
    [339, 21],
    [337, 22],
    [340, 23],
    [341, 24],
    [346, 25],
])

export default (msgText: string, time: number): string => {
    if (time > 1673877600000) {
        //2023-01-16 22:00:00 UTC+8
        const idReg = msgText.match(/\[QLottie: (\d+)\,(\d+)\]/)
        if (!idReg) return
        if (msgText !== idReg[0]) return
        const id = idReg[1]
        const faceId = parseInt(idReg[2])
        let qlottie = ''

        if (faceId >= 311 && faceId <= 321) {
            qlottie = String(faceId - 310)
        } else if (faceId >= 342 && faceId <= 345) {
            qlottie = String(faceId - 316)
        } else {
            qlottie = String(map2.get(faceId))
        }
        if (qlottie === 'undefined') qlottie = ''

        const i = qlottie ? qlottie : String(id)
        // @ts-ignore
        return path.join(__static, 'qlottie', i, i + '.json')
    } else {
        const id = map.get(msgText.replace('请使用最新版手机QQ体验新功能', ''))
        if (id) {
            const i = String(id)
            // @ts-ignore
            return path.join(__static, 'qlottie', i, i + '.json')
        }
    }
}
