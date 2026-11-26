<template>
    <div class="virtual-contact-group">
        <button
            type="button"
            class="el-collapse-item__header contact-group-header"
            :class="{ 'is-active': expanded }"
            :aria-expanded="expanded"
            @click="$emit('toggle')"
        >
            {{ title }}
            <i class="el-collapse-item__arrow el-icon-arrow-right" :class="{ 'is-active': expanded }" />
        </button>
        <transition
            name="contact-group-collapse"
            @before-enter="beforeEnter"
            @enter="enter"
            @after-enter="clearHeight"
            @before-leave="beforeLeave"
            @leave="leave"
            @after-leave="afterLeave"
        >
            <div v-show="expanded" class="contact-group-body">
                <div class="contact-group-spacer" :style="{ height: items.length * rowHeight + 'px' }">
                    <div
                        class="contact-group-window"
                        :style="{ transform: `translateY(${range.start * rowHeight}px)` }"
                    >
                        <div v-for="item in visibleContacts" :key="item.id" class="contact-group-entry">
                            <ContactEntry
                                :id="item.id"
                                :name="item.name"
                                :remark="item.remark"
                                @click="$emit('click', item.id, item.chatName)"
                                @dblclick="$emit('dblclick', item.id, item.chatName)"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </transition>
    </div>
</template>

<script>
import ContactEntry from './ContactEntry.vue'

export default {
    name: 'VirtualContactGroup',
    components: { ContactEntry },
    props: {
        title: { type: String, required: true },
        items: { type: Array, required: true },
        expanded: { type: Boolean, required: true },
        contact: { type: Function, required: true },
        viewport: { type: Object, required: true },
    },
    data() {
        return { bodyVisible: this.expanded, rowHeight: 71 }
    },
    computed: {
        range() {
            if (!this.bodyVisible || this.viewport.height <= 0) return { start: 0, end: 0 }
            const top = this.viewport.scrollTop - this.viewport.offset - 49
            const bottom = top + this.viewport.height
            if (bottom <= 0 || top >= this.items.length * this.rowHeight) return { start: 0, end: 0 }
            return {
                start: Math.max(0, Math.floor(top / this.rowHeight) - 5),
                end: Math.min(this.items.length, Math.ceil(bottom / this.rowHeight) + 5),
            }
        },
        visibleContacts() {
            return this.items.slice(this.range.start, this.range.end).map(this.contact)
        },
    },
    watch: {
        expanded(value) {
            // Keep visible rows until the closing animation finishes.
            if (value) this.bodyVisible = true
        },
    },
    methods: {
        beforeEnter(element) {
            const height = element.style.display === 'none' ? 0 : element.getBoundingClientRect().height
            element.style.height = height + 'px'
        },
        enter(element) {
            element.style.height = element.scrollHeight + 'px'
        },
        clearHeight(element) {
            element.style.height = ''
        },
        beforeLeave(element) {
            element.style.height = element.getBoundingClientRect().height + 'px'
        },
        leave(element) {
            // Flush the starting height before transitioning to zero.
            void element.offsetHeight
            element.style.height = '0px'
        },
        afterLeave(element) {
            this.clearHeight(element)
            if (!this.expanded) this.bodyVisible = false
        },
    },
}
</script>

<style scoped>
.contact-group-header {
    box-sizing: border-box;
    width: 100%;
    height: 49px;
    padding: 0 0 0 12px;
    border: 0;
    border-bottom: var(--chat-border-style);
    text-align: left;
    font-family: inherit;
}

.contact-group-spacer {
    position: relative;
}

.contact-group-window {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
}

.contact-group-entry {
    height: 71px;
    overflow: hidden;
}

.contact-group-collapse-enter-active,
.contact-group-collapse-leave-active {
    overflow: hidden;
    transition: height 0.3s cubic-bezier(0.645, 0.045, 0.355, 1);
}
</style>
