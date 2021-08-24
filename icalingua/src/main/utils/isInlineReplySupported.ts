import {getCapabilities} from 'freedesktop-notifications'

let cache: boolean = undefined

export default async () => {
    if (cache === undefined) {
        const capabilities = await getCapabilities()
        cache = capabilities.includes('inline-reply')
    }
    return cache
}
