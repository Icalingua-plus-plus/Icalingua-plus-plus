window.download=(url, out)=>require('electron').ipcRenderer.send('download', url, out)
