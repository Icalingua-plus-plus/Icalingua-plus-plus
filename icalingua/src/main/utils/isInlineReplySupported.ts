import { getCapabilities } from 'freedesktop-notifications'

let cache: boolean = undefined

export default async () => {
    if (cache === undefined) {
        try {
            const capabilities = await getCapabilities()
            cache = capabilities.includes('inline-reply')
        } catch (ignore) {
            return (cache = false)
        }
    }
    return cache
}
