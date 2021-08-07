import {randomUUID} from 'crypto'

let activeToken: string

export default {
    create() {
        activeToken = randomUUID()
        return activeToken
    },
    verify(token: string) {
        if (!token)
            return false
        if (token === activeToken) {
            activeToken = null
            return true
        }
        return false
    },
}
