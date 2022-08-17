import AtCacheItem from '@icalingua/types/AtCacheElem'

let cache: AtCacheItem[] = [
    {
        id: 'all',
        text: '@全体成员',
    },
]

export default {
    clear: () =>
        (cache = [
            {
                id: 'all',
                text: '@全体成员',
            },
        ]),
    push: (e: AtCacheItem) => cache.push(e),
    get: () => cache,
}
