<template>
    <a :title="title" @click="$emit('click')" @click.middle="$emit('click-middle')" @click.right="$emit('click-right')">
        <div :class="{ selected }">
            <span class="icon-wrapper">
                <slot name="icon"><i :class="icon"></i></slot>
                <span v-if="redPoint > 0" class="redPoint">{{ redPoint }}</span>
            </span>
            <br />
            {{ name }}
        </div>
    </a>
</template>

<script>
export default {
    name: 'SideBarIcon',
    props: {
        icon: String,
        name: String,
        title: String,
        selected: Boolean,
        redPoint: {
            type: Number,
            default: 0,
        },
    },
}
</script>

<style scoped>
.selected {
    color: #19bdd2;
}
a {
    cursor: pointer;
}
a > div {
    margin-top: 20px;
    font-size: 12px;
    word-break: break-all;
}
.icon-wrapper {
    position: relative;
    display: inline-block;
    height: 24px;
}
.icon-wrapper > i {
    font-size: 24px;
}
.redPoint {
    position: absolute;
    top: 0;
    right: 0;
    transform: translate(50%, -50%);
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    box-sizing: border-box;
    border-radius: 7px;
    background-color: #ff0000;
    color: #fff;
    display: grid;
    place-items: center;
    font-family: msyh;
    font-size: 10px;
    font-style: normal;
    line-height: 1;
    text-align: center;
    white-space: nowrap;
}
</style>
