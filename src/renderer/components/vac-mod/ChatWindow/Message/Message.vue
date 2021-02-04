<template>
	<div>
		<div v-if="showDate" class="vac-card-info vac-card-date">
			{{ message.date }}
		</div>

		<div v-if="newMessage._id === message._id" class="vac-line-new">
			{{ textMessages.NEW_MESSAGES }}
		</div>

		<div v-if="message.system" class="vac-card-info vac-card-system">
			{{ message.content }}
		</div>

		<div
			v-else
			:id="message._id"
			class="vac-message-box"
			:class="{ 'vac-offset-current': message.sender_id === currentUserId }"
		>
			<el-avatar
				size="medium"
				:src="`https://q1.qlogo.cn/g?b=qq&nk=${message.sender_id}&s=640`"
				v-if="roomUsers.length > 2 && message.sender_id !== currentUserId"
			/>
			<slot name="message" v-bind="{ message }">
				<div
					class="vac-message-container"
					:class="{
						'vac-message-container-offset': messageOffset,
					}"
				>
					<div
						ref="imageRef"
						class="vac-message-card"
						:class="{
							'vac-message-highlight': isMessageHover(message),
							'vac-message-current': message.sender_id === currentUserId,
							'vac-message-deleted': message.deleted,
						}"
						@mouseover="onHoverMessage(message)"
						@mouseleave="onLeaveMessage"
					>
						<div
							v-if="roomUsers.length > 2 && message.sender_id !== currentUserId"
							class="vac-text-username"
							:class="{
								'vac-username-reply': !message.deleted && message.replyMessage,
							}"
						>
							<span>{{ message.username }}</span>
						</div>

						<div
							v-if="!message.deleted && message.replyMessage"
							class="vac-reply-message"
						>
							<div class="vac-reply-username">{{ replyUsername }}</div>

							<div class="vac-image-reply-container" v-if="isImageReply">
								<div
									class="vac-message-image vac-message-image-reply"
									:style="{
										'background-image': `url('${message.replyMessage.file.url}')`,
									}"
								></div>
							</div>

							<div class="vac-reply-content">
								<format-message
									:content="message.replyMessage.content"
									:users="roomUsers"
									:text-formatting="true"
									:reply="true"
								>
								</format-message>
							</div>
						</div>

						<div v-if="message.deleted">
							<slot name="deleted-icon">
								<svg-icon name="deleted" class="vac-icon-deleted" />
							</slot>
							<span>{{ textMessages.MESSAGE_DELETED }}</span>
						</div>

						<div v-else-if="!message.file">
							<format-message
								:content="message.content"
								:users="roomUsers"
								:text-formatting="textFormatting"
								@open-user-tag="openUserTag"
							>
								<template v-slot:deleted-icon="data">
									<slot name="deleted-icon" v-bind="data"></slot>
								</template>
							</format-message>
						</div>

						<div v-else-if="isImage" class="vac-image-container">
							<loader
								:style="{ top: `${imageResponsive.loaderTop}px` }"
								:show="isImageLoading"
							></loader>
							<div
								class="vac-message-image"
								:class="{
									'vac-image-loading':
										isImageLoading && message.sender_id === currentUserId,
								}"
								:style="{
									'background-image': `url('${message.file.url}')`,
									'max-height': `${imageResponsive.maxHeight}px`,
								}"
							>
								<transition name="vac-fade-image">
									<div
										class="vac-image-buttons"
										v-if="imageHover && !isImageLoading"
									>
										<div
											class="vac-svg-button vac-button-view"
											@click.stop="openFile('preview')"
										>
											<slot name="eye-icon">
												<svg-icon name="eye" />
											</slot>
										</div>
										<div
											class="vac-svg-button vac-button-download"
											@click.stop="openFile('download')"
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
								@open-user-tag="openUserTag"
							></format-message>
						</div>

						<div v-else-if="isVideo" class="vac-video-container">
							<video width="100%" height="100%" controls>
								<source :src="message.file.url" />
							</video>
						</div>

						<div v-else-if="message.file.audio" class="vac-audio-message">
							<div id="vac-audio-player">
								<audio controls v-if="message.file.audio">
									<source :src="message.file.url" />
								</audio>
							</div>
						</div>

						<div v-else class="vac-file-message">
							<div
								class="vac-svg-button vac-icon-file"
								@click.stop="openFile('download')"
							>
								<slot name="document-icon">
									<svg-icon name="document" />
								</slot>
							</div>
							<span>{{ message.content }}</span>
						</div>

						<div class="vac-text-timestamp">
							<div
								class="vac-icon-edited"
								v-if="message.edited && !message.deleted"
							>
								<slot name="pencil-icon">
									<svg-icon name="pencil" />
								</slot>
							</div>
							<span>{{ message.timestamp }}</span>
							<span v-if="isCheckmarkVisible">
								<slot name="checkmark-icon" v-bind="{ message }">
									<svg-icon
										:name="
											message.distributed ? 'double-checkmark' : 'checkmark'
										"
										:param="message.seen ? 'seen' : ''"
										class="vac-icon-check"
									></svg-icon>
								</slot>
							</span>
						</div>

						<div
							class="vac-options-container"
							:class="{ 'vac-options-image': isImage && !message.replyMessage }"
							:style="{
								width:
									filteredMessageActions.length && showReactionEmojis
										? '70px'
										: '45px',
							}"
						>
							<transition-group name="vac-slide-left">
								<div
									key="1"
									class="vac-blur-container"
									:class="{
										'vac-options-me': message.sender_id === currentUserId,
									}"
									v-if="isMessageActions || isMessageReactions"
								></div>

								<div
									ref="actionIcon"
									key="2"
									class="vac-svg-button vac-message-options"
									v-if="isMessageActions"
									@click="openOptions"
								>
									<slot name="dropdown-icon">
										<svg-icon name="dropdown" param="message" />
									</slot>
								</div>

								<emoji-picker
									key="3"
									class="vac-message-reactions"
									:style="{ right: isMessageActions ? '30px' : '5px' }"
									v-if="isMessageReactions"
									v-click-outside="closeEmoji"
									:emoji-opened="emojiOpened"
									:emoji-reaction="true"
									:room-footer-ref="roomFooterRef"
									:position-right="message.sender_id === currentUserId"
									@add-emoji="sendMessageReaction"
									@open-emoji="openEmoji"
								>
									<template v-slot:emoji-picker-icon>
										<slot name="emoji-picker-reaction-icon"></slot>
									</template>
								</emoji-picker>
							</transition-group>
						</div>

						<transition
							:name="
								message.sender_id === currentUserId
									? 'vac-slide-left'
									: 'vac-slide-right'
							"
							v-if="filteredMessageActions.length"
						>
							<div
								ref="menuOptions"
								v-if="optionsOpened"
								v-click-outside="closeOptions"
								class="vac-menu-options"
								:class="{
									'vac-menu-left': message.sender_id !== currentUserId,
								}"
								:style="{ top: `${menuOptionsTop}px` }"
							>
								<div class="vac-menu-list">
									<div
										v-for="action in filteredMessageActions"
										:key="action.name"
									>
										<div
											class="vac-menu-item"
											@click="messageActionHandler(action)"
										>
											{{ action.title }}
										</div>
									</div>
								</div>
							</div>
						</transition>
					</div>

					<transition-group name="vac-slide-left" v-if="!message.deleted">
						<button
							v-for="(reaction, key) in message.reactions"
							v-show="reaction.length"
							:key="key + 0"
							class="vac-button-reaction"
							:class="{
								'vac-reaction-me': reaction.indexOf(currentUserId) !== -1,
							}"
							:style="{
								float: message.sender_id === currentUserId ? 'right' : 'left',
							}"
							@click="sendMessageReaction({ name: key }, reaction)"
						>
							{{ getEmojiByName(key) }}<span>{{ reaction.length }}</span>
						</button>
					</transition-group>
				</div>
			</slot>
		</div>
	</div>
