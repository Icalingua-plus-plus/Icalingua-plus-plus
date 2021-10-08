import {randomUUID} from 'crypto'

//token，{群号，到期时间}
const map = new Map<string, { gin: number, expire: number }>()

export default {
    create(gin: number) {
        const token = randomUUID()
        map.set(token, {
            gin,
            //有效期一分钟
            expire: new Date().getTime() + 1000 * 60,
        })
        return token
    },
    verify(token: string) {
        const res = map.get(token)
        if (!res)
            return false
        map.delete(token)
        if (new Date().getTime() > res.expire)
            return false
        return res.gin
    },
}
