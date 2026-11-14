<template>
    <div class="vac-video-container">
        <div v-if="isHidden">
            <details>
                <summary>Hidden video</summary>
                <video width="100%" height="100%" controls :src="url" :autoplay="autoplay">
                    <source :src="url" />
                </video>
            </details>
        </div>
        <div v-else>
            <video width="100%" height="100%" controls :src="url" :autoplay="autoplay">
                <source :src="url" />
            </video>
        </div>
    </div>
</template>

<script>
export default {
    name: 'MessageVideo',
    props: {
        isHidden: { type: Boolean, required: true },
        autoplay: { type: Boolean, default: false },
        url: { type: String, required: true },
    },
}
</script>

<style>
.vac-video-container details {
    cursor: pointer;
}
</style>
