<template>
    <div id="box">
        <pre v-html="highlighted" :style="{ tabSize: indentSize }"></pre>
        <div id="tools">
            <el-button type="primary" size="mini" @click="copy()">复制</el-button>
            <el-button size="mini" @click="save()">保存</el-button>
            <el-checkbox v-if="language != 'plaintext'" v-model="isPretty">格式化</el-checkbox>
            <el-checkbox v-if="language != 'plaintext' && isPretty" v-model="tabIndent">Tab 缩进</el-checkbox>
            <el-input-number
                :min="1"
                :max="8"
                :precision="0"
                size="mini"
                v-if="language != 'plaintext' && isPretty"
                v-model="indentSize"
            ></el-input-number>
        </div>
    </div>
</template>

<script>
import { ipcRenderer } from 'electron'
import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser'
import highlightjs from 'highlight.js'
import 'highlight.js/styles/a11y-dark.css'

export default {
    name: 'CardSourceView',
    data() {
        return {
            language: 'plaintext',
            source: '',
            parsed: {},
            filename: '未命名',
            isPretty: true,
            tabIndent: false,
            indentSize: 4,
        }
    },
    async created() {
        ipcRenderer.on('setCardSource', (_, source, filename) => {
            console.log(source, filename)
            this.source = source
            this.filename = filename
            try {
                this.parsed = JSON.parse(source)
                this.language = 'json'
                document.title = `JSON 卡片源代码`
            } catch (jsonError) {
                try {
                    const vaildateResult = XMLValidator.validate(source)
                    if (vaildateResult != true) {
                        throw vaildateResult.err
                    }
                    this.parsed = new XMLParser({ ignoreAttributes: false }).parse(source)
                    this.language = 'xml'
                    document.title = `XML 卡片源代码`
                } catch (xmlError) {
                    console.error('解析卡片失败\n作为 JSON:', jsonError, '\n作为 XML:', xmlError)
                    this.parsed = {}
                    this.language = 'plaintext'
                    document.title = `卡片源代码`
                }
            }
        })
    },
    computed: {
        highlighted() {
            return highlightjs.highlight(this.language, this.isPretty ? this.prettySource : this.source).value
        },
        prettySource() {
            if (this.language == 'plaintext') {
                return this.source
            }
            const indent = this.tabIndent ? '\t' : ' '.repeat(this.indentSize)
            if (this.language == 'json') {
                return JSON.stringify(this.parsed, null, indent)
            } else {
                return new XMLBuilder({
                    ignoreAttributes: false,
                    format: true,
                    indentBy: indent,
                }).build(this.parsed)
            }
        },
    },
    methods: {
        copy() {
            navigator.clipboard.writeText(this.isPretty ? this.prettySource : this.source)
        },
        save() {
            const ext = this.language == 'plaintext' ? 'txt' : this.language
            ipcRenderer.send('saveTextAs', this.isPretty ? this.prettySource : this.source, this.filename + '.' + ext)
        },
    },
}
</script>

<style scoped>
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

.el-checkbox {
    margin-right: 0;
    color: inherit;
}

.el-button + .el-button {
    margin-left: 0;
}

.el-input-number {
    width: 100px;
}
</style>
