export interface StickerSearchItem {
    url: string
    thumbnail: string
}

export interface StickerSearchPage {
    items: StickerSearchItem[]
    nextCursor: string
}
