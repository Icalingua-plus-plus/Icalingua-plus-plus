<template>
    <div class="root">
        <input
            ref="input"
            spellcheck="false"
            v-model="search"
            :style="{ width: inputSize + 'px' }"
            @keydown.esc.stop="cancel"
            @keydown.arrow-down="selectNext"
            @keydown.arrow-up="selectLast"
            @keydown.enter.prevent="confirm(selectedIndex)"
            @keydown.backspace="breakspace"
            @input="selectedIndex = 0"
            @blur="$nextTick(cancel)"
        />
        <small>{{ matched.length }} {{ description }}</small>
        <ul ref="list">
            <li
                v-for="([name, id], index) in matched"
                :key="index"
                :class="{ selected: index === selectedIndex }"
                @mousedown="confirm(index)"
            >
                <slot v-bind="{ name, id }"></slot>
            </li>
        </ul>
    </div>
</template>

<script>
export default {
    data() {
        return {
            selectedIndex: 0,
            search: '',
            confirmed: false,
        }
    },
    props: {
        list: Array,
        description: String,
        searchMethod: String,
        inputSize: String,
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
        breakspace() {
            if (this.search.length === 0) {
                this.cancel()
            }
        },
        confirm(index) {
            const selected = this.matched[index] || []
            this.$emit('confirm', selected[1], selected[0])
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
            const list = this.$refs.list
            // FIXME: 使用更科学的方法计算滚动，这个 40px 不知道怎么来的……
            list.scrollTo(0, list.children[this.selectedIndex].offsetTop - 40)
        },
    },
    computed: {
        matched() {
            const matched =
                this.searchMethod === 'includes'
                    ? this.list.filter(
                          ([name, id]) =>
                              name[this.searchMethod](this.search) || id.toString()[this.searchMethod](this.search),
                      )
                    : this.list.filter(([name]) => name[this.searchMethod](this.search))
            if (matched.length === 0) {
                this.$emit('nomatch', this.search)
            }
            return matched
        },
    },
}
</script>

<style scoped>
.root {
    position: absolute;
    min-width: 200px;
    bottom: 55px;
    padding: 5px;
    border-radius: 8px;
    background: var(--chat-message-bg-color-me);
}
input {
    padding: 3px 10px;
    border-radius: 8px;
    border: none;
    font-size: 18px;
}
small {
    float: right;
    margin-top: 8px;
}
ul {
    padding-left: 0;
    margin: 8px 0 2px 0;
    list-style-type: none;
    max-height: calc(100vh - 250px);
    overflow-y: scroll;
}
li {
    display: flex;
    justify-content: space-between;
    min-height: 26px;
    padding: 2px 8px;
    border-radius: 3px;
    align-items: center;
    line-height: 100%;
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
