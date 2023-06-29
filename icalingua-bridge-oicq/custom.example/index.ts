export const onMessage = (
    data: import('oicq-icalingua-plus-plus').MessageEventData,
    bot: import('oicq-icalingua-plus-plus').Client,
    extra: {
        storage: import('@icalingua/types/StorageProvider').default
        ui: typeof import('../utils/clients').default
    },
) => {
    // 只在收到消息时会触发
    // 此处 data 为 OICQ v1 的消息格式，bot 为 OICQ v1 的 Client ，可使用 OICQ v1 的 API
    // extra 包含 Icalingua++ 的内部方法，可调用 storage 和 ui 中的方法获取数据库中的内容或与 UI 交互
    console.log(data)
    if (!data.raw_message) return
    if (data.raw_message === '/help') data.reply('你好，我是 Icalingua++ Bot！')
    if (data.raw_message === '/ping') data.reply('pong')
    if (data.message_type === 'group' && data.raw_message === '/subid')
        data.reply('你的 subid 是：' + data.sender.subid)
}
