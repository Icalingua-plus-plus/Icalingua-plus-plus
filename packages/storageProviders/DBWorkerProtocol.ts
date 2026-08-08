export type DBWorkerTargetKind = 'sql' | 'search'

export interface SerializedDBWorkerError {
    name: string
    message: string
    stack?: string
    code?: string | number
}

export interface DBWorkerRequest {
    type: 'request'
    id: number
    action: 'create' | 'call' | 'dispose'
    targetId: string
    kind?: DBWorkerTargetKind
    method?: string
    args?: unknown[]
}

export interface DBWorkerResponse {
    type: 'response'
    id: number
    result?: unknown
    error?: SerializedDBWorkerError
}

export interface DBWorkerCallbackRequest {
    type: 'callback'
    id: number
    targetId: string
    name: string
    args: unknown[]
}

export interface DBWorkerCallbackResponse {
    type: 'callbackResponse'
    id: number
    result?: unknown
    error?: SerializedDBWorkerError
}

export interface DBWorkerEvent {
    type: 'event'
    targetId: string
    name: string
    payload?: unknown
}

export type DBWorkerIncomingMessage = DBWorkerResponse | DBWorkerCallbackRequest | DBWorkerEvent
export type DBWorkerOutgoingMessage = DBWorkerRequest | DBWorkerCallbackResponse

export const serializeDBWorkerError = (value: unknown): SerializedDBWorkerError => {
    const error = value instanceof Error ? value : new Error(String(value))
    const code = (value as any)?.code
    return {
        name: error.name || 'Error',
        message: error.message || String(value),
        stack: error.stack,
        ...(code === undefined ? {} : { code }),
    }
}

export const deserializeDBWorkerError = (value: SerializedDBWorkerError): Error => {
    const error = new Error(value?.message || 'DB Worker error')
    error.name = value?.name || 'Error'
    if (value?.stack) error.stack = value.stack
    if (value?.code !== undefined) (error as any).code = value.code
    return error
}
