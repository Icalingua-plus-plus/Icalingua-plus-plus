import axios from 'axios'
import { pb } from 'oicq-icalingua-plus-plus'
import type Adapter from '@icalingua/types/Adapter'
import type { MarketEmoticonPack, MarketEmoticonSearchPage } from '@icalingua/types/MarketEmoticon'

interface Parcel {
    id: string
    name: string
    mark: string
    type: number
    supportSize?: { Width: number; Height: number }[]
    imgs: { id: string; name: string }[]
}

/** 从 QQ 官方公开清单读取表情包及图片地址。 */
export async function getMarketEmoticonPack(id: number, type = 3): Promise<MarketEmoticonPack> {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('无效的 QQ 表情包 ID')
    if (type === 5) return getSmallEmoticonPack(id)
    const { data } = await axios.get<Parcel>('https://i.gtimg.cn/club/item/parcel/' + (id % 10) + '/' + id + '.json', {
        timeout: 15000,
        maxContentLength: 2 * 1024 * 1024,
    })
    if (Number(data?.id) !== id || !data.name || !Array.isArray(data.imgs))
        throw new Error('表情包不存在或清单格式无效')
    if (![1, 2, 3, 4].includes(data.type)) throw new Error('暂不支持此类型的表情包')
    const sizes = (data.supportSize || []).filter(
        (size) => Number.isInteger(size.Height) && size.Height > 0 && size.Height <= 300,
    )
    const height = sizes.length ? Math.max(...sizes.map((size) => size.Height)) : [1, 4].includes(data.type) ? 200 : 300
    const items = data.imgs.map((item) => {
        if (!/^[a-f0-9]{32}$/i.test(item.id)) throw new Error('表情包包含无效的图片 ID')
        const base = 'https://i.gtimg.cn/club/item/parcel/item/' + item.id.slice(0, 2) + '/' + item.id + '/'
        return {
            id: item.id,
            name: item.name || '',
            thumbnail: base + '126x126.png',
            url: base + 'raw' + height + (data.type === 2 ? '.png' : '.gif'),
        }
    })
    return {
        id,
        type: data.type,
        name: data.name,
        description: data.mark || '',
        cover: 'https://i.gtimg.cn/club/item/parcel/img/parcel/' + (id % 10) + '/' + id + '/200x200.png',
        items,
    }
}

interface MarketSearchError {
    ActionStatus?: string
    ErrorCode?: number | string
    ErrorInfo?: string
}

interface MarketSearchJson extends MarketSearchError {
    ret?: number
    msg?: string
    data?: MarketSearchData
    list?: MarketSearchRow[]
    page_session?: string
    is_end?: boolean
}

interface MarketSearchData extends MarketSearchError {
    is_end: boolean
    list: MarketSearchRow[]
    page_session?: string
}

interface MarketSearchRow {
    itemid: string | number
    name: string
    type?: number
    appid?: string | number
}

/** 使用商城 H5 的 JSAPI 命令搜索整包表情。 */
export async function searchMarketEmoticons(
    adapter: Pick<Adapter, 'sendPacket'>,
    keyword: string,
    cursor: string,
): Promise<MarketEmoticonSearchPage> {
    if (typeof keyword !== 'string' || !keyword.trim()) throw new Error('请输入搜索关键词')
    if (typeof cursor !== 'string') throw new Error('无效的商城分页会话')
    const json = JSON.stringify({
        platformId: 2,
        query_str: keyword.trim(),
        version: '9.0.81',
        page_session: cursor,
        not_need_emojilist: false,
        login_sig: { appid: 338, pskey: '' },
    })
    // WebSsoBody.WebSsoRequestBody.data is field 3. The Uni body contains this message directly.
    let timer: ReturnType<typeof setTimeout>
    const payload = await Promise.race([
        adapter.sendPacket('Uni', 'OidbSvcTrpcJsapiTcp.0x94c3_0', { 3: json }),
        new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('QQ 商城搜索请求超时')), 15000)
        }),
    ]).finally(() => clearTimeout(timer))
    const response = pb.decode(Buffer.from(payload))
    if (!response || response[3]) throw new Error('QQ 商城搜索请求失败（' + (response?.[3] ?? '无效响应') + '）')
    if (!response[4]?.toBuffer) throw new Error('QQ 商城响应缺少 JSON 数据')
    const body: MarketSearchJson = JSON.parse(response[4].toString())
    if (!body || typeof body !== 'object') throw new Error('QQ 商城返回了无效的 JSON 数据')
    for (const result of [body, body.data]) {
        if (result && (result.ActionStatus === 'FAIL' || Number(result.ErrorCode)))
            throw new Error(
                'QQ 商城搜索失败（' + (result.ErrorCode ?? '未知错误码') + '）：' + (result.ErrorInfo || '未知错误'),
            )
    }
    if (body.ret) throw new Error(body.msg || 'QQ 商城搜索失败（' + body.ret + '）')
    const data = body.data || body
    if (!Array.isArray(data.list)) throw new Error('商城搜索响应缺少 list，实际字段为 ' + Object.keys(data).join(', '))
    if (typeof data.is_end !== 'boolean') throw new Error('商城搜索响应缺少 is_end')
    if (data.page_session !== undefined && typeof data.page_session !== 'string')
        throw new Error('商城搜索响应包含未知格式的 page_session')
    if (!data.is_end && !data.page_session) throw new Error('商城搜索响应缺少下一页会话')
    return {
        packs: data.list
            .filter((item) => !item.appid || [1, 10].includes(Number(item.appid)))
            .map((item) => {
                const id = Number(item.itemid)
                if (!Number.isSafeInteger(id) || id <= 0) throw new Error('商城搜索返回了无效的表情包 ID')
                return {
                    id,
                    type: item.type ?? (Number(item.appid) === 10 ? 5 : 3),
                    name: item.name,
                    cover:
                        item.type === 5 || Number(item.appid) === 10
                            ? 'https://i.gtimg.cn/qqshow/admindata/comdata/vipSmallEmoji_item_' + id + '/200x200.png'
                            : 'https://i.gtimg.cn/club/item/parcel/img/parcel/' + (id % 10) + '/' + id + '/200x200.png',
                }
            }),
        nextCursor: data.is_end ? '' : data.page_session || '',
    }
}

async function getSmallEmoticonPack(id: number): Promise<MarketEmoticonPack> {
    const base = 'https://i.gtimg.cn/qqshow/admindata/comdata/vipSmallEmoji_item_' + id + '/'
    const { data: response } = await axios.get<{
        data: {
            baseInfo: { name: string; description: string }[]
            itemInfo: { id: string; name: string; png?: string; gif?: string; apng?: string }[]
        }
    }>(base + 'xydata.json', { timeout: 15000, maxContentLength: 2 * 1024 * 1024 })
    const data = response?.data
    if (!data?.baseInfo?.[0]?.name || !Array.isArray(data.itemInfo)) throw new Error('小表情包清单格式无效')
    const asset = (filename: string) => {
        if (!/^[a-z0-9_-]+\.(?:png|gif)$/i.test(filename)) throw new Error('无效的表情资源名')
        return base + filename
    }
    return {
        id,
        type: 5,
        name: data.baseInfo[0].name,
        description: data.baseInfo[0].description || '',
        cover: base + '200x200.png',
        items: data.itemInfo.map((item) => ({
            id: item.id,
            name: item.name,
            thumbnail: asset(item.png || item.id + '.png'),
            url: asset(item.gif || item.apng || item.png || item.id + '.png'),
        })),
    }
}
