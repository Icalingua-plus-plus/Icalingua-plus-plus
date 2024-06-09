import path from 'path'
import { faceIdToLottie } from '@icalingua/types/LottieFaceType'

export const getLottiePath = (id: string, resultId?: string, packId = '1') => {
    // @ts-ignore
    return path.join(__static, 'qlottie', `${packId}`, `${id}`, resultId ? `${id}_${resultId}.json` : `${id}.json`)
}

export default (msgText: string, time: number, result?: boolean): string | undefined => {
    const idMatch = msgText.match(/^\[QLottie: (\d+)\,(\d+)\]$/) || msgText.match(/^\[QLottie: (\d+)\,(\d+)\,(\d+)\]$/)
    if (idMatch) {
        const lottie = faceIdToLottie.get(parseInt(idMatch[2]))
        if (lottie.lottieType === 3 && idMatch[3]) {
            result = true
        }
        if (lottie) {
            return getLottiePath(lottie.lottieId, result ? idMatch[3] : undefined, lottie.packId)
        } else {
            return getLottiePath(idMatch[2], result ? idMatch[3] : undefined, '0')
        }
    }
}
