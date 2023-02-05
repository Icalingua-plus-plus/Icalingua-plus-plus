window.eqqShowImage=(url)=>require('electron').ipcRenderer.send('openImage', url)
window.mqq = {
    ui: {
        setTitleButtons: (o) => {
            if (o.right && o.right.title === '发布') {
                window.publish = o.right.callback
            }
        },
    }
}
