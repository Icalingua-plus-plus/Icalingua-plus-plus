export function safeFavoriteUrl(value: string): string {
    try {
        const url = new URL(value)
        return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''
    } catch {
        return ''
    }
}

/** 收藏 HTML 预览内的图片动作地址；由所属窗口拦截，不进行网页导航。 */
export const FAVORITE_IMAGE_LINK = 'https://icalingua.invalid/favorite-image'

export function makeFavoriteImageLink(url: string): string {
    const target = new URL(FAVORITE_IMAGE_LINK)
    target.searchParams.set('url', url)
    return target.href
}

export function readFavoriteImageLink(value: string): string {
    try {
        const target = new URL(value)
        if (target.origin + target.pathname !== FAVORITE_IMAGE_LINK) return ''
        return safeFavoriteUrl(target.searchParams.get('url') || '')
    } catch {
        return ''
    }
}
