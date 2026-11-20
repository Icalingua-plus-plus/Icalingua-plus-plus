import { app } from 'electron'
import fs from 'fs'
import path from 'path'

export const getStickersDir = () => path.join(app.getPath('userData'), 'stickers')

export function getStickerGroups(): string[] {
    const root = getStickersDir()
    try {
        return fs
            .readdirSync(root)
            .filter((name) => {
                try {
                    return fs.statSync(path.join(root, name)).isDirectory()
                } catch {
                    return false
                }
            })
            .sort()
    } catch {
        return []
    }
}

export function getStickerGroupDir(group: string): string {
    if (typeof group !== 'string') throw new Error('无效的 Stickers 分组')
    if (group === '') return getStickersDir()
    if (group === '.' || group === '..' || /[<>:"/\\|?*\x00-\x1f]/.test(group) || /[. ]$/.test(group))
        throw new Error('Stickers 分组名包含不支持的字符')
    return path.join(getStickersDir(), group)
}
