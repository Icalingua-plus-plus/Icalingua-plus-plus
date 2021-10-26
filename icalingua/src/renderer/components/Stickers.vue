<template>
    <div class="bg" ondragstart="return false;">
        <div class="head">
            <div class="title">
                <a
                    @click="setPanel('stickers')"
                    :class="{ selected: panel === 'stickers' }"
                >Stickers</a>
                <a
                    @click="setPanel('face')"
                    :class="{ selected: panel === 'face' }"
                >Face</a>
                <a
                    @click="setPanel('remote')"
                    :class="{ selected: panel === 'remote' }"
                >Remote</a>
                <a
                    @click="setPanel('emojis')"
                    :class="{ selected: panel === 'emojis' }"
                >Emojis</a>
            </div>
            <a @click="menu">
                <div class="opinion">
                    <i class="el-icon-more"></i>
                </div>
            </a>
        </div>
        <div v-show="panel === 'face'" style="overflow: auto">
            <div class="face grid" v-show="face.length">
                <div v-for="i in face" :key="i">
                    <img :src="'file://' + dir_face + i" @click="pickFace(i)"/>
                </div>
            </div>
        </div>
        <div v-show="panel === 'remote'" style="overflow: auto">
            <center v-show="!remote_pics.length">
                <p>No remote stickers found</p>
            </center>
            <div class="grid" v-show="remote_pics.length">
                <div v-for="i in remote_pics" :key="i.id">
                    <img :src="i.url" @click="picClick(i.url)" @click.right="itemMenu(i.url)"/>
                </div>
            </div>
        </div>
        <div v-if="panel === 'stickers'" style="overflow: auto">
            <center v-show="!pics.length">
                <p>No stickers found</p>
                <p>
                    <el-button @click="folder">Open stickers folder</el-button>
                </p>
            </center>
            <div class="grid" v-show="pics.length">
                <div v-for="i in pics" :key="i" v-if="i[0]!=='.'">
                    <img :src="'file://' + dir + i" @click="picClick(dir + i)" @click.right="itemMenu(i)"/>
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
import getStaticPath from '../../utils/getStaticPath'

export default {
    name: 'Stickers',
    components: {VEmojiPicker},
    data() {
        return {
            remote_pics: [],
            face: [],
            pics: [],
            dir: '',
            dir_face: '',
            panel: '',
        }
    },
    async created() {
        this.panel = await ipc.getLastUsedStickerType()

        // Remote Stickers
        this.remote_pics = await ipc.getRoamingStamp()

        // Face
        this.dir_face = path.join(getStaticPath(), 'face/')
        if (!fs.existsSync(this.dir_face)) {
            this.$message.error('No face folder found!')
            fs.mkdirSync(this.dir_face)
        }
        fs.readdir(this.dir_face, (_err, files) => {
            this.face = files
        })

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
        pickFace(face) {
            this.$emit('selectFace', face)
        },
        folder() {
            shell.openPath(this.dir)
        },
        menu: ipc.popupStickerMenu,
        itemMenu: ipc.popupStickerItemMenu,
        setPanel(type) {
            this.panel = type
            ipc.setLastUsedStickerType(type)
        },
    },
}
</script>

<style scoped lang="scss">
div.head {
  height: 64px;
  min-height: 64px;
  border-bottom: var(--chat-border-style);
  display: flex;
  align-items: center;
  font-size: 17px;
  padding: 0 16px;
  background-color: var(--panel-header-bg);
}

.title {
  width: 100%;
  a {
    margin-right: 8px;
    color: var(--panel-color-sticker-type);

    &.selected {
      color: var(--panel-color-sticker-type-selected);
    }

    &:hover:not(.selected) {
      color: var(--panel-color-sticker-type-hover);
    }
  }
}

.opinion {
  margin-left: 5px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--chat-color);
}

.opinion:hover {
  transform: scale(1.1);
  opacity: 0.7;
}

.grid {
  display: grid;
  width: 100%;
  overflow: hidden;
  grid-template-columns: 1fr 1fr 1fr 1fr;
}

.grid.face {
  grid-template-columns: repeat(9, 1fr);

  img {
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    margin: auto;
    width: 70%;
    height: unset;
  }
}

.grid img {
  object-fit: contain;
  width: 96%;
  height: 96%;
  position: absolute;
  border-color: var(--panel-background);
  border-width: 1px;
  border-style: solid;
  background-color: var(--panel-background);
  transition: border-color 0.5s;
}

.grid > div {
  width: 100%;
  height: 0;
  padding-bottom: 100%;
  position: relative;
  background-color: var(--panel-background);
}

.grid > div img:hover {
  border-color: #999;
}

.bg {
  background-color: var(--panel-background);
  height: -webkit-fill-available;
  display: flex;
  flex-direction: column;
}

@media screen and (min-width: 1200px) {
  .bg {
    border-left: var(--chat-border-style);
  }
}

</style>

<style scoped>
.emoji-picker {
  --ep-color-bg: auto !important;
  --ep-color-border: auto !important;
  --ep-color-sbg: #fff !important;
  --ep-color-active: #409eff !important;
  width: 100% !important;
  border: none !important;
}

::v-deep .container-emoji {
  height: calc(100vh - 147px) !important;
}
</style>
