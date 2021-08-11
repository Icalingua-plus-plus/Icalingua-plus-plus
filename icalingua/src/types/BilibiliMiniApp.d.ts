//一般通过小程序应该也适用
export default interface BilibiliMiniApp{
    "app": "com.tencent.miniapp_01",
    "config": any,
    "desc": "哔哩哔哩",
    "extra": any,
    "meta": {
        "detail_1": {
            "appid": string,
            //视频名字
            "desc": string,
            "gamePoints": "",
            "gamePointsUrl": "",
            "host": {
                "nick": string,
                "uin": number
            },
            "icon": string,
            //预览图
            "preview": string,
            "qqdocurl": string,
            "scene": number,
            "shareTemplateData": {},
            "shareTemplateId": string,
            "showLittleTail": "",
            "title": "哔哩哔哩",
            "url": string
        }
    },
    "needShareCallBack": boolean,
    "prompt": "[QQ小程序]哔哩哔哩",
    "ver": string,
    "view": string
}

/*

 {
    "app": "com.tencent.miniapp_01",
    "config": {
        "autoSize": 0,
        "ctime": 1626859356,
        "forward": 1,
        "height": 0,
        "token": "6eab53592c1e6bc9bd54282c2f67f73e",
        "type": "normal",
        "width": 0
    },
    "desc": "哔哩哔哩",
    "extra": {
        "app_type": 1,
        "appid": 100951776,
        "uin": 839827911
    },
    "meta": {
        "detail_1": {
            "appid": "1109937557",
            "desc": "还在买爆款劣质U盘？ 教你用绝版SLC颗粒做一个 寿命用到下辈子 有手就行",
            "gamePoints": "",
            "gamePointsUrl": "",
            "host": {
                "nick": "aaa",
                "uin": 0
            },
            "icon": "http://miniapp.gtimg.cn/public/appicon/432b76be3a548fc128acaa6c1ec90131_200.jpg",
            "preview": "pubminishare-30161.picsz.qpic.cn/53ff779f-d6a9-4eb1-890a-dfd875c7d185",
            "qqdocurl": "https://b23.tv/0GTNIr?share_medium=android&share_source=qq&bbid=XX23888200D3F348B37BDF8716B806C3414C8&ts=1626859350951",
            "scene": 1036,
            "shareTemplateData": {},
            "shareTemplateId": "8C8E89B49BE609866298ADDFF2DBABA4",
            "showLittleTail": "",
            "title": "哔哩哔哩",
            "url": "m.q.qq.com/a/s/277b3e40dde342399bd1675555726ea4"
        }
    },
    "needShareCallBack": false,
    "prompt": "[QQ小程序]哔哩哔哩",
    "ver": "1.0.0.19",
    "view": "view_8C8E89B49BE609866298ADDFF2DBABA4"
}

 */
