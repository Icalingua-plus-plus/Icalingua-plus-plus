import { randomUUID } from 'crypto'

//token，{群号，到期时间}
const TOKEN_TTL = 1000 * 60 * 60
const CLEANUP_INTERVAL = 1000 * 60 * 5
const map = new Map<string, { gin: number; expire: number }>()

const cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [token, value] of map) {
        if (value.expire <= now) map.delete(token)
    }
}, CLEANUP_INTERVAL)
cleanupTimer.unref?.()

export default {
    create(gin: number) {
        const token = randomUUID()
        map.set(token, {
            gin,
            expire: Date.now() + TOKEN_TTL,
        })
        return token
    },
    verify(token: string) {
        const res = map.get(token)
        if (!res) return false
        if (res.expire <= Date.now()) {
            map.delete(token)
            return false
        }
        return res.gin
    },
}
