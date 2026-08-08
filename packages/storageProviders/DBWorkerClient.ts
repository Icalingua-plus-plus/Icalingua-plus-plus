import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { Worker } from 'worker_threads'
import {
    DBWorkerCallbackResponse,
    DBWorkerIncomingMessage,
    DBWorkerOutgoingMessage,
    DBWorkerRequest,
    DBWorkerTargetKind,
    deserializeDBWorkerError,
    serializeDBWorkerError,
} from './DBWorkerProtocol'

type DBWorkerCallback = (...args: any[]) => any
type DBWorkerEventHandler = (name: string, payload: unknown) => void

interface PendingRequest {
    resolve: (value: any) => void
    reject: (error: Error) => void
}

const resolveDBWorker = (): { filename: string; eval?: boolean } => {
    const override = process.env.ICALINGUA_DB_WORKER_PATH
    const candidates = [
        override,
        path.join(__dirname, 'dbWorker.js'),
        path.join(__dirname, 'DBWorkerEntry.js'),
        path.join(__dirname, 'build', 'DBWorkerEntry.js'),
    ].filter(Boolean) as string[]
    for (const filename of candidates) {
        if (fs.existsSync(filename)) return { filename }
    }

    const sourceEntry = path.join(__dirname, 'DBWorkerEntry.ts')
    if (fs.existsSync(sourceEntry)) {
        return {
            filename: [
                `process.env.TS_NODE_PROJECT = ${JSON.stringify(path.join(__dirname, 'tsconfig.json'))}`,
                "require('ts-node/register/transpile-only')",
                `require(${JSON.stringify(sourceEntry)})`,
            ].join('; '),
            eval: true,
        }
    }
    throw new Error(`Cannot find DB Worker entry. Checked: ${candidates.join(', ')}`)
}

export default class DBWorkerClient {
    private readonly worker: Worker
    private readonly pending = new Map<number, PendingRequest>()
    private readonly callbacks = new Map<string, Record<string, DBWorkerCallback>>()
    private readonly eventHandlers = new Map<string, DBWorkerEventHandler>()
    private nextRequestId = 1
    private closed = false

    constructor() {
        const entry = resolveDBWorker()
        this.worker = new Worker(entry.filename, {
            eval: entry.eval,
            name: 'icalingua-db-worker',
        })
        this.worker.on('message', (message: DBWorkerIncomingMessage) => this.handleMessage(message))
        this.worker.on('error', (error) => this.fail(error))
        this.worker.on('exit', (code) => {
            if (!this.closed) this.fail(new Error(`DB Worker exited unexpectedly with code ${code}`))
        })
        this.worker.unref()
    }

    get isClosed(): boolean {
        return this.closed
    }

    async createTarget(
        kind: DBWorkerTargetKind,
        args: unknown[],
        callbacks: Record<string, DBWorkerCallback> = {},
        eventHandler?: DBWorkerEventHandler,
    ): Promise<string> {
        const targetId = randomUUID()
        this.callbacks.set(targetId, callbacks)
        if (eventHandler) this.eventHandlers.set(targetId, eventHandler)
        try {
            await this.request({ action: 'create', targetId, kind, args })
            return targetId
        } catch (error) {
            this.callbacks.delete(targetId)
            this.eventHandlers.delete(targetId)
            throw error
        }
    }

    callTarget<T>(targetId: string, method: string, args: unknown[] = []): Promise<T> {
        return this.request<T>({ action: 'call', targetId, method, args })
    }

    async disposeTarget(targetId: string): Promise<void> {
        try {
            await this.request({ action: 'dispose', targetId })
        } finally {
            this.callbacks.delete(targetId)
            this.eventHandlers.delete(targetId)
        }
    }

    private request<T = void>(request: Omit<DBWorkerRequest, 'type' | 'id'>): Promise<T> {
        if (this.closed) return Promise.reject(new Error('DB Worker is not running'))
        const id = this.nextRequestId++
        this.worker.ref()
        return new Promise<T>((resolve, reject) => {
            this.pending.set(id, { resolve, reject })
            try {
                const message: DBWorkerOutgoingMessage = { type: 'request', id, ...request }
                this.worker.postMessage(message)
            } catch (error) {
                this.pending.delete(id)
                if (!this.pending.size) this.worker.unref()
                reject(error as Error)
            }
        })
    }

    private handleMessage(message: DBWorkerIncomingMessage): void {
        if (message.type === 'response') {
            const pending = this.pending.get(message.id)
            if (!pending) return
            this.pending.delete(message.id)
            if (!this.pending.size) this.worker.unref()
            if (message.error) pending.reject(deserializeDBWorkerError(message.error))
            else pending.resolve(message.result)
            return
        }
        if (message.type === 'event') {
            try {
                this.eventHandlers.get(message.targetId)?.(message.name, message.payload)
            } catch {
                // Event consumers (usually progress callbacks) must not break DB RPC.
            }
            return
        }
        if (message.type === 'callback') void this.handleCallback(message)
    }

    private async handleCallback(message: Extract<DBWorkerIncomingMessage, { type: 'callback' }>): Promise<void> {
        const callback = this.callbacks.get(message.targetId)?.[message.name]
        let response: DBWorkerCallbackResponse
        try {
            if (!callback) throw new Error(`Unknown DB Worker callback: ${message.name}`)
            response = { type: 'callbackResponse', id: message.id, result: await callback(...message.args) }
        } catch (error) {
            response = { type: 'callbackResponse', id: message.id, error: serializeDBWorkerError(error) }
        }
        try {
            this.worker.postMessage(response)
        } catch {
            // A worker exit is handled by the worker error/exit listeners.
        }
    }

    private fail(error: Error): void {
        if (this.closed) return
        this.closed = true
        for (const pending of this.pending.values()) pending.reject(error)
        this.pending.clear()
        this.worker.unref()
    }
}

let sharedDBWorker: DBWorkerClient | null = null

export const getDBWorkerClient = (): DBWorkerClient => {
    if (!sharedDBWorker || sharedDBWorker.isClosed) sharedDBWorker = new DBWorkerClient()
    return sharedDBWorker
}
