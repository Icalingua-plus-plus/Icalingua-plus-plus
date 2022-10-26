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
    }
}
console.log('injected');
