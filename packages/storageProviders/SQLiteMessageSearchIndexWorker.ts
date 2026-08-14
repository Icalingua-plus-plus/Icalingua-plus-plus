import type {
    SQLiteMessageSearchIndexCallbacks,
    SQLiteMessageSearchTimesOptions,
    SQLiteSearchMessage,
} from './SQLiteMessageSearchIndex'
import { getDBWorkerClient } from './DBWorkerClient'
import { deserializeDBWorkerError, SerializedDBWorkerError } from './DBWorkerProtocol'
import {
    readSQLiteMessageSearchSource,
    sqliteMessageSearchSourceMethod,
    type SQLiteMessageSearchSourceRequest,
} from './SQLiteMessageSearchSource'

export type {
    SQLiteMessageSearchIndexCallbacks,
    SQLiteMessageSearchTimesOptions,
    SQLiteSearchMessage,
    SQLiteSearchTimeCount,
} from './SQLiteMessageSearchIndex'

interface SearchIndexStatus {
    available: boolean
    ready: boolean
    rebuilding: boolean
}

export default class SQLiteMessageSearchIndexWorker {
    private readonly callbacks: SQLiteMessageSearchIndexCallbacks
    private readonly errorHandle: (error: unknown) => void
    private readonly worker = getDBWorkerClient()
    private readonly targetPromise: Promise<string | null>
    private available = false
    private ready = false
    private rebuilding = false
    private closed = false

    constructor(
        filePath: string,
        callbacks: SQLiteMessageSearchIndexCallbacks,
        errorHandle: (error: unknown) => void = console.error,
    ) {
        this.callbacks = callbacks
        this.errorHandle = errorHandle
        this.targetPromise = this.worker
            .createTarget(
                'search',
                [
                    filePath,
                    {
                        loadMessageTimeCounts: Boolean(callbacks.loadMessageTimeCounts),
                        countMessages: Boolean(callbacks.countMessages),
                        buildBatchSize: callbacks.buildBatchSize,
                        validationBatchSize: callbacks.validationBatchSize,
                    },
                ],
                {
                    [sqliteMessageSearchSourceMethod]: (request: SQLiteMessageSearchSourceRequest) =>
                        readSQLiteMessageSearchSource(callbacks, request),
                },
                (name, payload) => this.handleEvent(name, payload),
            )
            .catch((error) => {
                this.errorHandle(error)
                return null
            })
    }

    get isAvailable(): boolean {
        return this.available
    }

    get isReady(): boolean {
        return this.available && this.ready
    }

    get isRebuilding(): boolean {
        return this.rebuilding
    }

    async open(): Promise<void> {
        await this.call<void>('open')
    }

    async close(): Promise<void> {
        if (this.closed) return
        this.closed = true
        this.available = false
        this.ready = false
        this.rebuilding = false
        const targetId = await this.targetPromise
        if (!targetId) return
        try {
            await this.worker.disposeTarget(targetId)
        } catch (error) {
            this.errorHandle(error)
        }
    }

    async getState(key: string): Promise<string | undefined> {
        return this.call<string | undefined>('getState', [key])
    }

    async setState(key: string, value: string): Promise<void> {
        await this.call<void>('setState', [key, value])
    }

    async queueMessages(messages: SQLiteSearchMessage[], needsRebuild = false): Promise<void> {
        await this.call<void>('queueMessages', [messages, needsRebuild])
    }

    async requestRebuild(times?: number | number[]): Promise<void> {
        await this.call<void>('requestRebuild', [times])
    }

    async syncMessages(messages: SQLiteSearchMessage[]): Promise<void> {
        await this.call<void>('syncMessages', [messages])
    }

    async searchTimes(keyword: string, options: SQLiteMessageSearchTimesOptions): Promise<number[] | null> {
        return (await this.call<number[] | null>('searchTimes', [keyword, options])) ?? null
    }

    async validate(): Promise<void> {
        await this.call<void>('validate')
    }

    private async call<T>(method: string, args: unknown[] = []): Promise<T | undefined> {
        if (this.closed) return undefined
        const targetId = await this.targetPromise
        if (!targetId) return undefined
        try {
            return await this.worker.callTarget<T>(targetId, method, args)
        } catch (error) {
            this.errorHandle(error)
            return undefined
        }
    }

    private handleEvent(name: string, payload: unknown): void {
        if (name === 'status') {
            const status = payload as SearchIndexStatus
            this.available = status.available
            this.ready = status.ready
            this.rebuilding = status.rebuilding
            return
        }
        if (name === 'progress') {
            this.callbacks.reportProgress?.(payload as any)
            return
        }
        if (name === 'error') this.errorHandle(deserializeDBWorkerError(payload as SerializedDBWorkerError))
    }
}
