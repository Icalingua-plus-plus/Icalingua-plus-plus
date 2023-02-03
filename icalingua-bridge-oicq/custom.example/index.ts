export const onMessage = (
    data: import('oicq-icalingua-plus-plus').MessageEventData,
    bot: import('oicq-icalingua-plus-plus').Client,
) => {
    // 只在收到消息时会触发
    // 此处 data 为 OICQ v1 的消息格式，bot 为 OICQ v1 的 Client ，可使用 OICQ v1 的 API
    console.log(data)
    if (!data.raw_message) return
    if (data.raw_message === '/help') data.reply('你好，我是 Icalingua++ Bot！')
}
