import path from "path";

const map = new Map<string, number>([
    ['[打call]请使用最新版手机QQ体验新功能', 1],
    ['[变形]请使用最新版手机QQ体验新功能', 2],
    ['[仔细分析]请使用最新版手机QQ体验新功能', 4],
    ['[加油]请使用最新版手机QQ体验新功能', 5],
    ['[菜汪]请使用最新版手机QQ体验新功能', 7],
    ['[崇拜]请使用最新版手机QQ体验新功能', 8],
    ['[比心]请使用最新版手机QQ体验新功能', 9],
    ['[庆祝]请使用最新版手机QQ体验新功能', 10],
    ['[吃糖]请使用最新版手机QQ体验新功能', 12],
])


export default (msgText: string): string => {
    const id = map.get(msgText)
    if (id) {
        const i = String(id)
        // @ts-ignore
        return path.join(__static, 'qlottie', i, i + '.json')
    }
}
