const tmp = console.log
console.log = (...args) => {
    if (args[0] === 'handleImgClick') {
        require('electron').ipcRenderer.send('openImage', args[1])
    }
    else {
        tmp(args)
    }
}