</template>

<script>
	import vClickOutside from 'v-click-outside'

	import SvgIcon from '../../components/SvgIcon'
	import Loader from '../../components/Loader'
	import EmojiPicker from '../../components/EmojiPicker'
	import FormatMessage from '../../components/FormatMessage'

	const { isImageFile } = require('../../utils/mediaFile')

	export default {
		name: 'message',
		components: { SvgIcon, Loader, EmojiPicker, FormatMessage },

		directives: {
			clickOutside: vClickOutside.directive
		},

		props: {
			currentUserId: { type: [String, Number], required: true },
			textMessages: { type: Object, required: true },
			index: { type: Number, required: true },
			message: { type: Object, required: true },
			messages: { type: Array, required: true },
			editedMessage: { type: Object, required: true },
			roomUsers: { type: Array, default: () => [] },
			messageActions: { type: Array, required: true },
			roomFooterRef: { type: HTMLDivElement },
			newMessages: { type: Array },
			showReactionEmojis: { type: Boolean, required: true },
			showNewMessagesDivider: { type: Boolean, required: true },
			textFormatting: { type: Boolean, required: true },
			emojisList: { type: Object, required: true },
			hideOptions: { type: Boolean, required: true }
		},

		data() {
			return {
				hoverMessageId: null,
				imageLoading: false,
				imageHover: false,
				messageHover: false,
				optionsOpened: false,
				optionsClosing: false,
				menuOptionsTop: 0,
				messageReaction: '',
				newMessage: {},
				emojiOpened: false,
				imageResponsive: ''
			}
		},

		watch: {
			message: {
				immediate: true,
				handler() {
					this.checkImgLoad()
				}
			},
			newMessages(val) {
				if (!val.length || !this.showNewMessagesDivider) return
				this.newMessage = val.reduce((res, obj) =>
					obj.index < res.index ? obj : res
				)
			},
			emojiOpened(val) {
				if (val) this.optionsOpened = false
			},
			hideOptions(val) {
				if (val) {
					this.closeEmoji()
					this.closeOptions()
				}
			}
		},

		mounted() {
			if (!this.message.seen && this.message.sender_id !== this.currentUserId) {
				this.$emit('add-new-message', {
					_id: this.message._id,
					index: this.index
				})
			}

			if (!this.$refs.imageRef) return

			this.imageResponsive = {
				maxHeight: this.$refs.imageRef.clientWidth - 18,
				loaderTop: this.$refs.imageRef.clientWidth / 2
			}
		},

		computed: {
			showDate() {
				return (
					this.index > 0 &&
					this.message.date !== this.messages[this.index - 1].date
				)
			},
			messageOffset() {
				return (
					this.index > 0 &&
					this.message.sender_id !== this.messages[this.index - 1].sender_id
				)
			},
			isImage() {
				return this.checkImageFile()
			},
			isImageReply() {
				return this.checkImageReplyFile()
			},
			isImageLoading() {
				return (
					this.message.file.url.indexOf('blob:http') !== -1 || this.imageLoading
				)
			},
			isVideo() {
				return this.checkVideoType(this.message.file)
			},
			isCheckmarkVisible() {
				return (
					this.message.sender_id === this.currentUserId &&
					!this.message.deleted &&
					(this.message.saved || this.message.distributed || this.message.seen)
				)
			},
			replyUsername() {
				const { sender_id } = this.message.replyMessage
				const replyUser = this.roomUsers.find(user => user._id === sender_id)
				return replyUser ? replyUser.username : ''
			},
			isMessageActions() {
				return (
					this.filteredMessageActions.length &&
					this.messageHover &&
					!this.message.deleted &&
					!this.message.disable_actions
				)
			},
			isMessageReactions() {
				return (
					this.showReactionEmojis &&
					this.messageHover &&
					!this.message.deleted &&
					!this.message.disable_reactions
				)
			},
			filteredMessageActions() {
				return this.message.sender_id === this.currentUserId
					? this.messageActions
					: this.messageActions.filter(message => !message.onlyMe)
			}
		},

		methods: {
			isMessageHover() {
				return (
					this.editedMessage._id === this.message._id ||
					this.hoverMessageId === this.message._id
				)
			},
			onHoverMessage() {
				this.imageHover = true
				this.messageHover = true
				if (this.canEditMessage()) this.hoverMessageId = this.message._id
			},
			canEditMessage() {
				return !this.message.deleted
			},
			onLeaveMessage() {
				this.imageHover = false
				if (!this.optionsOpened && !this.emojiOpened) this.messageHover = false
				this.hoverMessageId = null
			},
			openFile(action) {
				this.$emit('open-file', { message: this.message, action })
			},
			openUserTag(user) {
				this.$emit('open-user-tag', { user })
			},
			messageActionHandler(action) {
				this.closeOptions()
				this.messageHover = false
				this.hoverMessageId = null

				setTimeout(() => {
					this.$emit('message-action-handler', { action, message: this.message })
				}, 300)
			},
			checkImageFile() {
				return isImageFile(this.message.file)
			},
			checkImageReplyFile() {
				return isImageFile(this.message.replyMessage.file)
			},
			checkImgLoad() {
				if (!this.checkImageFile()) return
				this.imageLoading = true
				const image = new Image()
				image.src = this.message.file.url
				image.addEventListener('load', () => (this.imageLoading = false))
			},
			checkVideoType(file) {
				if (!file) return
				const videoTypes = ['video/mp4', 'video/ogg', 'video/webm']
				const { type } = file
				return videoTypes.some(t => type.toLowerCase().includes(t))
			},
			openOptions() {
				if (this.optionsClosing) return

				this.optionsOpened = !this.optionsOpened
				if (!this.optionsOpened) return

				this.$emit('hide-options', false)

				setTimeout(() => {
					if (
						!this.roomFooterRef ||
						!this.$refs.menuOptions ||
						!this.$refs.actionIcon
					)
						return

					const menuOptionsTop = this.$refs.menuOptions.getBoundingClientRect()
						.height

					const actionIconTop = this.$refs.actionIcon.getBoundingClientRect().top
					const roomFooterTop = this.roomFooterRef.getBoundingClientRect().top

					const optionsTopPosition =
						roomFooterTop - actionIconTop > menuOptionsTop + 50

					if (optionsTopPosition) this.menuOptionsTop = 30
					else this.menuOptionsTop = -menuOptionsTop
				}, 0)
			},
			closeOptions() {
				this.optionsOpened = false
				this.optionsClosing = true
				setTimeout(() => (this.optionsClosing = false), 100)

				if (this.hoverMessageId !== this.message._id) this.messageHover = false
			},
			openEmoji() {
				this.emojiOpened = !this.emojiOpened
				this.$emit('hide-options', false)
			},
			closeEmoji() {
				this.emojiOpened = false
				if (this.hoverMessageId !== this.message._id) this.messageHover = false
			},
			getEmojiByName(emojiName) {
				return this.emojisList[emojiName]
			},
			sendMessageReaction(emoji, reaction) {
				this.$emit('send-message-reaction', {
					messageId: this.message._id,
					reaction: emoji,
					remove: reaction && reaction.indexOf(this.currentUserId) !== -1
				})
				this.closeEmoji()
				this.messageHover = false
			}
		}
	}
