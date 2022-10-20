const packageJson = require('../icalingua/package.json')
const fs = require('fs')
const core = require('@actions/core')

Date.prototype.format = function (fmt) {
    var o = {
        'M+': this.getMonth() + 1, //月份
        'd+': this.getDate(), //日
        'h+': this.getHours(), //小时
        'm+': this.getMinutes(), //分
        's+': this.getSeconds(), //秒
        'q+': Math.floor((this.getMonth() + 3) / 3), //季度
        S: this.getMilliseconds(), //毫秒
    }
    if (/(y+)/.test(fmt)) {
        fmt = fmt.replace(
            RegExp.$1,
            (this.getFullYear() + '').substr(4 - RegExp.$1.length),
        )
    }
    for (var k in o) {
        if (new RegExp('(' + k + ')').test(fmt)) {
            fmt = fmt.replace(
                RegExp.$1,
                RegExp.$1.length === 1 ? o[k] : ('00' + o[k]).substr(('' + o[k]).length),
            )
        }
    }
    return fmt
}

const now = new Date()
const commitId = process.env.SHA.substr(0, 7)
const ref = process.env.REF
const isProduction = ref.startsWith('refs/tags/v')
const buildTime = now.toLocaleString(undefined, {timeZone: 'Asia/Shanghai'})
const version = process.env.GIT_VER

packageJson.version = version

console.log(`commitId: ${commitId}
ref: ${ref}
isProduction: ${isProduction}
buildTime: ${buildTime}
version: ${version}`)

core.setOutput('arch-version', version.replace(/-/g, '_'))
core.setOutput('pkg-name', `icalingua${isProduction ? '' : '-beta'}`)

fs.writeFileSync('icalingua/static/version.json',
    JSON.stringify({commitId, ref, isProduction, buildTime, version}), 'utf-8')

fs.writeFileSync('icalingua/package.json',
    JSON.stringify(packageJson), 'utf-8')
