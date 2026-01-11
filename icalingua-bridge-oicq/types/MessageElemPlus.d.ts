import type { ImgPttElem, MessageElem } from 'oicq-icalingua-plus-plus'

export type ImgPttElemPlus = Omit<ImgPttElem, 'data'> & {
    data: ImgPttElem['data'] & {
        prompt?: string
        height?: number
        width?: number
    }
}

export type MessageElemPlus = MessageElem | ImgPttElemPlus
