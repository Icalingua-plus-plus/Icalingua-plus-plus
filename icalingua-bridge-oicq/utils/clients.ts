import Message from '@icalingua/types/Message'
import OnlineData from '@icalingua/types/OnlineData'
import Room from '@icalingua/types/Room'
import { broadcast, broadcastRoomSettings, getLegacyRoomSettingsTarget } from '../providers/socketIoProvider'
import ChatGroup from '@icalingua/types/ChatGroup'
import StorageProvider from '@icalingua/types/StorageProvider'
import type { Socket } from 'socket.io'

type SnapshotTarget = Pick<Socket, 'emit'>

const send = (channel: string, data: unknown, target?: SnapshotTarget) => {
    if (target) target.emit(channel, data)
    else broadcast(channel, data)
}

const readState = { unreadCount: 0, at: false, atMessageId: null }
interface PendingRoomSnapshot {
    rooms?: Room[]
    changes: Map<number, Room | typeof readState>
}
const roomSnapshots = new Set<PendingRoomSnapshot>()
let publishedChatGroups: ChatGroup[]
let chatGroupRevision = 0
let roomRefreshRevision = 0

const withRoomSnapshot = async (storage: StorageProvider, publish: (rooms: Room[]) => void) => {
    const snapshot: PendingRoomSnapshot = { changes: new Map() }
    roomSnapshots.add(snapshot)
    try {
        const rooms = await storage.getAllRooms()
        const base = snapshot.rooms ?? rooms
        if (!snapshot.changes.size) return publish(base)
        // Live events can reach the socket while the database still returns an older state.
        const byId = new Map(base.map((room) => [room.roomId, room]))
        for (const [id, change] of snapshot.changes) {
            const room = byId.get(id)
            if ('roomId' in change) byId.set(id, change)
            else if (room) byId.set(id, { ...room, ...change })
        }
        publish([...byId.values()].sort((a, b) => b.utime - a.utime))
    } finally {
        roomSnapshots.delete(snapshot)
    }
}

const rememberRoomChange = (room: Room) => {
    for (const { changes } of roomSnapshots) changes.set(room.roomId, { ...room })
}

const clients = {
    updateRoom(room: Room) {
        rememberRoomChange(room)
        broadcast('updateRoom', room)
    },
    async updateRoomSettings(storage: StorageProvider, roomId: number, changes: Partial<Room>) {
        await storage.updateRoom(roomId, changes)
        const room = await storage.getRoom(roomId)
        if (!room) return
        rememberRoomChange(room)
        broadcastRoomSettings(room)
        const legacy = getLegacyRoomSettingsTarget()
        if (legacy) {
            void withRoomSnapshot(storage, (rooms) => send('setAllRooms', rooms, legacy)).catch(console.error)
        }
        return room
    },
    async applyRoomUpdate(storage: StorageProvider, roomId: number, changes: Partial<Room>) {
        if (!storage) return
        if (changes?.unreadCount === 0 && changes.at === false && changes.atMessageId === null) {
            return clients.clearRoomUnread(storage, roomId)
        }
        if (changes?.unreadCount > 0) return clients.updateRoomSettings(storage, roomId, changes)
        return storage.updateRoom(roomId, changes)
    },
    async clearRoomUnread(storage: StorageProvider, roomId: number) {
        await storage.updateRoom(roomId, readState)
        clients.syncRead(roomId)
    },
    addMessage(roomId: number, message: Message) {
        broadcast('addMessage', { roomId, message })
    },
    deleteMessage(messageId: string) {
        broadcast('deleteMessage', messageId)
    },
    setOnline() {
        broadcast('setOnline')
    },
    setOffline(message: string) {
        broadcast('setOffline', message)
    },
    sendOnlineData(data: OnlineData, target?: Socket) {
        send('onlineData', data, target)
    },
    setShutUp(isShutUp: boolean) {
        broadcast('setShutUp', isShutUp)
    },
    message(msg: string) {
        broadcast('message', msg)
    },
    messageError(msg: string) {
        broadcast('messageError', msg)
    },
    messageSuccess(msg: string) {
        broadcast('messageSuccess', msg)
    },
    setAllRooms(rooms: Room[]) {
        for (const snapshot of roomSnapshots) {
            snapshot.rooms = rooms
            snapshot.changes.clear()
        }
        broadcast('setAllRooms', rooms)
    },
    async refreshRooms(storage: StorageProvider) {
        const revision = ++roomRefreshRevision
        await withRoomSnapshot(storage, (rooms) => {
            if (revision === roomRefreshRevision) clients.setAllRooms(rooms)
        })
    },
    async refreshChatGroups(storage: StorageProvider) {
        const revision = ++chatGroupRevision
        const groups = await storage.getAllChatGroups()
        if (revision !== chatGroupRevision) return
        publishedChatGroups = groups
        broadcast('setAllChatGroups', groups)
    },
    async sendRoomSnapshot(storage: StorageProvider, target?: Socket) {
        const lastPublished = publishedChatGroups
        await Promise.all([
            withRoomSnapshot(storage, (rooms) => send('setAllRooms', rooms, target)),
            storage.getAllChatGroups().then((groups) => {
                send('setAllChatGroups', publishedChatGroups === lastPublished ? groups : publishedChatGroups, target)
            }),
        ])
    },
    closeLoading() {
        broadcast('closeLoading')
    },
    notifyError(msg: { title: string; message: string }) {
        broadcast('notifyError', msg)
    },
    renewMessage(roomId: number, messageId: string, message: Partial<Message>) {
        broadcast('renewMessage', { roomId, messageId, message })
    },
    renewMessageURL(messageId: string | number, URL: string) {
        broadcast('renewMessageURL', { messageId, URL })
    },
    setMessages(roomId: number, messages: Message[]) {
        broadcast('setMessages', { roomId, messages })
    },
    sendAddRequest(data) {
        broadcast('sendAddRequest', data)
    },
    syncRead(roomId: number) {
        for (const { changes } of roomSnapshots) {
            changes.set(roomId, { ...changes.get(roomId), ...readState })
        }
        broadcast('syncRead', roomId)
    },
    addMessageText(text: string) {
        broadcast('addMessageText', text)
    },
    notify(data: { title: string; message: string }) {
        broadcast('notifyMessage', data)
    },
}

export default clients
