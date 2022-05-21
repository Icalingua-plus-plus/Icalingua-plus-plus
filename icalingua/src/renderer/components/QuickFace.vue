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
        <ul>
            <li
                v-for="(face, index) in matched"
                :key="index"
                :class="{ selected: index === selectedIndex }"
                @mousedown="
                    confirmedByClick = true
                    confirm(index)
                "
            >
                {{ face[0] }}
            </li>
        </ul>
    </div>
</template>

<script>
import faceNames from '../../../static/face/names.js'

export default {
    data() {
        return {
            faceNames,
            selectedIndex: 0,
            search: '',
            confirmedByClick: false,
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
            console.log('QuickFace cancel')
            this.search = ''
            this.$emit('cancel')
        },
        confirm(index) {
            const selected = this.matched[index]
            if (selected) this.$emit('confirm', selected[1])
            else this.$emit('cancel')
            this.search = ''
        },
        selectNext() {
            if (++this.selectedIndex >= this.matched.length) this.selectedIndex = 0
        },
        selectLast() {
            if (--this.selectedIndex < 0) this.selectedIndex = this.matched.length - 1
        },
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
    bottom: 50px;
    border-radius: 8px;
    background: var(--chat-message-bg-color-me);
}
input {
    border-radius: 8px;
    border: none;
    padding: 3px 10px;
    font-size: 18px;
    background: var(--chat-color);
}
ul {
    padding-left: 0;
    margin: 8px 2px;
    list-style-type: none;
}
li {
    padding: 2px 8px;
    border-radius: 3px;
}
li.selected,
li:hover {
    background: var(--chat-message-bg-color-reply);
}
</style>
