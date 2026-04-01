import net from 'net'
import fs from 'fs'
import Room from '@icalingua/types/Room'
import { getConfig } from './configManager'
import { tryToShowMainWindow } from './windowManager'
import ui from './ui'

const SOCKET_PATH = '/tmp/icalingua-noctalia.sock'

let server: net.Server | null = null
const clients = new Set<net.Socket>()
let lastState = ''
let debounceTimer: ReturnType<typeof setTimeout> | null = null

let currentUin = 0
let currentNickname = ''
let currentRooms: Room[] = []

export function startNoctaliaServer() {
    if (fs.existsSync(SOCKET_PATH)) {
        try {
            fs.unlinkSync(SOCKET_PATH)
        } catch (e) {
            console.error('[NoctaliaServer] Failed to remove stale socket:', e)
            return
        }
    }

    server = net.createServer((socket) => {
        clients.add(socket)
        if (lastState) {
            socket.write(lastState + '\n')
        }
        let buf = ''
        socket.on('data', (data) => {
            buf += data.toString()
            let newlineIdx: number
            while ((newlineIdx = buf.indexOf('\n')) !== -1) {
                const line = buf.slice(0, newlineIdx).trim()
                buf = buf.slice(newlineIdx + 1)
                if (line) handleCommand(line)
            }
        })
        socket.on('close', () => clients.delete(socket))
        socket.on('error', () => clients.delete(socket))
    })

    server.on('error', (err) => {
        console.error('[NoctaliaServer] Server error:', err)
    })

    server.listen(SOCKET_PATH, () => {
        try {
            fs.chmodSync(SOCKET_PATH, 0o777)
        } catch (e) {}
        console.log('[NoctaliaServer] Listening on', SOCKET_PATH)
    })
}

export function stopNoctaliaServer() {
    if (debounceTimer) clearTimeout(debounceTimer)
    for (const client of clients) {
        client.destroy()
    }
    clients.clear()
    if (server) {
        server.close()
        server = null
    }
    if (fs.existsSync(SOCKET_PATH)) {
        try {
            fs.unlinkSync(SOCKET_PATH)
        } catch (e) {}
    }
}

export function updateNoctaliaOnlineData(uin: number, nickname: string) {
    currentUin = uin
    currentNickname = nickname
    debouncedBroadcast()
}

export function updateNoctaliaRooms(rooms: Room[]) {
    currentRooms = rooms
    debouncedBroadcast()
}

export function updateNoctaliaRoom(room: Room) {
    const idx = currentRooms.findIndex((r) => r.roomId === room.roomId)
    if (idx >= 0) {
        Object.assign(currentRooms[idx], room)
    } else {
        currentRooms.push(room)
    }
    debouncedBroadcast()
}

function debouncedBroadcast() {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(broadcast, 100)
}

function handleCommand(line: string) {
    try {
        const cmd = JSON.parse(line)
        if (cmd.action === 'open' && cmd.roomId != null) {
            tryToShowMainWindow(() => {
                ui.chroom(cmd.roomId)
            })
        }
    } catch (e) {}
}

function broadcast() {
    if (clients.size === 0) return

    const priority = getConfig().priority
    const unreadRooms = currentRooms
        .filter((r) => r.unreadCount > 0 && r.priority >= priority)
        .sort((a, b) => b.priority - a.priority || b.utime - a.utime)
        .map((r) => ({
            roomId: r.roomId,
            roomName: r.roomName,
            unreadCount: r.unreadCount,
            priority: r.priority,
            at: r.at,
            lastMessage: r.lastMessage,
        }))

    const state = JSON.stringify({
        uin: currentUin,
        nickname: currentNickname,
        unreadCount: unreadRooms.length,
        rooms: unreadRooms,
    })

    if (state === lastState) return
    lastState = state

    const payload = state + '\n'
    for (const client of clients) {
        try {
            client.write(payload)
        } catch (e) {
            clients.delete(client)
        }
    }
}
