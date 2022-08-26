import { v4 as uuid } from 'uuid'

//token，{群号，到期时间}
const map = new Map<string, { gin: number; expire: number }>()

export default {
    create(gin: number) {
        const token = uuid()
        map.set(token, {
            gin,
            expire: new Date().getTime() + 1000 * 60 * 60,
        })
        return token
    },
    verify(token: string) {
        const res = map.get(token)
        if (!res) return false
        // map.delete(token)
        if (new Date().getTime() > res.expire) return false
        return res.gin
    },
}
