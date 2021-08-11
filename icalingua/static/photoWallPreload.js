window.eqqShowImage=(url)=>require('electron').ipcRenderer.send('openImage', url)
