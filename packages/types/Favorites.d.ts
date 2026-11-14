/** QQ 收藏管理器的数据模型，时间和大整数沿用协议返回值。 */
export type FavoriteInteger = number | string

export interface FavoritePicture {
    uri?: string
    name?: string
    note?: string
    pic_id?: string
    width?: number
    height?: number
    size?: number
    md5?: string
    sha1?: string
}

export interface FavoriteFile {
    fid?: string
    name?: string
    size?: FavoriteInteger
    md5?: string
    sha1?: string
    category?: number
}

export interface FavoriteSummary {
    text_summary?: { brief?: string }
    link_summary?: { uri?: string; title?: string; publisher?: string; brief?: string; pic_list?: FavoritePicture[] }
    gallery_summary?: { notes?: string; pic_list?: FavoritePicture[] }
    audio_summary?: { duration?: number; stt?: string; note?: string }
    video_summary?: {
        title?: string
        duration?: number
        preview_pic_info?: FavoritePicture
        store_file_info?: FavoriteFile
    }
    file_summary?: { file_info?: FavoriteFile; src_file_info?: FavoriteFile }
    location_summary?: { name?: string; address?: string; latitude?: number; longitude?: number }
    rich_media_summary?: {
        title?: string
        sub_title?: string
        brief?: string
        original_uri?: string
        publisher?: string
        pic_list?: FavoritePicture[]
        content_type?: number
    }
}

export interface FavoriteCollection {
    cid: string
    /** 服务端原始类型：1 文本、2 链接、3 图片、4 语音、5 视频、6 文件、7 位置、8 富媒体、9 高清音频。 */
    type?: number
    /** 原始同步状态：1 为正常；2/3 等非正常记录不应作为收藏展示。 */
    status?: number
    author?: { num_id?: FavoriteInteger; str_id?: string; group_name?: string }
    summary?: FavoriteSummary
    create_time?: FavoriteInteger
    collect_time?: FavoriteInteger
    modify_time?: FavoriteInteger
    sequence?: FavoriteInteger
    custom_group_id?: number
    star_mark?: boolean
    category?: number
}

export interface FavoriteDetail {
    collection: FavoriteCollection
    content?: {
        text_content?: { data?: string }
        rich_media_content?: {
            raw_data?: string
            pic_list?: FavoritePicture[]
            file_list?: FavoriteFile[]
        }
    }
    html?: string
}

export interface FavoriteGroup {
    custom_group_id: number
    name: string
    total_count?: number
}

export interface FavoritePage {
    collection_list: FavoriteCollection[]
    total_count?: number
    result?: number
}

export interface FavoriteListOptions {
    type?: number
    bid?: number
    category?: number
    start_time?: number
    start_pos?: number
    page_size?: number
    order_type?: 0 | 1
    sync_policy?: number
}

export interface FavoriteInput {
    type: 'text' | 'link' | 'rich'
    text?: string
    html?: string
    url?: string
    title?: string
    brief?: string
    publisher?: string
    custom_group_id?: number
}

export interface FavoriteChanges {
    text?: string
    html?: string
    url?: string
    title?: string
    brief?: string
    publisher?: string
    custom_group_id?: number
    star_mark?: boolean
}

export interface FavoriteItemResults {
    success: boolean
    results: { id: string | number; result: number }[]
}

export type FavoriteAction =
    'list' | 'get' | 'add' | 'edit' | 'delete' | 'groups' | 'addGroup' | 'editGroup' | 'deleteGroup' | 'move' | 'space'

/** 收藏请求仅允许上述动作，由直连和 Bridge 共用。 */
export interface FavoriteRequest {
    action: FavoriteAction
    options?: FavoriteListOptions
    cid?: string | string[]
    favorite?: FavoriteInput
    changes?: FavoriteChanges
    groupId?: number | number[]
    name?: string
}

/** 与 IPC、Socket.IO 均兼容的显式成功/失败结果。 */
export type FavoriteResponse<T = unknown> = { ok: true; data: T } | { ok: false; error: string; code?: number }

/** 只声明管理器所需能力，便于在旧协议库上返回可理解的错误。 */
export type FavoriteProtocolClient = Partial<
    Record<
        | 'getFavoriteList'
        | 'getFavorite'
        | 'addFavorite'
        | 'editFavorite'
        | 'deleteFavorite'
        | 'getFavoriteGroups'
        | 'addFavoriteGroup'
        | 'editFavoriteGroup'
        | 'deleteFavoriteGroup'
        | 'setFavoriteGroup'
        | 'getFavoriteSpace',
        (
            ...args: unknown[]
        ) => Promise<{ retcode: number; data?: unknown; error?: { message?: string; code?: number } }>
    >
>
