import { parentPort } from 'worker_threads'
import SQLStorageProvider, { type MessageSearchIndexFactory } from './SQLStorageProvider'
import SQLiteMessageSearchIndex from './SQLiteMessageSearchIndex'
import {
    DBWorkerCallbackRequest,
    DBWorkerCallbackResponse,
    DBWorkerEvent,
    DBWorkerRequest,
    DBWorkerResponse,
    DBWorkerTargetKind,
    SerializedDBWorkerError,
    deserializeDBWorkerError,
    serializeDBWorkerError,
} from './DBWorkerProtocol'

interface WorkerTarget {
    kind: DBWorkerTargetKind
    instance: any
    activeCalls: Set<Promise<unknown>>
    disposing: boolean
}

interface PendingCallback {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
}

const sqlMethods = new Set([
    'connect',
    'validateMessageSearchIndex',
    'addRoom',
    'updateRoom',
    'removeRoom',
    'getAllRooms',
    'getRoom',
    'addChatGroup',
    'updateChatGroup',
    'removeChatGroup',
    'getAllChatGroups',
    'getUnreadCount',
    'getFirstUnreadRoom',
    'getIgnoredChats',
    'isChatIgnored',
    'addIgnoredChat',
    'removeIgnoredChat',
    'addMessage',
    'updateMessage',
    'replaceMessage',
    'fetchMessages',
    'fetchMessagesBySender',
    'searchMessages',
    'fetchImageMessages',
    'getMessage',
    'fetchMessagesAround',
    'addMessages',
    'close',
])

const searchMethods = new Set([
    'open',
    'close',
    'getState',
    'setState',
    'queueMessages',
    'requestRebuild',
    'syncMessages',
    'searchTimes',
    'validate',
])

if (!parentPort) throw new Error('DBWorkerEntry must run in a Worker thread')

const targets = new Map<string, WorkerTarget>()
const pendingCallbacks = new Map<number, PendingCallback>()
let nextCallbackId = 1

const postEvent = (targetId: string, name: string, payload?: unknown): void => {
    const message: DBWorkerEvent = { type: 'event', targetId, name, payload }
    parentPort.postMessage(message)
}

const postErrorEvent = (targetId: string, error: unknown): void => {
    postEvent(targetId, 'error', serializeDBWorkerError(error))
}

const postTargetStatus = (targetId: string, target: WorkerTarget): void => {
    if (target.kind === 'search') {
        postEvent(targetId, 'status', {
            available: target.instance.isAvailable,
            ready: target.instance.isReady,
            rebuilding: target.instance.isRebuilding,
        })
        return
    }
    postEvent(targetId, 'messageSearchStatus', {
        ready: target.instance.isMessageSearchIndexReady(),
    })
}

const callParent = (targetId: string, name: string, args: unknown[]): Promise<unknown> => {
    const id = nextCallbackId++
    const message: DBWorkerCallbackRequest = { type: 'callback', id, targetId, name, args }
    return new Promise((resolve, reject) => {
        pendingCallbacks.set(id, { resolve, reject })
        try {
            parentPort.postMessage(message)
        } catch (error) {
            pendingCallbacks.delete(id)
            reject(error)
        }
    })
}

const createMessageSearchIndex: MessageSearchIndexFactory = (filePath, callbacks, errorHandle) =>
    new SQLiteMessageSearchIndex(filePath, callbacks, errorHandle)

