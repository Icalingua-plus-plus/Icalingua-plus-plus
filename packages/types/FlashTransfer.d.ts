import type {
    FlashTransfer,
    FlashTransferCreateOptions,
    FlashTransferMetadata,
    FlashTransferTask,
    FlashTransferFile as NativeFlashTransferFile,
    FlashTransferUploadSource,
    FlashTransferUploadCredential,
} from 'oicq-icalingua-plus-plus'
export type FlashTransferUploadTicket = Awaited<ReturnType<FlashTransfer['applyUpload']>>

export interface FlashTransferEntry {
    relative_path: string
    source_path?: string
    is_dir: boolean
    size: number
}

export interface FlashTransferFile {
    name: string
    cli_fileid: string
    srv_fileid?: string
    fileset_id?: string
    parent_id?: string
    is_dir: boolean
    file_size: number | string
    file_type?: number
    sha1?: string
    physical?: { id: string; status?: number }
    relative_path?: string
}

export interface FlashTransferRecord {
    fileset_id: string
    name: string
    share_link: string
    file_count: number
    total_size: number
    expire_time: number
    created_at: number
    saved_at: number
    last_shared_at?: number
}

export interface FlashTransferDownload {
    path: string
    url: string
    size: number
    sha1?: string
}

export interface FlashTransferRequest {
    action:
        | 'capabilities'
        | 'resolve'
        | 'stat'
        | 'list'
        | 'urls'
        | 'upload'
        | 'send'
        | 'create'
        | 'add_files'
        | 'apply_upload'
        | 'complete_file'
        | 'submit'
        | 'release_upload'
    task?: FlashTransferTask
    task_id?: string
    metadata?: FlashTransferMetadata[]
    metadata_offset?: number
    metadata_total?: number
    file?: NativeFlashTransferFile
    source?: FlashTransferUploadSource
    options?: FlashTransferCreateOptions
    upload_id?: string
    /** 仅用于 Bridge 进程内传递，Socket 请求使用 upload_id。 */
    ticket?: FlashTransferUploadTicket
    request_id?: string
    input?: string
    fileset_id?: string
    parent_id?: string
    entries?: FlashTransferEntry[]
    name?: string
    files?: FlashTransferFile[]
    prefix?: string
    target?: number | string
    group?: boolean
}

export interface FlashTransferResponse<T = any> {
    ok: boolean
    data?: T
    error?: string
    code?: number
}

export type FlashTransferUploadInput =
    { file: string; name: string } | { name: string; children: FlashTransferUploadInput[] }

export interface FlashTransferRemoteUpload extends FlashTransferUploadCredential {
    upload_id: string
}

export interface FlashTransferProtocolClient {
    uin?: number
    acquireFlashTransfer(options?: { timeout?: number }): {
        create: FlashTransfer['create']
        addFiles: FlashTransfer['addFiles']
        applyUpload: FlashTransfer['applyUpload']
        completeFile: FlashTransfer['completeFile']
        submit: FlashTransfer['submit']
        resolve(input: string): Promise<string>
        stat(fileset_id: string): Promise<Record<string, any>>
        files(fileset_id: string, parent_id?: string): AsyncIterable<FlashTransferFile>
        getDownloadUrls(files: FlashTransferFile[]): Promise<{ url: string }[]>
        upload(
            files: FlashTransferUploadInput[],
            name?: string,
            callback?: (progress: string) => void,
        ): Promise<Record<string, any>>
        send(fileset_id: string, target: { type: 'private' | 'group'; target: number | string }): Promise<unknown>
    }
}
