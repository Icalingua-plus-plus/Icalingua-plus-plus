<template>
	<div
		ref="imageRef"
		class="vac-image-container"
		:class="{ 'vac-image-container-loading': isImageLoading || err }"
	>
		<loader
			:style="{ top: `${imageResponsive.loaderTop}px` }"
			:show="isImageLoading"
			v-if="!isHidden"
		/>
		<div
			class="vac-message-image-mod"
			:class="{
		        'vac-image-loading': isImageLoading,
		        'vac-image-err': err,
		    }"
			:style="{
		        'max-height': `${imageResponsive.maxHeight}px`,
		    }"
			v-if="!isHidden"
		>
			<el-image
				:src="message.file.url"
				:preview-src-list="[message.file.url]"
				fit="cover"
				referrer-policy="no-referrer"
				@load="imageLoading = false"
				@error="
		          imageLoading = false;
		          err = true;
		        "
			>
				<div slot="error" class="image-slot">
					<i class="el-icon-picture-outline"></i>
				</div>
			</el-image>
		</div>
		<format-message
			:content="message.content"
			v-if="!isHidden"
			:users="roomUsers"
			:text-formatting="textFormatting"
			@open-user-tag="$emit('open-user-tag')"
		/>

		<details v-if="isHidden">
			<summary v-if="!summary" style="cursor:pointer">
				Hidden image
			</summary>
			<summary v-if="summary" style="cursor:pointer">
				<format-message
					:content="summary"
					:users="roomUsers"
					:text-formatting="textFormatting"
					@open-user-tag="$emit('open-user-tag')"
				/>
			</summary>
			<loader
				:style="{ top: `${imageResponsive.loaderTop}px` }"
				:show="isImageLoading"
			/>
			<div
				class="vac-message-image-mod"
				:class="{
		        'vac-image-loading': isImageLoading,
		        'vac-image-err': err,
		    }"
				:style="{
		        'max-height': `${imageResponsive.maxHeight}px`,
		    }"
			>
				<el-image
					:src="message.file.url"
					:preview-src-list="[message.file.url]"
					fit="cover"
					referrer-policy="no-referrer"
					@load="imageLoading = false"
					@error="
		          imageLoading = false;
		          err = true;
		        "
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
import Loader from "../../components/Loader";
import SvgIcon from "../../components/SvgIcon";
import FormatMessage from "../../components/FormatMessage";

export default {
	name: "MessageImage",
	components: {SvgIcon, Loader, FormatMessage},

	props: {
		currentUserId: {type: [String, Number], required: true},
		message: {type: Object, required: true},
		roomUsers: {type: Array, required: true},
		textFormatting: {type: Boolean, required: true},
		imageHover: {type: Boolean, required: true},
	},

	data() {
		return {
			imageLoading: true,
			imageResponsive: "",
			err: false,
		};
	},

	computed: {
		isImageLoading() {
			return (
				this.message.file.url.indexOf("blob:http") !== -1 || this.imageLoading
			);
		},
		isHidden() {
			return /[!！] *[Hh] *[Ii] *[Dd] *[Ee]/.test(this.message.content)
		},
		summary() {
			return this.message.content.replace(/[!！] *[Hh] *[Ii] *[Dd] *[Ee]/, '').trim()
		}
	},

	mounted() {
		this.imageResponsive = {
			maxHeight: this.$refs.imageRef.clientWidth - 18,
			loaderTop: this.$refs.imageRef.clientWidth / 2,
		};
	},

};
</script>

<style lang="scss">
.vac-image-container {
	// width: 250px;
	max-width: 250px;
	width: fit-content;
}

.vac-image-container-loading {
	width: 250px;
}

.vac-image-loading {
	filter: blur(3px);
	height: 250px;
	width: 250px !important;
}

.vac-image-err {
	height: 250px;
	width: 250px !important;
}

.vac-message-image-mod {
	position: relative;
	background-color: var(--chat-message-bg-color-image) !important;
	max-height: 250px;
	max-width: 250px;
	border-radius: 4px;
	margin: 4px auto 5px;
	transition: 0.4s filter linear;
	overflow: hidden;
	width: fit-content;

	.el-image {
		vertical-align: top;
		height: -webkit-fill-available;
		width: -webkit-fill-available;

		img {
			max-height: 232px;
			width: auto;
			height: auto;
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
</style>
