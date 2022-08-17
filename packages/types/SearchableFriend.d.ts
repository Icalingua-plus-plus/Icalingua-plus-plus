import { FriendInfo } from 'oicq-icalingua-plus-plus'

export default interface SearchableFriend extends FriendInfo {
    sc: string
    uin: number
    nick: string
    remark: string
}
