import Message from './Message'

export interface MsgTableName {
    id: number
    tableName: string
}

export interface DBVersion {
    dbVersion: number
}

export interface MessageInSQLDB extends Message {
    roomId: number | string
}

export interface MessageSearchGram {
    gram: string
    messageId: string
    roomId: number | string
    senderId: string
    time: number
}

export interface MessageSearchPending {
    messageId: string
    roomId: number | string
    needsRebuild?: boolean | number
}

export interface SQLiteSearchMetadata {
    localRowId: number
    messageId: string
    roomId: number | string
    senderId?: string
    time: number
}

export interface SQLiteSearchPending {
    messageId: string
    roomId: number | string
    needsRebuild?: boolean | number
}
