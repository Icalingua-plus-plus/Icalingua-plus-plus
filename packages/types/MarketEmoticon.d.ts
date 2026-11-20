export interface MarketEmoticonPackSummary {
    id: number
    type: number
    name: string
    cover: string
}

export interface MarketEmoticonSearchPage {
    packs: MarketEmoticonPackSummary[]
    nextCursor: string
}

export interface MarketEmoticonItem {
    id: string
    name: string
    thumbnail: string
    url: string
}

export interface MarketEmoticonPack extends MarketEmoticonPackSummary {
    description: string
    items: MarketEmoticonItem[]
}
