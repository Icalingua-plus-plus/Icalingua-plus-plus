import AtCacheItem from '@icalingua/types/AtCacheElem'

let cache: AtCacheItem[] = []

export default {
    clear: () => (cache = []),
    push: (e: AtCacheItem) => cache.push(e),
    get: () => cache,
}
