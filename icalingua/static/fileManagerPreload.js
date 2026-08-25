window.download=(url, out, dir, saveAs)=>require('electron').ipcRenderer.send('download', url, out, dir, saveAs)
window.createDownloadDirectory=(dir)=>require('electron').ipcRenderer.send('createDownloadDirectory', dir)
window.copyText=(text)=>navigator.clipboard.writeText(text)
