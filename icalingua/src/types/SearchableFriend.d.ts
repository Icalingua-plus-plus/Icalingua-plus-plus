import { FriendInfo } from 'oicq'

export default interface SearchableFriend extends FriendInfo {
    sc: string
    uin: number
    nick: string
    remark: string
}
