<template>
    <div class="root">
        <input
            ref="input"
            v-model="search"
            @keydown.esc.stop="cancel"
            @keydown.arrow-down="selectNext"
            @keydown.arrow-up="selectLast"
            @keydown.enter.prevent="confirm(selectedIndex)"
            @input="selectedIndex = 0"
            @blur="$nextTick(cancel)"
        />
        <small>{{ matched.length }} face(s)</small>
        <ul ref="faceList">
            <li
                v-for="([ name, id ], index) in matched"
                :key="index"
                :class="{ selected: index === selectedIndex }"
                @mousedown="
                    confirmedByClick = true
                    confirm(index)
                "
            >
                <p>{{ name }}</p>
                <img :src="`file://${faceDir}/${id}`" />
            </li>
        </ul>
    </div>
</template>

<script>
import faceNames from '../../../static/faceNames.js'
import getStaticPath from '../../utils/getStaticPath'
import path from 'path'

export default {
    data() {
        return {
            faceNames,
            selectedIndex: 0,
            search: '',
            confirmedByClick: false,
            faceDir: path.join(getStaticPath(), 'face')
        }
    },
    methods: {
        focus() {
            this.$refs.input.focus()
        },
        cancel() {
            if (this.confirmedByClick) {
                this.confirmedByClick = false
                return
            }
            this.search = ''
            this.selectedIndex = 0
            this.$emit('cancel')
        },
        confirm(index) {
            const selected = this.matched[index]
            if (selected) this.$emit('confirm', selected[1])
            else this.$emit('cancel')
            this.search = ''
            this.selectedIndex = 0
        },
        selectNext() {
            if (++this.selectedIndex >= this.matched.length) this.selectedIndex = 0
            this.scrollToSelected()
        },
        selectLast() {
            if (--this.selectedIndex < 0) this.selectedIndex = this.matched.length - 1
            this.scrollToSelected()
        },
        scrollToSelected() {
            const list = this.$refs.faceList
            list.scrollTo(0, list.children[this.selectedIndex].offsetTop - 32)
        }
    },
    computed: {
        matched() {
            return this.faceNames.filter(([name]) => name.startsWith(this.search))
        },
    },
    emits: {
        cancel: null,
        confirm: null,
    },
}
</script>

<style scoped>
.root {
    position: absolute;
    width: 200px;
    bottom: 50px;
    border-radius: 8px;
    background: var(--chat-message-bg-color-me);
}
input {
    padding: 3px 10px;
    width: 80px;
    border-radius: 8px;
    border: none;
    font-size: 18px;
    background: var(--chat-color);
}
small {
    float: right;
    margin-top: 8px;
}
ul {
    padding-left: 0;
    margin: 8px 2px;
    list-style-type: none;
    max-height: 400px;
    overflow-y: scroll;
}
li {
    display: flex;
    justify-content: space-between;
    height: 26px;
    padding: 2px 8px;
    border-radius: 3px;
}
li.selected,
li:hover {
    background: var(--chat-message-bg-color-reply);
}
li > p {
    margin: 0;
    margin-top: 4px;
}
li > img {
    width: 25px;
    height: 25px;
}
</style>
