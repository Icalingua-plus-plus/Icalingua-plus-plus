<template>
	<div class="bg" ondragstart="return false;">
		<div class="head">
			<div class="title">Stickers</div>
			<a @click="menu">
				<div class="opinion">
					<i class="el-icon-more"></i>
				</div>
			</a>
		</div>
		<center v-show="!pics.length">
			<p>No stickers found</p>
			<p>
				<el-button @click="folder">Open stickers folder</el-button>
			</p>
		</center>
		<div class="grid" v-show="pics.length">
			<div v-for="i in pics" :key="i">
				<img :src="dir + i" @click="picClick(dir + i)" />
			</div>
		</div>
	</div>
</template>

<script>
	import { remote, shell } from 'electron'
	const fs = require('fs')
	const path = require('path')
	const STORE_PATH = remote.app.getPath('userData')

	export default {
		name: "Stickers",
		data() {
			return {
				pics: [],
				dir: path.join(STORE_PATH, '/stickers/')
			}
		},
		created() {
			if (!fs.existsSync(this.dir)) {
				fs.mkdirSync(this.dir)
			}
			fs.watch(this.dir, () => {
				fs.readdir(this.dir, (_err, files) => {
					this.pics = files
				})
			})
			fs.readdir(this.dir, (_err, files) => {
				this.pics = files
			})
		},
		methods: {
			picClick(pic) {
				this.$emit('send', pic)
			},
			folder() {
				shell.openPath(this.dir)
			},
			menu() {
				const menu = remote.Menu.buildFromTemplate([
					{ label: 'Open stickers folder', type: 'normal', click: this.folder },
					{ label: 'Close panel', type: 'normal', click: () => this.$emit('close') },
				])
				menu.popup({ window: remote.getCurrentWindow() })
			}
		}
	}
</script>

<style scoped>
	div.head {
		height: 64px;
		min-height: 64px;
		border-bottom: 1px solid #e1e4e8;
		display: flex;
		align-items: center;
		font-size: 17px;
		padding: 0 16px;
	}
	.title {
		width: 100%;
	}
	.opinion {
		margin-left: 5px;
		font-size: 16px;
		cursor: pointer;
		transition: all 0.2s;
	}
	.opinion:hover {
		transform: scale(1.1);
		opacity: 0.7;
	}
	.grid {
		display: grid;
		width: 100%;
		overflow-y: auto;
		grid-template-columns: 1fr 1fr 1fr 1fr;
	}
	.grid img {
		object-fit: contain;
		width: 96%;
		height: 96%;
		position: absolute;
		border-color: #fff;
		border-width: 1px;
		border-style: solid;
		background-color: #fff;
		transition: border-color 0.5s;
	}
	.grid > div {
		width: 100%;
		height: 0px;
		padding-bottom: 100%;
		position: relative;
		background-color: #fff;
	}
	.grid > div img:hover {
		border-color: #999;
	}
	.bg {
		background-color: #fff;
		height: 100vh;
		display: flex;
		flex-direction: column;
		border-left: 1px solid #e1e4e8;
	}
</style>