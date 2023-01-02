<template>
    <a @click="$emit('click')" @click.middle="$emit('click-middle')" @click.right="$emit('click-right')">
        <div :class="{ selected }">
            <i :class="icon"></i>
            <i :class="{ redPoint }"></i>
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
        selected: Boolean,
        redPoint: Boolean,
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
a > div > i {
    font-size: 24px;
}
.redPoint {
    position: relative;
}
.redPoint::before {
    position: absolute;
    content: '';
    top: 0;
    right: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: #ff0000;
}
</style>
