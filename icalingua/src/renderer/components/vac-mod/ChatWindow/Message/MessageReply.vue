<template>
	<div class="vac-reply-message">
		<div class="vac-reply-username" v-if="message.replyMessage.username">
			{{ message.replyMessage.username }}
		</div>

		<div v-if="isImage" class="vac-image-reply-container" @click="openImage">
			<el-image
				:src="message.replyMessage.file.url"
				fit="cover"
				referrer-policy="no-referrer"
				class="vac-message-image-reply"
			>
				<div slot="error" class="image-slot">
					<i class="el-icon-picture-outline"></i>
				</div>
			</el-image>
		</div>

		<div class="vac-reply-content">
			<format-message
				:content="message.replyMessage.content"
				:users="roomUsers"
				:text-formatting="true"
				:reply="true"
			/>
		</div>
	</div>
</template>

<script>
import FormatMessage from "../../components/FormatMessage";
import {ipcRenderer} from "electron";

const {isImageFile} = require("../../utils/mediaFile");

export default {
	name: "MessageReply",
	components: {FormatMessage},

	props: {
		message: {type: Object, required: true},
		roomUsers: {type: Array, required: true},
	},

	computed: {
		isImage() {
			return isImageFile(this.message.replyMessage.file);
		},
	},

	methods: {
		openImage() {
			ipcRenderer.send('openImage', this.message.replyMessage.file.url, false)
		}
	}
};
</script>

<style lang="scss">
.vac-reply-message {
	background: var(--chat-message-bg-color-reply);
	border-radius: 4px;
	margin: -1px -5px 8px;
	padding: 8px 10px;

	.vac-reply-username {
		color: var(--chat-message-color-reply-username);
		font-size: 12px;
		line-height: 15px;
		margin-bottom: 2px;
		white-space: nowrap;
	}

	.vac-image-reply-container {
		width: 70px;

		.vac-message-image-reply {
			height: 70px;
			width: 70px;
			margin: 4px auto 3px;
			cursor: pointer;
		}
	}

	.vac-reply-content {
		font-size: 12px;
		color: var(--chat-message-color-reply-content);
	}
}
</style>
