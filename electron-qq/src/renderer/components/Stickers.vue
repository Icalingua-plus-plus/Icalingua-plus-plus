<template>
	<div class="bg" ondragstart="return false;">
		<div class="head">
			<div class="title">
        <a
            @click="panel = 'remote'"
            :class="{ selected: panel === 'remote' }"
        >Remote</a
        >
				<a
					@click="panel = 'stickers'"
					:class="{ selected: panel === 'stickers' }"
				>Stickers</a
				>
				<a @click="panel = 'emojis'" :class="{ selected: panel === 'emojis' }"
				>Emojis</a
				>
			</div>
			<a @click="menu">
				<div class="opinion">
					<i class="el-icon-more"></i>
				</div>
			</a>
		</div>
    <div v-show="panel === 'remote'" style="overflow: auto">
      <center v-show="!remote_pics.length">
        <p>No remote stickers found</p>
      </center>
      <div class="grid" v-show="remote_pics.length">
        <div v-for="i in remote_pics" :key="i" v-if="i[0]!=='.'">
          <img :src="i.url" @click="picClick(i.url)"/>
        </div>
      </div>
    </div>
		<div v-show="panel === 'stickers'" style="overflow: auto">
			<center v-show="!pics.length">
				<p>No stickers found</p>
				<p>
					<el-button @click="folder">Open stickers folder</el-button>
				</p>
			</center>
			<div class="grid" v-show="pics.length">
				<div v-for="i in pics" :key="i" v-if="i[0]!=='.'">
					<img :src="'file://'+dir + i" @click="picClick(dir + i)"/>
				</div>
			</div>
		</div>
		<div v-show="panel === 'emojis'">
			<VEmojiPicker @select="$emit('selectEmoji', $event)"/>
		</div>
	</div>
</template>

<script>
import {VEmojiPicker} from 'v-emoji-picker'
import {shell} from 'electron'
import ipc from '../utils/ipc'
import fs from 'fs'
import path from 'path'

export default {
	name: 'Stickers',
	components: {VEmojiPicker},
	data() {
		return {
		  remote_pics: [],
			pics: [],
			dir: '',
			panel: 'remote',
		}
	},
	async created() {
	  // Remote Stickers
    this.remote_pics = await ipc.getRoamingStamp()

    // Stickers
		this.dir = path.join(await ipc.getStorePath(), 'stickers/')
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
		menu: ipc.popupStickerMenu,
	},
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
	height: 0;
	padding-bottom: 100%;
	position: relative;
	background-color: #fff;
}

.grid > div img:hover {
	border-color: #999;
}

.bg {
	background-color: #fff;
	height: -webkit-fill-available;
	display: flex;
	flex-direction: column;
}

.title a {
	margin-right: 8px;
}

.title a.selected {
	color: #409eff;
}

.title a:hover:not(.selected) {
	color: rgb(102, 177, 255);
}

@media screen and (min-width: 1200px) {
	.bg {
		border-left: 1px solid #e1e4e8;
	}
}

</style>

<style scoped>
.emoji-picker {
	--ep-color-bg: #fff !important;
	--ep-color-border: #fff !important;
	--ep-color-sbg: #fff !important;
	--ep-color-active: #409eff !important;
	width: 100% !important;
	border: none !important;
}

::v-deep .container-emoji {
	height: calc(100vh - 147px) !important;
}
</style>
