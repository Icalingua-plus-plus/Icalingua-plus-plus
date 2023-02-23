type MiraiTg = {
    type: 'tg'
    tgUid: number
    avatarMd5?: string
    avatarUrl?: string
    noSplitSender?: boolean
    version?: 2
}

type MessageMirai = { eqq?: MiraiTg }

export default MessageMirai