const createTarget = (targetId: string, kind: DBWorkerTargetKind, args: unknown[]): WorkerTarget => {
    if (targets.has(targetId)) throw new Error(`DB Worker target already exists: ${targetId}`)
    if (kind === 'sql') {
        const [id, type, connectOpt] = args as ConstructorParameters<typeof SQLStorageProvider>
        if (type !== 'sqlite3') throw new Error(`Only SQLite SQL providers may run in DB Worker: ${type}`)
        let target: WorkerTarget
        const instance = new SQLStorageProvider(
            id,
            type,
            connectOpt,
            (error) => postErrorEvent(targetId, error),
            createMessageSearchIndex,
        )
        target = { kind, instance, activeCalls: new Set(), disposing: false }
        instance.onUpgradeProgress = (progress) => {
            postEvent(targetId, 'upgradeProgress', progress)
            postTargetStatus(targetId, target)
        }
        return target
    }

    const [filePath, callbackOptions] = args as [string, { loadMessageTimeCounts?: boolean; countMessages?: boolean }]
    let target: WorkerTarget
    const instance = new SQLiteMessageSearchIndex(
        filePath,
        {
            loadTimes: (afterTime, limit) => callParent(targetId, 'loadTimes', [afterTime, limit]) as Promise<number[]>,
            loadMessagesByTimes: (times) => callParent(targetId, 'loadMessagesByTimes', [times]) as any,
            ...(callbackOptions?.loadMessageTimeCounts
                ? {
                      loadMessageTimeCounts: (afterTime: number, limit: number) =>
                          callParent(targetId, 'loadMessageTimeCounts', [afterTime, limit]) as any,
                  }
                : {}),
            ...(callbackOptions?.countMessages
                ? { countMessages: () => callParent(targetId, 'countMessages', []) as Promise<number> }
                : {}),
            reportProgress: (progress) => {
                postEvent(targetId, 'progress', progress)
                if (target) postTargetStatus(targetId, target)
            },
        },
        (error) => postErrorEvent(targetId, error),
    )
    target = { kind, instance, activeCalls: new Set(), disposing: false }
    return target
}

const postResponse = (id: number, result?: unknown, error?: SerializedDBWorkerError): void => {
    const response: DBWorkerResponse = { type: 'response', id, result, error }
    try {
        parentPort.postMessage(response)
    } catch (postMessageError) {
        const fallback: DBWorkerResponse = {
            type: 'response',
            id,
            error: serializeDBWorkerError(postMessageError),
        }
        parentPort.postMessage(fallback)
    }
}

const handleRequest = async (request: DBWorkerRequest): Promise<void> => {
    try {
        if (request.action === 'create') {
            if (!request.kind) throw new Error('Missing DB Worker target kind')
            const target = createTarget(request.targetId, request.kind, request.args || [])
            targets.set(request.targetId, target)
            postTargetStatus(request.targetId, target)
            postResponse(request.id)
            return
        }

        const target = targets.get(request.targetId)
        if (!target) throw new Error(`Unknown DB Worker target: ${request.targetId}`)
        if (request.action === 'dispose') {
            target.disposing = true
            try {
                await Promise.allSettled(Array.from(target.activeCalls))
                await target.instance.close?.()
            } finally {
                targets.delete(request.targetId)
            }
            postResponse(request.id)
            return
        }

        const allowedMethods = target.kind === 'sql' ? sqlMethods : searchMethods
        if (!request.method || !allowedMethods.has(request.method)) {
            throw new Error(`Unsupported ${target.kind} DB Worker method: ${request.method}`)
        }
        if (target.disposing) throw new Error(`DB Worker target is closing: ${request.targetId}`)
        const method = target.instance[request.method]
        if (typeof method !== 'function') throw new Error(`Missing DB Worker method: ${request.method}`)
        const operation = Promise.resolve().then(() => method.apply(target.instance, request.args || []))
        target.activeCalls.add(operation)
        let result: unknown
        try {
            result = await operation
        } finally {
            target.activeCalls.delete(operation)
        }
        postTargetStatus(request.targetId, target)
        postResponse(request.id, result)
    } catch (error) {
        postResponse(request.id, undefined, serializeDBWorkerError(error))
    }
}

const handleCallbackResponse = (response: DBWorkerCallbackResponse): void => {
    const pending = pendingCallbacks.get(response.id)
    if (!pending) return
    pendingCallbacks.delete(response.id)
    if (response.error) pending.reject(deserializeDBWorkerError(response.error))
    else pending.resolve(response.result)
}

parentPort.on('message', (message: DBWorkerRequest | DBWorkerCallbackResponse) => {
    if (message.type === 'request') void handleRequest(message)
    else if (message.type === 'callbackResponse') handleCallbackResponse(message)
})
