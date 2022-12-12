window.download=(url, out)=>require('electron').ipcRenderer.send('download', url, out)
window.copyText=(text)=>navigator.clipboard.writeText(text)
