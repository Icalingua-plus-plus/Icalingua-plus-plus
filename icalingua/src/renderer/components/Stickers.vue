<template>
    <div class="bg" ondragstart="return false;">
        <div class="head">
            <div class="title">
                <a @click="setPanel('stickers')" :class="{ selected: panel === 'stickers' }">Stickers</a>
                <a @click="setPanel('face')" :class="{ selected: panel === 'face' }">Face</a>
                <a @click="setPanel('remote')" :class="{ selected: panel === 'remote' }">Remote</a>
                <a @click="setPanel('emojis')" :class="{ selected: panel === 'emojis' }">Emojis</a>
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
                    <img :src="'file://' + dir_face + i" @click="pickFace(i)" />
                </div>
            </div>
        </div>
        <div v-show="panel === 'remote'" style="overflow: auto">
            <center v-show="!remote_pics.length">
                <p>No remote stickers found</p>
            </center>
            <div class="grid" v-show="remote_pics.length">
                <div v-for="i in remote_pics" :key="i.id">
                    <img :src="i.url" @click="picClick(i.url)" @click.right="itemMenu(i.url)" />
                </div>
            </div>
        </div>
        <div class="stickers_dir" v-if="panel === 'stickers'" @wheel="wheelHandler" ref="stickers_dir">
            <a
                v-for="i in subdirs.filter((i) => i[0] !== '.')"
                :key="i"
                :name="i"
                @click="changeCurrentDir(i)"
                @click.right="dirMenu(i)"
                :class="{ selected: current_dir === i || (i === 'Default' && dir === default_dir) }"
                >{{ i }}</a
            >
        </div>
        <div v-if="panel === 'stickers'" style="overflow: auto">
            <center v-show="!pics.length">
                <p>No stickers found</p>
                <p>
                    <el-button @click="folder">Open stickers folder</el-button>
                </p>
            </center>
            <div class="grid" v-show="pics.length">
                <div v-for="i in pics.filter((i) => i[0] !== '.')" :key="i">
                    <img :src="'file://' + dir + i" @click="picClick(dir + i)" @click.right="itemMenu(dir + i)" />
                </div>
            </div>
        </div>
        <div class="emoji-panel" v-show="panel === 'emojis'">
            <VEmojiPicker @select="$emit('selectEmoji', $event)" />
        </div>
    </div>
</template>

<script>
import { VEmojiPicker } from 'v-emoji-picker'
import { shell } from 'electron'
import ipc from '../utils/ipc'
import fs from 'fs'
import path from 'path'
import getStaticPath from '../../utils/getStaticPath'

export default {
    name: 'Stickers',
    components: { VEmojiPicker },
    data() {
        return {
            remote_pics: [],
            face: [],
            pics: [],
            dir: '',
            dir_face: '',
            panel: '',
            subdirs: [],
            default_dir: '',
            current_dir: 'Default',
        }
    },
    async created() {
        this.panel = await ipc.getLastUsedStickerType()

        // Remote Stickers
        setTimeout(async () => (this.remote_pics = await ipc.getRoamingStamp()), 10 * 1000)

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
        this.default_dir = this.dir
        if (!fs.existsSync(this.dir)) {
            fs.mkdirSync(this.dir)
        }
        fs.watch(this.dir, () => {
            fs.readdir(this.dir, (_err, files) => {
                this.pics = files.filter((i) => !fs.statSync(this.dir + i).isDirectory())
            })
        })
        fs.watch(this.default_dir, () => {
            //如果是文件夹则加入到subdirs数组中
            fs.readdir(this.default_dir, (_err, files) => {
                this.subdirs = files.filter((i) => fs.statSync(this.default_dir + i).isDirectory())
                this.subdirs = ['Default', ...this.subdirs]
            })
        })
        fs.readdir(this.default_dir, (_err, files) => {
            this.subdirs = files.filter((i) => fs.statSync(this.default_dir + i).isDirectory())
            this.subdirs = ['Default', ...this.subdirs]
        })
        fs.readdir(this.dir, (_err, files) => {
            this.pics = files.filter((i) => !fs.statSync(this.dir + i).isDirectory())
        })
    },
    methods: {
        changeCurrentDir(dir) {
            console.log(dir)
            this.current_dir = dir
            //解除对this.dir的watch
            fs.unwatchFile(this.dir)
            this.dir = this.default_dir + this.current_dir + '/'
            if (dir == 'Default') {
                this.dir = this.default_dir
            }
            fs.watch(this.dir, () => {
                fs.readdir(this.dir, (_err, files) => {
                    this.pics = files.filter((i) => !fs.statSync(this.dir + i).isDirectory())
                })
            })
            fs.readdir(this.dir, (_err, files) => {
                this.pics = files.filter((i) => !fs.statSync(this.dir + i).isDirectory())
            })
        },
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
        dirMenu: ipc.popupStickerDirMenu,
        setPanel(type) {
            this.panel = type
            ipc.setLastUsedStickerType(type)
        },
        wheelHandler(e) {
            e.preventDefault()
            this.$refs.stickers_dir.scrollTo({
                left: this.$refs.stickers_dir.scrollLeft + e.deltaY,
                behavior: 'smooth',
            })
        },
    },
}
</script>

<style scoped lang="scss">
div.stickers_dir {
    width: 100%;
    white-space: nowrap;
    overflow-x: auto;
    border-bottom: var(--chat-border-style);
    background-color: var(--panel-header-bg);
    display: flex;
    line-height: 30px;
    height: 30px;
    min-height: 30px;

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

// 修复 emoji 面板溢出
@mixin emoji-flex {
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.emoji-panel {
    @include emoji-flex;
}

::v-deep #Emojis {
    @include emoji-flex;
    display: flex !important;
}

::v-deep #Categories,
::v-deep #InputSearch {
    flex-shrink: 0;
}

::v-deep .container-emoji {
    height: auto !important;
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
</style>
