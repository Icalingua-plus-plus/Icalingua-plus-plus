export const onMessage = (data, bot) => {
    // 只在收到消息时会触发
    // 此处 data 为 OICQ v1 的消息格式，bot 为 OICQ v1 的 Client ，可使用 OICQ v1 的 API
    console.log(data)
    if (!data.message[0]) return
    if ((data.message[0] && data.message[0].type !== 'text') || data.message[0].data.text !== '/help') return
    if (data.message_type === 'private') bot.sendPrivateMsg(data.sender.user_id, '你好，我是 Icalingua++ Bot！', true)
    else bot.sendGroupMsg(data.group_id, '你好，我是 Icalingua++ Bot！', true)
}
