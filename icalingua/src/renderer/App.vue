<template>
    <div id="app" :style="{ fontFamily }">
        <router-view></router-view>
    </div>
</template>

<script>
import fs from 'fs'
import path from 'path'
import ipc from './utils/ipc'
// import ui from '../main/utils/ui'

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

        this.fontFamily = await ipc.getFontFamilySetting()

        const customTheme = await ipc.getCustomThemeSetting()
        console.log(customTheme)

        for (const name of customTheme) {
            const cssPath = path.join(STORE_PATH, 'custom_themes', `${name}.css`)
            const jsPath = path.join(STORE_PATH, 'custom_themes', `${name}.js`)
            const existCss = fs.existsSync(cssPath)
            const existJs = fs.existsSync(jsPath)
            if (existCss) dynamicLoadCss('file://' + cssPath)
            if (existJs) dynamicLoadJs('file://' + jsPath)
            if (!existCss && !existJs) console.error(`没有找到 ${name} 的样式文件`)
        } 
    },
	data() {
        return {
            fontFamily: ''
        }
	}
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
    font-family: inherit;
}

:focus {
    outline: none;
}

div#app {
    -webkit-user-select: none;
}
</style>
