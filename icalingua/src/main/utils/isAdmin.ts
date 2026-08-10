import { GroupRole } from 'oicq-icalingua-plus-plus'
import ui from './ui'
import { getGroupMemberInfo, getUin } from '../ipc/botAndStorage'

type AdminStatus = GroupRole | false

const adminStatusCache = new Map<number, AdminStatus>()
const adminStatusRequests = new Map<number, Promise<void>>()

const getRoomId = (roomId: number) => (roomId === 0 ? ui.getSelectedRoomId() : roomId)

const refreshAdminStatus = async (roomId: number): Promise<void> => {
    try {
        const memberInfo = await getGroupMemberInfo(-roomId, getUin(), false)
        adminStatusCache.set(
            roomId,
            memberInfo?.role === 'admin' || memberInfo?.role === 'owner' ? memberInfo.role : false,
        )
    } catch (error) {
        console.error(`Failed to refresh admin status for room ${roomId}:`, error)
    } finally {
        adminStatusRequests.delete(roomId)
    }
}

export default async (roomId = 0): Promise<AdminStatus> => {
    roomId = getRoomId(roomId)
    if (roomId > -1) return false

    const cachedStatus = adminStatusCache.get(roomId) || false
    if (!adminStatusRequests.has(roomId)) {
        const request = refreshAdminStatus(roomId)
        adminStatusRequests.set(roomId, request)
    }
    return cachedStatus
}
