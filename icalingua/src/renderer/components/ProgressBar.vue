<template>
    <el-progress :text-inside="true" :stroke-width="20" :percentage="integerValue"></el-progress>
</template>

<script>
export default {
    name: 'ProgressBar',
    data: function () {
        return {
            value: 0,
        }
    },
    methods: {
        setValue(value) {
            this.value = value
        },
    },
    computed: {
        integerValue() {
            return Math.round(this.value)
        },
    },
}
</script>
