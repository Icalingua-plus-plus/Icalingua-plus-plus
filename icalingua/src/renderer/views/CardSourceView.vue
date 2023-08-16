<template>
    <div id="box">
        <pre v-html="highlighted"></pre>
        <div id="tools">
            <el-checkbox v-model="isPretty">格式化</el-checkbox>
            <el-button type="primary" size="mini" @click="copy()">复制</el-button>
        </div>
    </div>
</template>

<script>
import { ipcRenderer } from 'electron'
import highlightjs from 'highlight.js'
import 'highlight.js/styles/a11y-dark.css'
import { XMLParser, XMLBuilder } from 'fast-xml-parser'

export default {
    name: 'CardSourceView',
    data() {
        return {
            language: 'json',
            source: '',
            prettySource: '',
            isPretty: true,
        }
    },
    async created() {
        ipcRenderer.on('setCardSource', (_, source) => {
            let isJSON = true
            let prettySource = source
            try {
                prettySource = JSON.stringify(JSON.parse(source), null, '    ')
            } catch (jsonError) {
                try {
                    isJSON = false
                    const options = {
                        ignoreAttributes: false,
                        attributeNamePrefix: '@@',
                        format: true,
                    }
                    const parser = new XMLParser(options)
                    const builder = new XMLBuilder(options)
                    prettySource = builder.build(parser.parse(source))
                } catch (xmlError) {
                    console.error(`格式化失败`, jsonError, xmlError)
                }
            }
            document.title = `${isJSON ? 'JSON' : 'XML'} 卡片源代码`
            this.language = isJSON ? 'json' : 'xml'
            this.source = source
            this.prettySource = prettySource
        })
    },
    computed: {
        highlighted() {
            return highlightjs.highlight(this.language, this.isPretty ? this.prettySource : this.source).value
        },
    },
    methods: {
        copy() {
            navigator.clipboard.writeText(this.isPretty ? this.prettySource : this.source)
        },
    },
}
</script>

<style>
#box {
    background: #2b2b2b;
    color: #f8f8f2;
    display: flex;
    flex-direction: column;
    height: 100vh;
}

pre {
    font-family: monospace;
    user-select: text;
    white-space: pre-wrap;
    overflow-y: auto;
    word-break: break-word;
    margin: 0;
    padding: 1em;
    flex-grow: 1;
}

pre * {
    font-family: inherit;
}

#tools {
    display: flex;
    margin: 0.5em;
    gap: 0.5em;
    align-items: center;
}
</style>
