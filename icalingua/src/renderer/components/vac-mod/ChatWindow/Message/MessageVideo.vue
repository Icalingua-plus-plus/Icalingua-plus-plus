<template>
    <div class="vac-video-container">
        <div v-if="isHidden">
            <details>
                <summary>Hidden video</summary>
                <video width="100%" height="100%" controls :src="url">
                    <source :src="url" />
                </video>
            </details>
        </div>
        <div v-else="isHidden">
            <video width="100%" height="100%" controls :src="url">
                <source :src="url" />
            </video>
        </div>
    </div>
</template>

<script>
export default {
    name: 'MessageVideo',
    props: {
        isHidden: { type: [Boolean], required: true },
        url: { type: [String], required: true },
    },
    data() {
        return {
            isHidden: false,
            url: '',
        }
    },
}
</script>

<style>
.vac-video-container details {
    cursor: pointer;
}
</style>
