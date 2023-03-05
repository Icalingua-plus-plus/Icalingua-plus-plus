/* msgbox: https://blog.csdn.net/superfans98/article/details/125046385 */
function showmsgbox(id) {
    this.obj = id;
    this.result = "";
}
showmsgbox.prototype = {
    style: function (style) {
        var infostyle;
        switch (style) {
            case "wrong":
            case "error":
                infostyle =
                    'data:image/svg+xml,%3Csvg%20width%3D%2224%22%20height%3D%2224%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E<defs><style>.error{fill:red}</style></defs>%3Cpath%20class="error"%20d%3D%22M12%2022C6.477%2022%202%2017.523%202%2012S6.477%202%2012%202s10%204.477%2010%2010-4.477%2010-10%2010zm-.763-15.864l.11%207.596h1.305l.11-7.596h-1.525zm.759%2010.967c.512%200%20.902-.383.902-.882%200-.5-.39-.882-.902-.882a.878.878%200%2000-.896.882c0%20.499.396.882.896.882z%22%2F%3E%3C%2Fsvg%3E';
                break;
            case "right":
                infostyle = 'data:image/svg+xml,%3Csvg%20width%3D%2224%22%20height%3D%2224%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E<defs><style>.right{fill:forestgreen}</style></defs>%3Cpath%20class="right"%20d%3D%22M12%2022C6.477%2022%202%2017.523%202%2012S6.477%202%2012%202s10%204.477%2010%2010-4.477%2010-10%2010zm-1.177-7.86l-2.765-2.767L7%2012.431l3.119%203.121a1%201%200%20001.414%200l5.952-5.95-1.062-1.062-5.6%205.6z%22%2F%3E%3C%2Fsvg%3E';
                break;
            case 'confirm':
                infostyle = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAMAAADW3miqAAAABGdBTUEAALGPC/xhBQAAACBjSFJN AAB6JQAAgIMAAPn/AACA6QAAdTAAAOpgAAA6mAAAF2+SX8VGAAAAY1BMVEX///8/lf8/lf8/lf8/ lf8/lf8/lf8/lf8/lf8/lf8/lf8/lf8/lf8/lf8/lf8/lf8/lf9Xov+31//z+P/////b6/+Hvf9j qf/D3v9LnP9vsP97tv+fyv/n8v/P5P+TxP+r0P+uPsg8AAAAEHRSTlMAGliOvOD3K4DRAWjNGIyY FB538gAAAAFiS0dEAIgFHUgAAAAJcEhZcwAACxMAAAsTAQCanBgAAAAHdElNRQfmBR4PAwktQlG5 AAABCElEQVQ4y8WU2RKCMAxFtQsiuESJqIjV//9KAds0XRx50vvCBM60yU3CYvE/LYVUuii0kmL5 AVmVayCty1UGqeoNBNrUVcxsd5Bot42YPWS0D6iKzjkcG8RT687iN9aOOQ/IqIuNa1aXy/naYNN2 txNib7P3NZbuoB6xe7N3+6YkD8kfYz8aROeXc1VQOYgmgkBYSBLUdefp6a8DaSEV+/OgxAGUhXTE tINTFGgLFSFzG5grRUUWGupnDEHhdQ9sDizU2cR7fPJQJRZMaZuWhzIxMyORtCUVtcU3OBU12I/K qKdhibNR8UMHY3OND9jQsfENoWB8Zy3CvJWat5zz1nxy9fsP4xd6AcvoLo6BSLErAAAAJXRFWHRk YXRlOmNyZWF0ZQAyMDIyLTA1LTMwVDEyOjAzOjA5KzAzOjAw3pV8TwAAACV0RVh0ZGF0ZTptb2Rp ZnkAMjAyMi0wNS0zMFQxMjowMzowOSswMzowMK/IxPMAAAAASUVORK5CYII='
                break;
            case "info":
            default:
                infostyle =
                    'data:image/svg+xml,%3Csvg%20width%3D%2224%22%20height%3D%2224%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E<defs><style>.error{fill:lightskyblue}</style></defs>%3Cpath%20class="error"%20d%3D%22M12%2022C6.477%2022%202%2017.523%202%2012S6.477%202%2012%202s10%204.477%2010%2010-4.477%2010-10%2010zm-.763-15.864l.11%207.596h1.305l.11-7.596h-1.525zm.759%2010.967c.512%200%20.902-.383.902-.882%200-.5-.39-.882-.902-.882a.878.878%200%2000-.896.882c0%20.499.396.882.896.882z%22%2F%3E%3C%2Fsvg%3E';
        }
        return infostyle;
    },
    show: function (message, style, config) {
        if (typeof config == 'undefined') {
            config = {};
        }
        var timeout = 1;
        var msg = document.createElement("div");
        if (typeof (config.timeout) == 'undefined') {
            try {
                var regex = /(<([^>]+)>)/gi;
                var final = message.replace(regex, "");
                timeout = final.length * 0.25;
            } catch (e) {
                timeout = 2.0;
            }
        } else {
            if (config.timeout > 300) {
                timeout = config.timeout / 1000
            } else {
                timeout = config.timeout;
            }
        }
        var rnd = Math.random() * 1000;
        msg.id = rnd;
        this.obj = msg;
        this.id = rnd;

        var infostyle = this.style(style);
        var width_str = ""
        if (window.innerWidth > 500) {
            width_str = "width: fit-content; margin:0 auto;max-width:35%;"
        } else {
            width_str = "width: fit-content; margin:0 auto;max-width:85%;"
        }
        var html = ''
        if (style == '' || typeof style == 'undefined') {
            style = 'info';
        }
        if (style == 'right' || style == 'wrong' || style == 'error' || style == 'confirm' || style == 'info') {
            html = '<div data-rnd="' + rnd + '" id="cover_' + rnd + '" style="position: fixed;z-index: 4999;top: 0;right: 0;left: 0;bottom: 0;background: rgba(0,0,0,0.6);"></div><div style="position: fixed; ' + width_str + ' z-index: 5000; top: 50%; left: 16px; right: 16px; -webkit-transform: translate(0,-50%); transform: translate(0,-50%); background-color: #fff; text-align: center; border-radius: 12px; overflow: hidden; display: -webkit-box; display: -webkit-flex;  -webkit-flex-direction: column; -webkit-box-orient: vertical; -webkit-box-direction: normal; flex-direction: column; max-height: 90%;"><div style="min-height: 40px; padding: 32px 24px 0; font-weight: 700;display: flex;-webkit-box-orient: vertical; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 0 24px; margin-bottom: 28px; font-size: 18px; line-height: 1.4; word-wrap: break-word; -webkit-hyphens: auto; hyphens: auto; color: rgba(0,0,0,0.5); color: #444;padding: 32px 24px 0;">'
            if (style == 'confirm' || style == 'error' || style == 'wrong' || style == 'info') {
                html += '<img id="img_' + rnd + '" src=\'' + infostyle + '\' style="top: 50%; position: absolute; left: 10px; transform: translateY(-100%);display: inline-block; vertical-align: middle; width: 2.4em; height: 2.4em;"><div style="text-align:left; margin-left:40px; position:relative;" id="wm_content_' + rnd + '">' + message + '</div></div><div style="position:relative; border-top:1px solid #ccc;display:flex;">';
                if (typeof config.button != 'undefined') {
                    for (var x in config.button) {
                        html += '<a style="-webkit-box-flex: 1; -webkit-flex: 1; flex: 1; display: block; padding:11px 0; line-height: 1.41176471; font-size: 17px; color: #576b95; font-weight: 700; text-decoration: none; -webkit-tap-highlight-color: rgba(0,0,0,0); position: relative; overflow: hidden;cursor:pointer;' + (x > 0 ? 'border-left:1px solid #ccc;' : '') + '" class="btn_' + rnd + '" data-rnd="' + rnd + '" data-btn_index=' + x + '>' + config.button[x] + '</a>'
                    }
                } else {
                    html += '<a style="width:100%;padding:11px 0; display:block;font-size: 17px; color: #576b95; font-weight: 700; text-decoration: none; -webkit-tap-highlight-color: rgba(0,0,0,0); overflow: hidden; cursor:pointer"' + 'class="btn_' + rnd + '" data-rnd="' + rnd + '">确定</a>';
                }
                html += "</div>";
            } else {
                html += '<img id="img_' + rnd + '" src=\'' + infostyle + '\' style="top: 50%; position: absolute; left: 10px; transform: translateY(-45%);display: inline-block; vertical-align: middle; width: 2.4em; height: 2.4em; cursor:pointer" onclick="document.body.removeChild(document.getElementById(' + rnd + '));"><div style="text-align:left; margin-left:40px;position:relative;" id="wm_content_' + rnd + '">' + message + '</div></div>';
            }
        } else if (style == 'input') {
            html = '<div id="mask' + rnd + '" style="position: fixed;z-index: 4999;top: 0;right: 0;left: 0;bottom: 0;background: rgba(0,0,0,0.6);"></div><div style="position: fixed; ' + width_str + ' z-index: 5000; top: 50%; left: 16px; right: 16px; -webkit-transform: translate(0,-50%); transform: translate(0,-50%); background-color: #fff; text-align: center; border-radius: 12px; overflow: hidden; display: -webkit-box; display: -webkit-flex;  -webkit-flex-direction: column; -webkit-box-orient: vertical; -webkit-box-direction: normal; flex-direction: column; max-height: 90%;"><div style="min-height: 40px; padding: 32px 24px 0; font-weight: 700;display: flex;-webkit-box-orient: vertical; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 0 24px; margin-bottom: 28px; font-size: 18px; line-height: 1.4; word-wrap: break-word; -webkit-hyphens: auto; hyphens: auto; color: rgba(0,0,0,0.5); color: #444;padding: 32px 24px 0;">'
            html += '<div style="text-align:left; position:relative;"><div style="margin-bottom:10px" id="wm_content_' + rnd + '">' + message + '</div><input type="text" id="input' + rnd + '" style="width:100%;height:40px;" value="' + (typeof config.default == 'undefined' ? '' : config.default) + '" /></div></div><div style="position:relative; border-top:1px solid #ccc;display:flex;">';
            for (var x in config.button) {
                html += '<a style="-webkit-box-flex: 1; -webkit-flex: 1; flex: 1; display: block; padding:11px 0; line-height: 1.41176471; font-size: 17px; color: #576b95; font-weight: 700; text-decoration: none; -webkit-tap-highlight-color: rgba(0,0,0,0); position: relative; cursor:pointer;overflow: hidden;' + (x > 0 ? 'border-left:1px solid #ccc;' : '') + '" class="btn_' + rnd + '" data-rnd="' + rnd + '" data-btn_index=' + x + '>' + config.button[x] + '</a>'
            }
            html += "</div>";
        }

        html += '</div>'
        msg.innerHTML = html;
        document.body.appendChild(msg);

        var btns = document.getElementsByClassName('btn_' + rnd);
        if (style == 'confirm' || style == 'error' || style == 'info' || style == 'wrong') {
            for (var x in btns) {
                if (typeof btns[x] == 'object') {
                    btns[x].addEventListener('click', function (e) {
                        try {
                            var btn_rnd = this.getAttribute('data-rnd');
                            document.body.removeChild(document.getElementById(btn_rnd));
                        } catch (e) {

                        }
                        if (typeof config.click != 'undefined') {
                            config.click(this.getAttribute('data-btn_index'));
                        }
                    });
                }
            }
        }
        if (style == 'input') {
            for (var x in btns) {
                if (typeof btns[x] == 'object') {
                    var that = this;
                    btns[x].addEventListener('click', function (e) {
                        var inp_val = document.getElementById('input' + rnd).value;
                        try {
                            var btn_rnd = this.getAttribute('data-rnd');
                            document.body.removeChild(document.getElementById(btn_rnd));
                        } catch (e) {

                        }
                        if (typeof config.click != 'undefined') {
                            that.result = inp_val;
                            config.click(this.getAttribute('data-btn_index'));
                        }
                    });
                }
            }
            var textbox = document.getElementById('input' + rnd);
            var n = textbox.value.length
            textbox.focus();
            if (navigator.userAgent.indexOf("MSIE") == -1) {
                document.getElementById('input' + rnd).setSelectionRange(n, n);
            } else {
                var range = document.selection.createRange();
                var textRange = textbox.createTextRange();
                textRange.moveStart('character', n);
                textRange.collapse();
                textRange.select();
            }
        }
        if (style == 'right') {
            document.getElementById('cover_' + rnd).addEventListener('click', function (e) {
                try {
                    var btn_rnd = this.getAttribute('data-rnd');
                    document.body.removeChild(document.getElementById(btn_rnd));
                } catch (e) {

                }
            });
            setTimeout(function () {
                if (document.getElementById(rnd)) {
                    document.body.removeChild(msg);
                }
                if (typeof config.redirect != 'undefined') {
                    location.href = config.redirect;
                }
            }, timeout * 1000);
        }
        return this;
    },
    close: function (who) {
        console.log(who)
        document.body.removeChild(document.getElementById(who.id));
    },
    showtext: function (text) {
        try {
            document.getElementById('wm_content_' + this.id).innerHTML = text;
        } catch (e) {
            console.error("catched error:" + e);
        }
    }
};
var msgbox = new showmsgbox();
var currentDir = "";

