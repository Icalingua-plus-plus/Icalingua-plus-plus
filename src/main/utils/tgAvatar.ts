import TelegramBot from 'node-telegram-bot-api'
import {getConfig} from './configManager'
import fetch from 'node-fetch'
import fileType from 'file-type'

const TG_TOKEN = getConfig().tgBotToken

const cache = new Map<number, string>()
const tg = new TelegramBot(TG_TOKEN, {polling: false})

/**
 *
 * @param uid
 * @return base64 的头像图片
 */
export const getTgAvatar = async (uid: number): Promise<string> => {
    try {
        let b64 = cache.get(uid)
        if (!b64) {
            if (!TG_TOKEN) return null
            const photos = await tg.getUserProfilePhotos(uid, {limit: 1})
            const photo = photos.photos[0]
            const fid = photo[photo.length - 1].file_id
            const url = await tg.getFileLink(fid)
            const res = await fetch(url)
            const buf = await res.buffer()
            const type = await fileType.fromBuffer(res)
            b64 = 'data:' + type.mime + ';base64,' + Buffer.from(buf, 'binary').toString('base64')
            cache.set(uid, b64)
        }
        return b64
    } catch (e) {
        console.log(e)
        return null
    }
}