</script>

<style lang="scss" scoped>
	.el-avatar {
		min-width: max-content;
	}

	.vac-card-info {
		border-radius: 4px;
		text-align: center;
		margin: 10px auto;
		font-size: 12px;
		padding: 4px;
		display: block;
		overflow-wrap: break-word;
		position: relative;
		white-space: normal;
		box-shadow: 0 1px 1px -1px rgba(0, 0, 0, 0.1),
			0 1px 1px -1px rgba(0, 0, 0, 0.11), 0 1px 2px -1px rgba(0, 0, 0, 0.11);
	}

	.vac-card-date {
		max-width: 150px;
		font-weight: 500;
		text-transform: uppercase;
		color: var(--chat-message-color-date);
		background: var(--chat-message-bg-color-date);
	}

	.vac-card-system {
		max-width: 250px;
		padding: 8px 4px;
		color: var(--chat-message-color-system);
		background: var(--chat-message-bg-color-system);
	}

	.vac-line-new {
		color: var(--chat-message-color-new-messages);
		position: relative;
		text-align: center;
		font-size: 13px;
		padding: 10px 0;
	}

	.vac-line-new:after,
	.vac-line-new:before {
		border-top: 1px solid var(--chat-message-color-new-messages);
		content: "";
		left: 0;
		position: absolute;
		top: 50%;
		width: calc(50% - 60px);
	}

	.vac-line-new:before {
		left: auto;
		right: 0;
	}

	.vac-message-box {
		display: flex;
		flex: 0 0 50%;
		max-width: 50%;
		justify-content: flex-start;
		line-height: 1.4;
		align-items: flex-end;
	}

	.vac-message-container {
		position: relative;
		padding: 2px 10px;
		align-items: end;
		min-width: 100px;
		box-sizing: content-box;
		// flex: 1;
	}

	.vac-message-container-offset {
		margin-top: 10px;
	}

	.vac-offset-current {
		margin-left: 50%;
		justify-content: flex-end;
	}

	.vac-message-card {
		background: var(--chat-message-bg-color);
		color: var(--chat-message-color);
		border-radius: 8px;
		font-size: 14px;
		padding: 6px 9px 3px;
		white-space: pre-line;
		max-width: 100%;
		-webkit-transition-property: box-shadow, opacity;
		transition-property: box-shadow, opacity;
		transition: box-shadow 280ms cubic-bezier(0.4, 0, 0.2, 1);
		will-change: box-shadow;
		box-shadow: 0 1px 1px -1px rgba(0, 0, 0, 0.1),
			0 1px 1px -1px rgba(0, 0, 0, 0.11), 0 1px 2px -1px rgba(0, 0, 0, 0.11);
		-webkit-user-select: text;
	}

	.vac-message-highlight {
		box-shadow: 0 1px 2px -1px rgba(0, 0, 0, 0.1),
			0 1px 2px -1px rgba(0, 0, 0, 0.11), 0 1px 5px -1px rgba(0, 0, 0, 0.11);
	}

	.vac-message-current {
		background: var(--chat-message-bg-color-me) !important;
	}

	.vac-message-deleted {
		color: var(--chat-message-color-deleted) !important;
		font-size: 13px !important;
		font-style: italic !important;
		background: var(--chat-message-bg-color-deleted) !important;
	}

	.vac-icon-deleted {
		height: 14px;
		width: 14px;
		vertical-align: middle;
		margin: -2px 2px 0 0;
		fill: var(--chat-message-color-deleted);
	}

	.vac-image-container {
		width: 250px;
		max-width: 100%;
	}

	.vac-video-container {
		width: 350px;
		max-width: 100%;
		margin: 4px auto 5px;

		video {
			border-radius: 4px;
		}
	}

	.vac-image-reply-container {
		width: 70px;
	}

	.vac-message-image {
		position: relative;
		background-color: var(--chat-message-bg-color-image) !important;
		background-size: cover !important;
		background-position: center center !important;
		background-repeat: no-repeat !important;
		height: 250px;
		width: 250px;
		max-width: 100%;
		border-radius: 4px;
		margin: 4px auto 5px;
		transition: 0.4s filter linear;
	}

	.vac-message-image-reply {
		height: 70px;
		width: 70px;
		margin: 4px auto 3px;
	}

	.vac-image-loading {
		filter: blur(3px);
	}

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
		}

		.vac-reply-content {
			font-size: 12px;
			color: var(--chat-message-color-reply-content);
		}
	}

	.vac-text-username {
		font-size: 13px;
		color: var(--chat-message-color-username);
		margin-bottom: 2px;
	}

	.vac-username-reply {
		margin-bottom: 5px;
	}

	.vac-text-timestamp {
		font-size: 10px;
		color: var(--chat-message-color-timestamp);
		text-align: right;
	}

	.selector:not(*:root),
	#vac-audio-player {
		width: 250px;
		overflow: hidden;
		border-top-right-radius: 1em;
		border-bottom-right-radius: 2.5em 1em;

		audio {
			height: 40px;

			&::-webkit-media-controls-panel {
				height: 40px;
			}

			&::-webkit-media-controls-mute-button {
				display: none;
			}

			&::-webkit-media-controls-timeline {
				min-width: 103px;
				max-width: 142px;
			}

			&:focus {
				outline: none;
			}
		}
	}

	.vac-audio-message {
		margin-top: 3px;
	}

	.vac-file-message {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		margin-top: 3px;

		span {
			max-width: 100%;
		}

		.vac-icon-file svg {
			margin-right: 5px;
		}
	}

	.vac-icon-edited {
		-webkit-box-align: center;
		align-items: center;
		display: -webkit-inline-box;
		display: inline-flex;
		justify-content: center;
		letter-spacing: normal;
		line-height: 1;
		text-indent: 0;
		vertical-align: middle;
		margin: 0 4px 2px;

		svg {
			height: 12px;
			width: 12px;
		}
	}

	.vac-options-container {
		position: absolute;
		top: 2px;
		right: 10px;
		height: 40px;
		width: 70px;
		overflow: hidden;
		z-index: 1;
		border-top-right-radius: 8px;
	}

	.vac-blur-container {
		position: absolute;
		height: 100%;
		width: 100%;
		left: 8px;
		bottom: 10px;
		background: var(--chat-message-bg-color);
		filter: blur(3px);
		border-bottom-left-radius: 8px;
	}

	.vac-options-me {
		background: var(--chat-message-bg-color-me);
	}

	.vac-options-image .vac-blur-container {
		background: rgba(255, 255, 255, 0.6);
		border-bottom-left-radius: 15px;
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

	.vac-message-options {
		background: var(--chat-icon-bg-dropdown-message);
		border-radius: 50%;
		position: absolute;
		top: 7px;
		right: 7px;

		svg {
			height: 17px;
			width: 17px;
			padding: 5px;
			margin: -5px;
		}
	}

	.vac-message-reactions {
		position: absolute;
		top: 6px;
		right: 30px;
	}

	.vac-menu-options {
		right: 15px;
	}

	.vac-menu-left {
		right: -118px;
	}

	.vac-icon-check {
		height: 14px;
		width: 14px;
		vertical-align: middle;
		margin: -3px -3px 0 3px;
	}

	.vac-button-reaction {
		display: inline-flex;
		align-items: center;
		border: var(--chat-message-border-style-reaction);
		outline: none;
		background: var(--chat-message-bg-color-reaction);
		border-radius: 4px;
		margin: 4px 2px 0;
		transition: 0.3s;
		padding: 0 5px;
		font-size: 18px;
		line-height: 23px;

		span {
			font-size: 11px;
			font-weight: 500;
			min-width: 7px;
			color: var(--chat-message-color-reaction-counter);
		}

		&:hover {
			border: var(--chat-message-border-style-reaction-hover);
			background: var(--chat-message-bg-color-reaction-hover);
			cursor: pointer;
		}
	}

	.vac-reaction-me {
		border: var(--chat-message-border-style-reaction-me);
		background: var(--chat-message-bg-color-reaction-me);

		span {
			color: var(--chat-message-color-reaction-counter-me);
		}

		&:hover {
			border: var(--chat-message-border-style-reaction-hover-me);
			background: var(--chat-message-bg-color-reaction-hover-me);
		}
	}

	@media only screen and (max-width: 768px) {
		.vac-message-container {
			padding: 2px 3px 1px;
		}

		.vac-message-container-offset {
			margin-top: 10px;
		}

		.vac-message-box {
			flex: 0 0 80%;
			max-width: 80%;
		}

		.vac-offset-current {
			margin-left: 20%;
		}

		.vac-options-container {
			right: 3px;
		}

		.vac-menu-left {
			right: -50px;
		}
	}
</style>
