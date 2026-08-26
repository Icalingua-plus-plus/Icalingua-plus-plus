const { ipcRenderer, webUtils } = require('electron')
window.webUtils=webUtils
window.download=(url, out, dir, saveAs)=>ipcRenderer.send('download', url, out, dir, saveAs)
window.createDownloadDirectory=(dir)=>ipcRenderer.send('createDownloadDirectory', dir)
window.uploadGroupFile=(groupId, filePath, pid, fileName, onProgress)=>{
    const requestId=`${Date.now()}-${Math.random().toString(16).slice(2)}`
    const progressListener=(_, id, progress)=>{
        if(id===requestId&&typeof onProgress==='function') onProgress(progress)
    }
    ipcRenderer.on('uploadGroupFileProgress', progressListener)
    return ipcRenderer.invoke('uploadGroupFile', requestId, groupId, filePath, pid, fileName).finally(()=>{
        ipcRenderer.removeListener('uploadGroupFileProgress', progressListener)
    })
}
window.copyText=(text)=>navigator.clipboard.writeText(text)
