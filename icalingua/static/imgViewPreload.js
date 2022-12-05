window.copyImage = (url) => require('electron').ipcRenderer.send('copyImage', url)
