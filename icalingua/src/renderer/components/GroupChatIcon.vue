<template>
    <svg
        class="group-chat-icon"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        focusable="false"
    >
        <circle cx="12" cy="7.25" r="3" />
        <circle cx="5.5" cy="9.25" r="2.25" />
        <circle cx="18.5" cy="9.25" r="2.25" />
        <path d="M5.5 20c.25-4.1 2.55-6.25 6.5-6.25s6.25 2.15 6.5 6.25" />
        <path d="M1.75 18c.12-2.8 1.65-4.45 4.25-4.45 1.05 0 1.93.27 2.62.77" />
        <path d="M22.25 18c-.12-2.8-1.65-4.45-4.25-4.45-1.05 0-1.93.27-2.62.77" />
    </svg>
</template>

<script>
export default {
    name: 'GroupChatIcon',
}
</script>

<style scoped>
.group-chat-icon {
    width: 24px;
    height: 24px;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    vertical-align: -5px;
}
</style>