String.prototype.strLen = function() {
    var len = 0;
    for (var i = 0; i < this.length; i++) {
        if (this.charCodeAt(i) > 255 || this.charCodeAt(i) < 0) len += 2; else len ++;
    }
    return len;
}
//将字符串拆成字符，并存到数组中
String.prototype.strToChars = function(){
    var chars = new Array();
    for (var i = 0; i < this.length; i++){
        chars[i] = [this.substr(i, 1), this.isCHS(i)];
    }
    String.prototype.charsArray = chars;
    return chars;
}
//判断某个字符是否是汉字
String.prototype.isCHS = function(i){
    if (this.charCodeAt(i) > 255 || this.charCodeAt(i) < 0) 
        return true;
    else
        return false;
}
//截取字符串（从start字节到end字节）
String.prototype.subCHString = function(start, end){
    var len = 0;
    var str = "";
    this.strToChars();
    for (var i = 0; i < this.length; i++) {
        if(this.charsArray[i][1])
            len += 2;
        else
            len++;
        if (end < len)
            return str;
        else if (start < len)
            str += this.charsArray[i][0];
    }
    return str;
}

var D = Object.defineProperty;
var S = (t, e, r) =>
    e in t
        ? D(t, e, { enumerable: !0, configurable: !0, writable: !0, value: r })
        : (t[e] = r);
