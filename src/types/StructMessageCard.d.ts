export default interface StructMessageCard{
    "app": "com.tencent.structmsg",
    "config": any,
    "desc": "新闻",
    "extra": any,
    "meta": {
        "news": {
            "action": string,
            "android_pkg_name": string,
            "app_type": number,
            "appid": number,
            "desc": string,
            "jumpUrl": string,
            "preview": string,
            "source_icon": string,
            "source_url": string,
            "tag": string,
            "title": string
        }
    },
    "prompt": string,
    "ver": string,
    "view": "news"
}

/*
{
    "app": "com.tencent.structmsg",
    "config": {
        "autosize": true,
        "ctime": 1626859321,
        "forward": true,
        "token": "f8cbdb9882d3b0118f305fa8839f9dd0",
        "type": "normal"
    },
    "desc": "新闻",
    "extra": {
        "app_type": 1,
        "appid": 100951776,
        "msg_seq": 6987307571346607220,
        "uin": xxx
    },
    "meta": {
        "news": {
            "action": "",
            "android_pkg_name": "",
            "app_type": 1,
            "appid": 100951776,
            "desc": "还在买爆款劣质U盘？ 教你用绝版SLC颗粒做一个 寿命用到下辈子 有手就行",
            "jumpUrl": "https://b23.tv/WWRIW2?share_medium=android&share_source=qq&bbid=XX23888200D3F348B37BDF8716B806C3414C8&ts=1626859315667",
            "preview": "https://external-30160.picsz.qpic.cn/442c3acb5e3a8365c63eb5a0a735ee77/jpg1",
            "source_icon": "",
            "source_url": "",
            "tag": "哔哩哔哩",
            "title": "哔哩哔哩"
        }
    },
    "prompt": "[分享]哔哩哔哩",
    "ver": "0.0.0.1",
    "view": "news"
}
 */
