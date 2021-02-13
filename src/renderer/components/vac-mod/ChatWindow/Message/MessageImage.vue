<template>
	<div ref="imageRef" class="vac-image-container">
		<loader
			:style="{ top: `${imageResponsive.loaderTop}px` }"
			:show="isImageLoading"
		/>
		<div
			class="vac-message-image"
			:class="{
				'vac-image-loading':
					isImageLoading && message.senderId === currentUserId
			}"
			:style="{
				'background-image': `url('${message.file.url}')`,
				'max-height': `${imageResponsive.maxHeight}px`
			}"
		>
			<transition name="vac-fade-image">
				<div v-if="imageHover && !isImageLoading" class="vac-image-buttons">
					<div
						class="vac-svg-button vac-button-view"
						@click.stop="$emit('open-file', 'preview')"
					>
						<slot name="eye-icon">
							<svg-icon name="eye" />
						</slot>
					</div>
					<div
						class="vac-svg-button vac-button-download"
						@click.stop="$emit('open-file', 'download')"
					>
						<slot name="document-icon">
							<svg-icon name="document" />
						</slot>
					</div>
				</div>
			</transition>
		</div>
		<format-message
			:content="message.content"
			:users="roomUsers"
			:text-formatting="textFormatting"
			@open-user-tag="$emit('open-user-tag')"
		/>
	</div>
</template>

<script>
import Loader from '../../components/Loader'
import SvgIcon from '../../components/SvgIcon'
import FormatMessage from '../../components/FormatMessage'

const { isImageFile } = require('../../utils/mediaFile')

export default {
	name: 'MessageImage',
	components: { SvgIcon, Loader, FormatMessage },

	props: {
		currentUserId: { type: [String, Number], required: true },
		message: { type: Object, required: true },
		roomUsers: { type: Array, required: true },
		textFormatting: { type: Boolean, required: true },
		imageHover: { type: Boolean, required: true }
	},

	data() {
		return {
			imageLoading: false,
			imageResponsive: ''
		}
	},

	computed: {
		isImageLoading() {
			return (
				this.message.file.url.indexOf('blob:http') !== -1 || this.imageLoading
			)
		}
	},

	watch: {
		message: {
			immediate: true,
			handler() {
				this.checkImgLoad()
			}
		}
	},

	mounted() {
		this.imageResponsive = {
			maxHeight: this.$refs.imageRef.clientWidth - 18,
			loaderTop: this.$refs.imageRef.clientWidth / 2
		}
	},

	methods: {
		checkImgLoad() {
			if (!isImageFile(this.message.file)) return
			this.imageLoading = true
			const image = new Image()
			image.src = this.message.file.url
			image.addEventListener('load', () => (this.imageLoading = false))
		}
	}
}
</script>

<style lang="scss" scoped>
.vac-image-container {
	width: 250px;
	max-width: 100%;
}

.vac-image-loading {
	filter: blur(3px);
}

.vac-image-buttons {
	position: absolute;
	width: 100%;
	height: 100%;
	border-radius: 4px;
	background: linear-gradient(
		to bottom,
		rgba(0, 0, 0, 0) 55%,
		rgba(0, 0, 0, 0.02) 60%,
		rgba(0, 0, 0, 0.05) 65%,
		rgba(0, 0, 0, 0.1) 70%,
		rgba(0, 0, 0, 0.2) 75%,
		rgba(0, 0, 0, 0.3) 80%,
		rgba(0, 0, 0, 0.5) 85%,
		rgba(0, 0, 0, 0.6) 90%,
		rgba(0, 0, 0, 0.7) 95%,
		rgba(0, 0, 0, 0.8) 100%
	);

	svg {
		height: 26px;
		width: 26px;
	}

	.vac-button-view,
	.vac-button-download {
		position: absolute;
		bottom: 6px;
		left: 7px;
	}

	:first-child {
		left: 40px;
	}

	.vac-button-view {
		max-width: 18px;
		bottom: 8px;
	}
}
</style>
