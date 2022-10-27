export const onMessage = (data, bot) => {
    console.log(data)
    if (data.message[0].type !== 'text' || data.message[0].data.text !== '/help') return
    if (data.message_type === 'private') bot.sendPrivateMsg(data.sender.user_id, '你好，我是 Icalingua++ Bot！', true)
    else bot.sendGroupMsg(data.group_id, '你好，我是 Icalingua++ Bot！', true)
}
