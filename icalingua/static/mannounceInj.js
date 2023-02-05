let file, b64File, fileData
const gid = location.href.match(/#gc=(\d+)/)[1]

window.mqq.media.showPicture=({imageIDs, index})=>window.eqqShowImage(imageIDs[index])
window.mqq.ui.showDialog = (a, b) => {
    const button = confirm(String(a.text) + '\n是否' + String(a.okBtnText)) ? 0 : 1
    b({
        "button": button,
        "data": {
            "button": button
        },
        "code": button,
        "msg": ""
    })
}
window.mqq.ui.setTitleButtons = (o) => {
    console.log(o)
    if (o.right && o.right.title === '发布') {
        window.publish = o.right.callback
    }
    if (o.right && o.right.title === '删除') {
        window.delete = o.right.callback
        const deleteButton = document.createElement('button')
        deleteButton.style = 'width: 80%; margin: auto; color: #ff596a;'
        deleteButton.className = 'qui-button qui-button_gray qui-button_large'
        deleteButton.innerText = '删除'
        deleteButton.onclick = () => {
            const choose = confirm('是否删除此条公告？')
            if (choose) window.delete()
        }
        const a = setInterval(() => {
            const buttongroup = document.getElementsByClassName('qui-button-group')
            if (buttongroup.length) {
                buttongroup[0].appendChild(deleteButton)
                clearInterval(a)
            }
        }, 100)
    }
    if (o.right && o.right.title === '' && o.right.iconID === 1) {
        appendCss()
        window.newMannounce = o.right.callback
        const newDiv = document.createElement('div')
        newDiv.style = 'display: flex;'
        const newButton = document.createElement('button')
        newButton.style = 'width: 80%; margin: auto;'
        newButton.className = 'qui-button qui-button_primary qui-button_large'
        newButton.innerText = '发布新公告'
        newButton.onclick = () => window.newMannounce()
        newDiv.appendChild(newButton)
        const announcementMain = document.getElementsByClassName('announcement-main')
        announcementMain[0].appendChild(newDiv)
    }
    if (o.left && o.left.title === '返回') {
        window.return = o.left.callback
    }
}
window.mqq.ui.showTips = (o) => {
    alert(o.text)
    const closeText =['已发布', '已删除']
    if (closeText.includes(o.text))
        window.close()
}
_invoke = window.mqq.invoke
window.mqq.invoke = function (b, c, d, e) {
    if (b === 'ui' && c === 'showTips') {
        window.mqq.ui.showTips(d)
    } else if (b === 'troopNotice' && c === 'sendPicture') {
        console.log('POST', d.cgiURL)
        const xhr = new XMLHttpRequest()
        xhr.open('POST', d.cgiURL)
        xhr.onload = () => {
            console.log(xhr.readyState, xhr.status,xhr.responseText)
            const data = JSON.parse(xhr.responseText)
            console.log(data)
            if (data.ec === 0) {
                console.log(d.callback)
                d.callback(data)
            }
        }
        let form = new FormData()
        form.append('pic_up', file, file.name)
        form.append('m', 0)
        form.append('source', 'troopNotice')
        form.append('bkn', String(window.qq_bkn))
        form.append('qid', String(gid))
        console.log(form)
        xhr.send(form)
    } else {
        console.log(b, c, d, e)
        d.callback(window.testObj)
        _invoke.call(this, b, c, d, e)
    }
}
mqq.callback = (a) => a
window.mqq.media.getPicture = (type, callback) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
        file = input.files[0]
        console.log(file)
        const reader = new FileReader()
        reader.onload = () => {
            fileData = reader.result
            b64File = fileData.toString('base64')
            callback(0, [{
                data: b64File,
                imageID: file.path,
                match: 0,
            }])
        }
        reader.readAsDataURL(file)
    }
    input.click()
    
}

/** 插入按钮样式 */ 
function appendCss() {
    const style = document.createElement('style')
    style.innerHTML = `
    .qui-button{
        font-size:17px;
        color:#03081a;
        background-color:#fff;
        border-radius:6px;
        line-height:normal
    }
    .qui-button__inner{
        display:-webkit-flex;
        display:-webkit-box;
        display:flex;
        -webkit-justify-content:center;
        -webkit-box-pack:center;
        justify-content:center;
        -webkit-align-items:center;
        -webkit-box-align:center;
        align-items:center
    }
    .qui-button_large{
        width:100%;
        height:45px
    }
    .qui-button_medium{
        min-width:168px;
        height:40px
    }
    .qui-button_small{
        font-size:14px;
        padding:0 16px;
        height:30px;
        border-radius:45px
    }
    .qui-button_default{
        background-color:#fff
    }
    .qui-button_default:not(:disabled):active{
        background-color:#ebedf5
    }
    .qui-button_default:disabled{
        color:#b0b3bf
    }
    .qui-button_primary{
        color:#fff;
        background-color:#00cafc
    }
    .qui-button_primary:not(:disabled):active{
        background-color:#00afdb
    }
    .qui-button_primary:disabled{
        background-color:#b3effe
    }
    .qui-button_warning{
        color:#ff596a;
        background-color:#fff
    }
    .qui-button_warning:not(:disabled):active{
        background-color:#ebedf5
    }
    .qui-button_warning:disabled{
        color:rgba(255,89,106,.3)
    }
    .qui-button_gray{
        color:#03081a;
        background-color:#ebedf5
    }
    .qui-button_gray:not(:disabled):active{
        background-color:#d4d6dc
    }
    .qui-button_gray:disabled{
        color:#b0b3bf;
        background-color:#ebedf5
    }`
    document.head.appendChild(style)
}
if (location.href.startsWith('https://web.qun.qq.com/mannounce/edit.html')) {
    appendCss()
    // 插入一个发布按钮
    const announcementEdit = document.getElementsByClassName('announcement-edit')[0]
    const publishDiv = document.createElement('div')
    publishDiv.style = 'display: flex;'
    const publishButton = document.createElement('button')
    publishButton.style = 'width: 80%; margin: auto;'
    publishButton.className = 'qui-button qui-button_primary qui-button_large'
    publishButton.innerText = '发布'
    publishButton.onclick = () => window.publish()
    publishDiv.appendChild(publishButton)
    announcementEdit.children[0].appendChild(publishDiv)
    // 插入一个返回按钮
    const returnDiv = document.createElement('div')
    returnDiv.style = 'display: flex;'
    const returnButton = document.createElement('button')
    returnButton.style = 'width: 80%; margin: auto;'
    returnButton.className = 'qui-button qui-button_gray qui-button_large'
    returnButton.innerText = '返回'
    returnButton.onclick = () => window.return()
    returnDiv.appendChild(returnButton)
    announcementEdit.children[1].appendChild(returnDiv)
}