import {GroupRole} from 'oicq'
import ui from './ui'
import {getGroupMemberInfo, getUin} from '../ipc/botAndStorage'

let cachedRoomId: number
let cachedStatus: GroupRole

export default async () => {
    if (ui.getSelectedRoomId() > -1)
        return false
    if (ui.getSelectedRoomId() === cachedRoomId)
        return cachedStatus === 'owner' || cachedStatus === 'admin'
    const memberInfo = await getGroupMemberInfo(-ui.getSelectedRoomId(), getUin(), false)
    cachedStatus = memberInfo?.role
    cachedRoomId = ui.getSelectedRoomId()
    return cachedStatus === 'owner' || cachedStatus === 'admin'
}
