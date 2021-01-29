<template>
	<div class="grid">
		<div v-for="i in pics" :key="i">
			<img :src="dir + i" @click="picClick(dir+i)"/>
		</div>
	</div>
</template>

<script>
	const fs = require('fs')
	const path = require('path')
	export default {
		name: "Stickers",
		data() {
			return {
				pics: [],
				dir: path.join(__static, '/stickers/')
			}
		},
		created() {
			fs.readdir(path.join(__static, '/stickers/'), (err, files) => {
				this.pics = files
			})
        },
        methods: {
            picClick(pic){
                this.$emit('send', pic)
            }
        }
	}
</script>

<style scoped>
	.grid {
		display: grid;
		height: 100vh;
		overflow-y: auto;
		grid-template-columns: 1fr 1fr 1fr 1fr;
	}
	.grid img {
		object-fit: contain;
        width:100%;
        height:100%;
        position:absolute;
	}
	.grid > div {
		width: 100%;
            height:0px;
    padding-bottom:100%;
    position:relative;
	}
</style>