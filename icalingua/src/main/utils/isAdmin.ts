import { GroupRole } from 'oicq-icalingua-plus-plus'
import ui from './ui'
import { getGroupMemberInfo, getUin } from '../ipc/botAndStorage'

let cachedRoomId: number
let cachedStatus: GroupRole

export default async (roomId = 0) => {
    if (roomId === 0) roomId = ui.getSelectedRoomId()
    if (roomId > -1) return false
    if (roomId === cachedRoomId) return cachedStatus === 'member' || !cachedStatus ? false : cachedStatus
    const memberInfo = await getGroupMemberInfo(-roomId, getUin(), false)
    cachedStatus = memberInfo?.role
    cachedRoomId = roomId
    return cachedStatus === 'member' || !cachedStatus ? false : cachedStatus
}
