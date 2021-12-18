const mimes = {
    //https://developer.mozilla.org/zh-CN/docs/Web/HTML/Element/img
    apng: 'image/apng',
    avif: 'image/avif',
    bmp: 'image/bmp',
    gif: 'image/gif',
    ico: 'image/x-icon',
    cur: 'image/x-icon',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    jfif: 'image/jpeg',
    pjpeg: 'image/jpeg',
    pjp: 'image/jpeg',
    png: 'image/png',
    svg: 'image/svg+xml',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    webp: 'image/webp',

    //https://blog.csdn.net/xue251248603/article/details/52982263
    flv: 'video/x-flv',
    mp4: 'video/mp4',
    ts: 'video/MP2T',
    '3gp': 'video/3gpp',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    wmv: 'video/x-ms-wmv',
    m4v: 'video/x-m4v',
    webm: 'video/webm',
    ogv: 'video/ogg',
    mpeg: 'video/mpeg',

    //https://www.dute.org/mime-type
    mp3: 'audio/mpeg',
    mid: 'audio/midi',
    midi: 'audio/midi',
    m4a: 'audio/x-m4a',
    ogg: 'audio/ogg',
}

export default (ext: string) => {
    ext = ext.toLowerCase()
    if (ext.startsWith('.')) ext = ext.substr(1)
    if (mimes[ext]) return mimes[ext]
    return 'application/octet-stream'
}
