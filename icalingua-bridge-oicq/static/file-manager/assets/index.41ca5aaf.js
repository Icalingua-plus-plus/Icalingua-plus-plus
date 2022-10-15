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
                  l("a", { onClick: () => _(a.fid, u), children: [u, "/"] })
                ]
              })
            : i("a", { onClick: () => k(a.fid), children: u });
        }
      },
      {
        title: "大小",
        dataIndex: "size",
        key: "size",
        render(u, a) {
          return "is_dir" in a ? `${a.file_count} 项` : H(u);
        }
      },
      {
        title: "创建时间",
        dataIndex: "create_time",
        key: "createTime",
        render(u) {
          return J("yyyy/M/d hh:mm:ss", new Date(u * 1e3));
        }
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
    B(0), o(u), d(a);
  }
  async function k(u) {
    const a = await t.download(u);
    window['download'] ? window['download'](a.url, a.name) : console.log('error', a);
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
