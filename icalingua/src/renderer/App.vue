<template>
    <div id="app">
        <router-view></router-view>
    </div>
</template>

<script>
import fs from 'fs'
import path from 'path'
import ipc from './utils/ipc'

function dynamicLoadCss(url) {
    const head = document.getElementsByTagName('head')[0]
    const link = document.createElement('link')
    link.type = 'text/css'
    link.rel = 'stylesheet'
    link.href = url
    head.appendChild(link)
}

function dynamicLoadJs(url) {
    const head = document.getElementsByTagName('head')[0]
    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.src = url
    head.appendChild(script)
}

export default {
    name: 'app',
    async created() {
        const STORE_PATH = await ipc.getStorePath()
        if (fs.existsSync(path.join(STORE_PATH, 'style.css'))) {
            console.log('custom CSS applied')
            dynamicLoadCss('file://' + path.join(STORE_PATH, 'style.css'))
        }
        if (fs.existsSync(path.join(STORE_PATH, 'addon.js'))) {
            console.log('custom js applied')
            dynamicLoadJs('file://' + path.join(STORE_PATH, 'addon.js'))
        }
    },
}
</script>

<style>
@import url('./assets/stylesheet.css');
@import url('./assets/scrollbar.css');

@font-face {
    font-family: 'msyh';
    src: url('./assets/msyh.ttf');
}

@font-face {
    font-family: 'twemoji';
    src: url('./assets/Twemoji.ttf');
}

html,
body {
    /*height: 100%;*/
    width: 100%;
    margin: 0;
    color: #303133;
}

* {
    font-family: font, 'CircularSpotifyTxT Book Web', msyh, twemoji, 'PingFang SC', sans-serif;
}

:focus {
    outline: none;
}

div#app {
    -webkit-user-select: none;
}
</style>
