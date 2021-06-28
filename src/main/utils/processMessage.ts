import {AtElem, FriendInfo, GroupMessageEventData, MemberBaseInfo, MessageElem} from "oicq";
import Message from "../../types/Message";
import {getBot, getStorage} from "../ipc/ipcBot";
import {base64decode} from 'nodejs-base64'

const processMessage = async (oicqMessage: MessageElem[], message: Message, lastMessage, roomId = null) => {
    if (!Array.isArray(oicqMessage))
        oicqMessage = [oicqMessage]
    let lastType
    for (let i = 0; i < oicqMessage.length; i++) {
        const m = oicqMessage[i];
        let appurl;
        let url;
        switch (m.type) {
            case "at":
                if (lastType === 'reply')
                    break
            case "text":
                lastMessage.content += m.data.text;
                message.content += m.data.text;
                if ((m as AtElem).data.qq === "all") {
                    message.at = "all";
                } else if ((m as AtElem).data.qq == getBot().uin) {
                    message.at = true;
                }
                break;
            case "image":
            case "flash":
                lastMessage.content += "[Image]";
                url = m.data.url;
                message.file = {
                    type: "image/jpeg",
                    url,
                };
                break;
            case "bface":
                lastMessage.content += "[Sticker]" + m.data.text;
                url = `https://gxh.vip.qq.com/club/item/parcel/item/${m.data.file.substr(
                    0,
                    2
                )}/${m.data.file.substr(0, 32)}/300x300.png`;
                message.file = {
                    type: "image/webp",
                    url,
                };
                break;
            case "file":
                lastMessage.content += "[File]" + m.data.name;
                message.content += m.data.name;
                message.file = {
                    type: "object/stream",
                    size: m.data.size,
                    url: m.data.url,
                    name: m.data.name,
                    fid: m.data.fileid
                };
                break;
            case "share":
                lastMessage.content += "[Link]" + m.data.title;
                message.content += m.data.url;
                break;
            case "reply":
                let replyMessage: Message
                if (roomId) {
                    replyMessage = await getStorage().getMessage(roomId, m.data.id);
                }
                if (!replyMessage) {
                    //get the message
                    const getRet = await getBot().getMsg(m.data.id);
                    if (getRet.data) {
                        //获取到库里面还没有的历史消息
                        //暂时先不加回库里了
                        const data = getRet.data
                        const senderName = ('group_id' in data)
                            ? (data as GroupMessageEventData).anonymous
                                ? (data as GroupMessageEventData).anonymous.name
                                : getBot().uin === data.sender.user_id
                                    ? "You"
                                    : (data.sender as MemberBaseInfo).card || data.sender.nickname
                            : (data.sender as FriendInfo).remark || data.sender.nickname
                        replyMessage = {
                            _id: "", date: "", senderId: 0, timestamp: "",
                            username: senderName,
                            content: ''
                        }
                        await processMessage(data.message, replyMessage, {})
                    }
                }
                if (replyMessage) {
                    message.replyMessage = {
                        _id: m.data.id,
                        username: replyMessage.username,
                        content: replyMessage.content,
                    };
                    if (replyMessage.file) {
                        message.replyMessage.file = replyMessage.file;
                    }
                }
                break;
            case "json":
                const json: string = m.data.data;
                message.code = json;
                const jsonObj = JSON.parse(json)
                if (jsonObj.app === 'com.tencent.mannounce') {
                    try {
                        const title = base64decode(jsonObj.meta.mannounce.title)
                        const content = base64decode(jsonObj.meta.mannounce.text)
                        lastMessage.content = `[${title}]`
                        message.content = title + '\n\n' + content
                        break
                    } catch (err) {
                    }
                }
                const biliRegex = /(https?:\\?\/\\?\/b23\.tv\\?\/\w*)\??/;
                const zhihuRegex = /(https?:\\?\/\\?\/\w*\.?zhihu\.com\\?\/[^?"=]*)\??/;
                const biliRegex2 = /(https?:\\?\/\\?\/\w*\.?bilibili\.com\\?\/[^?"=]*)\??/;
                const jsonLinkRegex = /{.*"app":"com.tencent.structmsg".*"jumpUrl":"(https?:\\?\/\\?\/[^",]*)".*}/;
                const jsonAppLinkRegex = /"contentJumpUrl": ?"(https?:\\?\/\\?\/[^",]*)"/;
                if (biliRegex.test(json))
                    appurl = json.match(biliRegex)[1].replace(/\\\//g, "/");
                else if (biliRegex2.test(json))
                    appurl = json.match(biliRegex2)[1].replace(/\\\//g, "/");
                else if (zhihuRegex.test(json))
                    appurl = json.match(zhihuRegex)[1].replace(/\\\//g, "/");
                else if (jsonLinkRegex.test(json))
                    appurl = json.match(jsonLinkRegex)[1].replace(/\\\//g, "/");
                else if (jsonAppLinkRegex.test(json))
                    appurl = json.match(jsonAppLinkRegex)[1].replace(/\\\//g, "/");
                if (appurl) {
                    lastMessage.content = appurl;
                    message.content = appurl;
                } else {
                    lastMessage.content = "[JSON]";
                    message.content = "[JSON]";
                }
                break;
            case "xml":
                message.code = m.data.data;
                const urlRegex = /url="([^"]+)"/;
                if (urlRegex.test(m.data.data))
                    appurl = m.data.data.match(urlRegex)[1].replace(/\\\//g, "/");
                if (m.data.data.includes('action="viewMultiMsg"')) {
                    lastMessage.content += "[Forward multiple messages]";
                    message.content += "[Forward multiple messages]";
                    const resIdRegex = /m_resid="([\w+=/]+)"/;
                    if (resIdRegex.test(m.data.data)) {
                        const resId = m.data.data.match(resIdRegex)[1];
                        console.log(resId);
                        message.content = `[Forward: ${resId}]`;
                    }
                } else if (appurl) {
                    appurl = appurl.replace(/&amp;/g, "&");
                    lastMessage.content = appurl;
                    message.content = appurl;
                } else {
                    lastMessage.content += "[XML]";
                    message.content += "[XML]";
                }
                break;
            case "face":
                message.content += `[Face: ${m.data.id}]`;
                lastMessage.content += m.data.text
                break;
            case "video":
                message.content = "";
                lastMessage.content = `[Video]`;
                message.file = {
                    type: "video/mp4",
                    url: m.data.url,
                };
                break;
            case "record":
                message.content = "[Audio]";
                lastMessage.content = `[Audio]`;
                break;
        }
        lastType = m.type
    }
    return {message, lastMessage};
}

export default processMessage
