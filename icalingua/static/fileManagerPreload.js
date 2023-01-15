window.download=(url, out, dir, saveAs)=>require('electron').ipcRenderer.send('download', url, out, dir, saveAs)
window.copyText=(text)=>navigator.clipboard.writeText(text)
