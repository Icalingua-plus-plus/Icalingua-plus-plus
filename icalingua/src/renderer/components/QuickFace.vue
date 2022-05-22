<template>
    <div class="root">
        <input
            ref="input"
            spellcheck="false"
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
                @mousedown="confirm(index)"
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
            faceDir: path.join(getStaticPath(), 'face'),
            confirmed: false
        }
    },
    methods: {
        focus() {
            this.$refs.input.focus()
        },
        cancel() {
            if (this.confirmed) {
                this.confirmed = false
                return
            }
            this.search = ''
            this.selectedIndex = 0
            this.$emit('cancel')
        },
        confirm(index) {
            const selected = this.matched[index] || []
            this.$emit('confirm', selected[1])
            this.search = ''
            this.selectedIndex = 0
            this.confirmed = true
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
            // FIXME: 使用更科学的方法计算滚动，这个 40px 不知道怎么来的……
            list.scrollTo(0, list.children[this.selectedIndex].offsetTop - 40)
        }
    },
    computed: {
        matched() {
            return this.faceNames.filter(([name]) => name.startsWith(this.search))
        },
    }
}
</script>

<style scoped>
.root {
    position: absolute;
    width: 200px;
    bottom: 50px;
    padding: 5px;
    border-radius: 8px;
    background: var(--chat-message-bg-color-me);
}
input {
    padding: 3px 10px;
    width: 80px;
    border-radius: 8px;
    border: none;
    font-size: 18px;
    background: var();
}
small {
    float: right;
    margin-top: 8px;
}
ul {
    padding-left: 0;
    margin: 8px 0 2px 0;
    list-style-type: none;
    max-height: 390px;
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
