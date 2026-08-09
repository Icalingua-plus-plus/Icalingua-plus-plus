<template>
    <div ref="imageRef" class="vac-image-container" :class="{ 'vac-image-container-loading': isImageLoading || err }">
        <loader :style="{ top: `${imageResponsive.loaderTop}px` }" :show="isImageLoading" v-if="!isHidden" />
        <div
            class="vac-message-image-mod"
            :class="{
                'vac-image-loading': isImageLoading,
                'vac-image-err': err,
                'vac-el-image-loaded': !isImageLoading,
            }"
            :style="{
                'max-height': `${imageResponsive.maxHeight}px`,
            }"
            v-if="!isHidden"
            @click="openImage"
        >
            <img :src="lightning" v-if="flash" class="vac-image-lightning" />
            <el-image
                :src="file.url"
                :class="{ 'vac-image-flash': flash }"
                fit="cover"
                referrer-policy="no-referrer"
                @load="imageLoading = false"
                @error="onImageError"
            >
                <div slot="error" class="image-slot">
                    <i class="el-icon-picture-outline"></i>
                </div>
            </el-image>
        </div>

        <details v-if="isHidden">
            <summary style="cursor: pointer">Hidden image</summary>
            <loader :style="{ top: `${imageResponsive.loaderTop}px` }" :show="isImageLoading" />
            <div
                class="vac-message-image-mod"
                :class="{
                    'vac-image-loading': isImageLoading,
                    'vac-image-err': err,
                    'vac-el-image-loaded': !isImageLoading,
                }"
                :style="{
                    'max-height': `${imageResponsive.maxHeight}px`,
                }"
                @click="openImage"
            >
                <el-image
                    :src="file.url"
                    fit="cover"
                    referrer-policy="no-referrer"
                    @load="imageLoading = false"
                    @error="onImageError"
                >
                    <div slot="error" class="image-slot">
                        <i class="el-icon-picture-outline"></i>
                    </div>
                </el-image>
            </div>
        </details>
    </div>
</template>

<script>
import Loader from '../../components/Loader'
import SvgIcon from '../../components/SvgIcon'
import FormatMessage from '../../components/FormatMessage'
import { ipcRenderer } from 'electron'

export default {
    name: 'MessageImage',
    components: { SvgIcon, Loader, FormatMessage },

    props: {
        currentUserId: { type: [String, Number], required: true },
        file: { type: Object, required: true },
        textFormatting: { type: Boolean, required: true },
        imageHover: { type: Boolean, required: true },
        flash: { type: Boolean, default: false },
        content: { type: String, default: '' },
        showForwardPanel: { type: Boolean, required: true },
        hideChatImageByDefault: { type: Boolean, required: false, default: false },
        localImageViewerByDefault: { type: Boolean, required: false, default: false },
        messageId: { type: [String, Number], required: true },
        imageIndex: { type: Number, default: 0 },
    },

    data() {
        return {
            imageLoading: true,
            imageResponsive: '',
            err: false,
            retried: false,
            lightning: `file://${__static}/lightning.svg`,
        }
    },

    computed: {
        isImageLoading() {
            return this.imageLoading
        },
        isHidden() {
            return this.hideChatImageByDefault || /[!！] *[Hh] *[Ii] *[Dd] *[Ee]/.test(this.content)
        },
    },

    mounted() {
        this.imageResponsive = {
            maxHeight: 232,
            loaderTop: this.$refs.imageRef.clientWidth / 2,
        }
    },

    methods: {
        async onImageError() {
            this.imageLoading = false
            this.err = true
            if (
                !this.retried &&
                this.file &&
                this.file.url &&
                this.file.url.includes('&fileid=') &&
                (this.file.url.startsWith('https://multimedia.nt.qq.com.cn/download') ||
                    this.file.url.startsWith('https://gchat.qpic.cn/download'))
            ) {
                this.retried = true
                try {
                    const u = new URL(this.file.url)
                    const fileid = u.searchParams.get('fileid')
                    const appid = u.searchParams.get('appid') || '1407'
                    if (fileid) {
                        const newUrl = await ipcRenderer.invoke('getNTPicURLbyFileid', fileid, appid)
                        if (newUrl && newUrl !== this.file.url) {
                            this.file.url = newUrl
                            this.imageLoading = true
                            this.err = false
                            return
                        }
                    }
                } catch (e) {
                    console.error('刷新图片链接失败:', e)
                }
            }
        },
        openImage() {
            if (this.showForwardPanel) return
            this.$emit('open-image', {
                url: this.file.url,
                messageId: this.messageId,
                imageIndex: this.imageIndex,
            })
        },
    },
}
</script>

<style lang="scss">
@media only screen and (max-width: 950px) {
    .vac-image-container {
        max-width: -webkit-fill-available;
    }

    .vac-image-container-loading {
        min-width: -webkit-fill-available !important;
    }

    .vac-message-image-mod {
        max-width: -webkit-fill-available;

        .el-image {
            height: -webkit-fill-available;
            width: -webkit-fill-available;

            img {
                max-height: 232px;
                max-width: 250px;
            }
        }
    }
    .vac-image-err {
        //width: -webkit-fill-available !important;
    }
    .vac-image-loading {
        width: -webkit-fill-available !important;
    }
}

@media only screen and (min-width: 1000px) {
    .vac-message-image-mod {
        max-width: 250px;
    }
    .vac-image-loading {
        width: 250px !important;
    }
    .vac-image-container-loading {
        width: 250px !important;
    }
    .vac-image-container {
        max-width: 250px;
    }
}

.vac-image-container {
    width: fit-content;
}

.vac-image-loading {
    filter: blur(3px);
    height: 250px;
}

.vac-image-err {
    height: 250px;
    width: 250px !important;
}

.vac-message-image-mod {
    position: relative;
    background-color: var(--chat-message-bg-color-image) !important;
    max-height: 250px;
    border-radius: 4px;
    margin: 4px auto 5px;
    transition: 0.4s filter linear;
    overflow: hidden;
    width: fit-content;
    cursor: pointer;

    .el-image {
        vertical-align: top;
        height: -webkit-fill-available;
        width: -webkit-fill-available;

        img {
            max-height: 232px;
            max-width: 250px;
        }

        .image-slot {
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100%;
            height: 100%;
            font-size: 30px;
            color: #909399;
        }
    }
}

.vac-image-flash {
    filter: blur(20px);
}

.vac-image-lightning {
    position: absolute;
    height: 50%;
    z-index: 1;
    margin: auto;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
}
</style>
