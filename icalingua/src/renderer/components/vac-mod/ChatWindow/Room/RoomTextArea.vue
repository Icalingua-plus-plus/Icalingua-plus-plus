<template>
    <textarea ref="roomTextarea" v-model="message" @input="onChangeInput" @click.right="textctx" />
</template>
<script>
export default {
    name: 'RoomTextArea',
    data() {
        return {
            message: '',
        }
    },
    watch: {
        message() {
            this.$parent.isMessageEmpty = !this.$parent.file && !this.message.trim()
            this.$parent.message = this.message
        },
    },
    methods: {
        onChangeInput(...args) {
            this.$emit('input', ...args)
        },
        textctx(...args) {
            this.$emit('click-right', ...args)
        },
    },
}
</script>