var m = (t, e, r) => (S(t, typeof e != "symbol" ? e + "" : e, r), r);
import {
    i as M,
    n as y,
    j as l,
    a as i,
    A,
    T as w,
    r as c,
    B as p,
    b as C,
    F as b,
    c as I,
    S as L,
    L as g,
    R as N,
    d as P
} from "./vendor.8788b689.js";
const R = function () {
    const e = document.createElement("link").relList;
    if (e && e.supports && e.supports("modulepreload")) return;
    for (const o of document.querySelectorAll('link[rel="modulepreload"]')) n(o);
    new MutationObserver((o) => {
        for (const s of o)
            if (s.type === "childList")
                for (const d of s.addedNodes)
                    d.tagName === "LINK" && d.rel === "modulepreload" && n(d);
    }).observe(document, { childList: !0, subtree: !0 });
    function r(o) {
        const s = {};
        return (
            o.integrity && (s.integrity = o.integrity),
            o.referrerpolicy && (s.referrerPolicy = o.referrerpolicy),
            o.crossorigin === "use-credentials"
                ? (s.credentials = "include")
                : o.crossorigin === "anonymous"
                    ? (s.credentials = "omit")
                    : (s.credentials = "same-origin"),
            s
        );
    }
    function n(o) {
        if (o.ep) return;
        o.ep = !0;
        const s = r(o);
        fetch(o.href, s);
    }
};
R();
class T {
    constructor(e, r) {
        m(this, "groupInfo");
        m(this, "_socket");
        (this._socket = e), (this.groupInfo = r);
    }
    ls(e, r) {
        return new Promise((n) => this._socket.emit("ls", e, r, n));
    }
    download(e) {
        return new Promise((r) => this._socket.emit("download", e, r));
    }
    stat(e) {
        return new Promise((r) => this._socket.emit("stat", e, r));
    }
    rm(e) {
        return new Promise((r) => this._socket.emit("rm", e, r));
    }
    mkdir(e) {
        return new Promise((r) => this._socket.emit("mkdir", e, r));
    }
    mv(e, r) {
        return new Promise((n) => this._socket.emit("mv", e, r, n));
    }
    rename(e, r) {
        return new Promise((n) => this._socket.emit("rename", e, r, n));
    }
}
const $ = (t) =>
    new Promise((e, r) => {
        console.log("实例初始化", t);
        const n = M({ transports: ["websocket"] });
        n.once("connect_error", () => {
            y.error({
                message: "与服务器连接失败",
                description:
                    "请检查服务器地址&协议是否填写正确"
            });
        }),
            n.once("requireAuth", (o, { version: s }) => {
                console.log("服务器协议版本", s),
                    n.emit("auth", t, "fileMgr");
            }),
            n.once("authSucceed", (o, s) => {
                console.log("登录成功", s), e(new T(n, s));
            }),
            n.once("authFailed", () => {
                y.error({
                    message: "错误",
                    description: "认证失败"
                }),
                    r("认证失败");
            });
    }),
    O = "_container_1ntvu_1",
    j = "_info_1ntvu_5",
    q = "_title_1ntvu_12",
    K = "_desc_1ntvu_17";
