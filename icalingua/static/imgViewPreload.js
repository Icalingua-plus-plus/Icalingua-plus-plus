window.copyImage = (url) => require('electron').ipcRenderer.send('copyImage', url)
window.saveSticker = (url) => require('electron').ipcRenderer.send('saveSticker', url)
window.downloadImage = (url, saveAs = false) => require('electron').ipcRenderer.send('downloadImage', url, saveAs)
