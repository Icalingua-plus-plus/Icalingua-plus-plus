window.external = {
    openWebWindow(d) {
        console.log(d);
        const parsed = JSON.parse(d)
        if (parsed.title === '选择题目') return
        window.open(parsed.url, '_blank');
    },
    addDownloadTask(path, name, size, _) {
        const uuid = path.split('/')[2];
        require('electron').ipcRenderer.send('downloadGroupFile',
            parseInt(new URLSearchParams(new URL("https://." + location.hash.substring(1)).search).get('gid')),
            uuid
        );
    },
    viewImage(url) {
        require('electron').ipcRenderer.send('openImage', url);
    }
}
const observer = new MutationObserver(() => {
    const nodes = document.querySelectorAll('a.btn-download');
    for (let a of nodes) {
        if (a.download != '') continue;
        let fileName = a.parentNode.querySelector('.file-title')?.title;
        if (fileName != null) {
            a.download = fileName;
            a.href = `${a.href}?fileName=${encodeURIComponent(fileName)}`;
        }
    }
});
window._ob = observer;
document.addEventListener('DOMContentLoaded', function () {
    observer.observe(document.body, {
        subtree: true,
        childList: true
    });
})
console.log('injected');