var h = { container: O, info: j, title: q, desc: K },
    G = ({ info: t }) =>
        l("div", {
            className: h.container,
            children: [
                i("div", {
                    className: h.avatar,
                    children: i(A, {
                        size: "large",
                        src: `https://p.qlogo.cn/gh/${t.group_id}/${t.group_id}/0`,
                        alt: "头像"
                    })
                }),
                l("div", {
                    className: h.info,
                    children: [
                        i(w.Text, {
                            className: h.title,
                            title: t.group_name,
                            children: t.group_name
                        }),
                        i(w.Text, {
                            type: "secondary",
                            className: h.desc,
                            children: t.group_id
                        })
                    ]
                })
            ]
        });
function H(t) {
    if (!t) return "";
    const e = 1024;
    return t < e
        ? t + "B"
        : t < Math.pow(e, 2)
            ? (t / e).toFixed(2) + "KB"
            : t < Math.pow(e, 3)
                ? (t / Math.pow(e, 2)).toFixed(2) + "MB"
                : t < Math.pow(e, 4)
                    ? (t / Math.pow(e, 3)).toFixed(2) + "G"
                    : (t / Math.pow(e, 4)).toFixed(2) + "T";
}
function Y(t) {
    var e = {
        "M+": this.getMonth() + 1,
        "d+": this.getDate(),
        "h+": this.getHours(),
        "m+": this.getMinutes(),
        "s+": this.getSeconds(),
        "q+": Math.floor((this.getMonth() + 3) / 3),
        S: this.getMilliseconds()
    };
    /(y+)/.test(t) &&
        (t = t.replace(
            RegExp.$1,
            (this.getFullYear() + "").substr(4 - RegExp.$1.length)
        ));
    for (var r in e)
        new RegExp("(" + r + ")").test(t) &&
            (t = t.replace(
                RegExp.$1,
                RegExp.$1.length === 1 ? e[r] : ("00" + e[r]).substr(("" + e[r]).length)
            ));
    return t;
}
function J(t, e = new Date()) {
    return Y.call(e, t);
}
var Q = ({ socket: t }) => {
    const [e, r] = c.exports.useState(!0),
        [n, o] = c.exports.useState("/"),
        [s, d] = c.exports.useState(""),
        [F, v] = c.exports.useState([]),
        [V, x] = c.exports.useState([]),
        [f, B] = c.exports.useState(0),
        E = [
            {
                title: "名称",
                dataIndex: "name",
                key: "name",
                render(u, a) {
                    return "is_dir" in a
                        ? l(b, {
                            children: [
                                i(I, {}),
                                " ",
                                l("a", { onClick: () => _(a.fid, u), onContextMenu: (e) => dirContextMenu(a.fid, u, e), children: [u, "/"] })
                            ]
                        })
                        : i("a", { onClick: () => k(a.fid), onContextMenu: (e) => fileContextMenu(a.fid, u, e), children: u });
                },
                sorter: (u, a) => u.name.localeCompare(a.name)
            },
            {
                title: "创建者",
                dataIndex: "user_name",
                key: "userName",
                render(u) {
                    return i("li", { children: String(u).subCHString(0, 16) + "...", title: u });
                },
                sorter: (u, a) => u.user_name.localeCompare(a.user_name)
            },
            {
                title: "大小",
                dataIndex: "size",
                key: "size",
                render(u, a) {
                    return "is_dir" in a ? `${a.file_count} 项` : H(u);
                },
                sorter: (u, a) => u.size - a.size
            },
            {
                title: "创建时间",
                dataIndex: "create_time",
                key: "createTime",
                render(u) {
                    return J("yyyy/M/d hh:mm:ss", new Date(u * 1e3));
                },
                sorter: (u, a) => u.create_time - a.create_time
            }
        ];
    return (
        c.exports.useEffect(() => {
            r(!0),
                console.log("获取文件列表", n),
                t.ls(n, f).then((u) => {
                    v(u), n === "/" && !f && x(u.filter((a) => a.is_dir)), r(!1);
                });
        }, [n, f]),
        l("div", {
            children: [
                l(p, {
                    style: { padding: 10 },
                    children: [
                        i(p.Item, {
                            children: i("a", { onClick: () => _("/", ""), children: "Root" })
                        }),
                        s && i(p.Item, { children: s })
                    ]
                }),
                i(C, {
                    dataSource: F,
                    columns: E,
                    loading: e,
                    rowKey: "fid",
                    pagination: !1
                })
            ]
        })
    );
    function _(u, a) {
        currentDir = a;
        B(0), o(u), d(a);
    }
    async function k(u, saveAs = false) {
        const a = await t.download(u);
        if (a.url === 'error') {
            y.error({
                message: "下载失败",
                description: a.name
            });
            return;
        }
        window['download'] ? window['download'](a.url, a.name, undefined, saveAs) : console.log('error', a);
        if (!saveAs) {
            y.success({
                message: "已发送下载任务",
                description:
                    "即将开始下载 " + a.name
            });
        }
    }
    function fileContextMenu(u, name, e) {
        var items = []
        items.push({ title: '下载', fn: () => k(u, false) })
        items.push({ title: '另存为', fn: () => k(u, true) })
        items.push({ title: '复制链接', fn: async () => {
            const a = await t.download(u);
            window.copyText(a.url);
        } })
        if (window.isAdmin !== "false") {
            items.push(
                {
                    title: '重命名', fn: () => {
                        msgbox.show("设置新名称", "input", {
                            button: ['取消', '确定'],
                            default: name,
                            click: function (e) {
                                if (e == 1) {
                                    t.rename(u, msgbox.result)
                                    location.reload()
                                }
                            }
                        })
                    }
                },
                {
                    title: '删除', fn: () => {
                        msgbox.show("确认删除文件 " + name + "?", "confirm", {
                            button: ['取消', '确定'],
                            click: function (e) {
                                if (e == 1) {
                                    t.rm(u)
                                    location.reload()
                                }
                            }
                        })
                    }
                }
            )
            if (currentDir === "") {
                items.push(
                    {
                        title: '新建文件夹', fn: () => {
                            msgbox.show("新建文件夹名称", "input", {
                                button: ['取消', '确定'],
                                click: function (e) {
                                    if (e == 1) {
                                        t.mkdir(msgbox.result)
                                        location.reload()
                                    }
                                }
                            })
                        }
                    }
                )
            }
        }
        basicContext.show(items, e)
    }
    async function dirContextMenu(u, a, e) {
        var items = []
        items.push({ title: '打开', fn: () => _(u, a) })
        if (window.isAdmin !== "false") {
            items.push(
                {
                    title: '重命名', fn: () => {
                        msgbox.show("设置新名称", "input", {
                            button: ['取消', '确定'],
                            default: a,
                            click: function (e) {
                                if (e == 1) {
                                    t.rename(u, msgbox.result)
                                    location.reload()
                                }
                            }
                        })
                    }
                },
                {
                    title: '删除', fn: () => {
                        msgbox.show("确认删除文件夹 " + a + "?", "confirm", {
                            button: ['取消', '确定'],
                            click: function (e) {
                                if (e == 1) {
                                    t.rm(u)
                                    location.reload()
                                }
                            }
                        })
                    }
                }
            )
            if (currentDir === "") {
                items.push(
                    {
                        title: '新建文件夹', fn: () => {
                            msgbox.show("新建文件夹名称", "input", {
                                button: ['取消', '确定'],
                                click: function (e) {
                                    if (e == 1) {
                                        t.mkdir(msgbox.result)
                                        location.reload()
                                    }
                                }
                            })
                        }
                    }
                )
            }
        }
        basicContext.show(items, e)
    }
};
function U() {
    const t = window.location.search.substr(1);
    if (!t) return i("p", { children: "Token not defined" });
    const [e, r] = c.exports.useState();
    return (
        c.exports.useEffect(() => {
            $(t).then((n) => {
                r(n),
                    (document.title = `${n.groupInfo.group_name} — 文件管理`);
            });
        }, []),
        i(L, {
            spinning: !e,
            children: l(g, {
                style: { minHeight: "100vh" },
                children: [
                    i(g.Sider, {
                        style: { overflow: "auto", height: "100vh", left: 0, padding: 15 },
                        theme: "light",
                        children: e && i(G, { info: e.groupInfo })
                    }),
                    i(g.Content, {
                        style: { overflow: "auto", height: "100vh", margin: "0 16px" },
                        children: e && i(Q, { socket: e })
                    })
                ]
            })
        })
    );
}
N.render(
    i(P.StrictMode, { children: i(U, {}) }),
    document.getElementById("root")
);
