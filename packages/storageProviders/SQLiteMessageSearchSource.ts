import type {
    SQLiteMessageSearchIndexCallbacks,
    SQLiteSearchMessage,
    SQLiteSearchTimeCount,
} from './SQLiteMessageSearchIndex'

export const sqliteMessageSearchSourceMethod = 'readMessageSearchSource'

export type SQLiteMessageSearchSourceRequest =
    | { operation: 'loadTimes'; afterTime: number; limit: number }
    | { operation: 'loadMessagesByTimes'; times: number[] }
    | { operation: 'loadMessageTimeCounts'; afterTime: number; limit: number }
    | { operation: 'countMessages' }

export type SQLiteMessageSearchSourceResult = number | number[] | SQLiteSearchMessage[] | SQLiteSearchTimeCount[]

export type SQLiteMessageSearchSourceReader = (
    request: SQLiteMessageSearchSourceRequest,
) => Promise<SQLiteMessageSearchSourceResult>

type SQLiteMessageSearchSourceCallbacks = Pick<
    SQLiteMessageSearchIndexCallbacks,
    'loadTimes' | 'loadMessagesByTimes' | 'loadMessageTimeCounts' | 'countMessages'
>

export interface SQLiteMessageSearchSourceCallbackOptions {
    loadMessageTimeCounts?: boolean
    countMessages?: boolean
}

export const createSQLiteMessageSearchSourceCallbacks = (
    read: SQLiteMessageSearchSourceReader,
    options: SQLiteMessageSearchSourceCallbackOptions = {
        loadMessageTimeCounts: true,
        countMessages: true,
    },
): SQLiteMessageSearchSourceCallbacks => {
    const callbacks: SQLiteMessageSearchSourceCallbacks = {
        loadTimes: (afterTime, limit) => read({ operation: 'loadTimes', afterTime, limit }) as Promise<number[]>,
        loadMessagesByTimes: (times) =>
            read({ operation: 'loadMessagesByTimes', times }) as Promise<SQLiteSearchMessage[]>,
    }
    if (options.loadMessageTimeCounts) {
        callbacks.loadMessageTimeCounts = (afterTime, limit) =>
            read({ operation: 'loadMessageTimeCounts', afterTime, limit }) as Promise<SQLiteSearchTimeCount[]>
    }
    if (options.countMessages) {
        callbacks.countMessages = () => read({ operation: 'countMessages' }) as Promise<number>
    }
    return callbacks
}

export const readSQLiteMessageSearchSource = (
    callbacks: SQLiteMessageSearchSourceCallbacks,
    request: SQLiteMessageSearchSourceRequest,
): Promise<SQLiteMessageSearchSourceResult> => {
    switch (request.operation) {
        case 'loadTimes':
            return callbacks.loadTimes(request.afterTime, request.limit)
        case 'loadMessagesByTimes':
            return callbacks.loadMessagesByTimes(request.times)
        case 'loadMessageTimeCounts':
            if (!callbacks.loadMessageTimeCounts) throw new Error('Message search time-count reader is unavailable')
            return callbacks.loadMessageTimeCounts(request.afterTime, request.limit)
        case 'countMessages':
            if (!callbacks.countMessages) throw new Error('Message search count reader is unavailable')
            return callbacks.countMessages()
    }
}
