<template>
	<transition-group v-if="!message.deleted" name="vac-slide-left">
		<button
			v-for="(reaction, key) in message.reactions"
			v-show="reaction.length"
			:key="key + 0"
			class="vac-button-reaction"
			:class="{
				'vac-reaction-me': reaction.indexOf(currentUserId) !== -1
			}"
			:style="{
				float: message.senderId === currentUserId ? 'right' : 'left'
			}"
			@click="sendMessageReaction({ name: key }, reaction)"
		>
			{{ getEmojiByName(key) }}<span>{{ reaction.length }}</span>
		</button>
	</transition-group>
</template>

<script>
export default {
	name: 'MessageReactions',

	props: {
		currentUserId: { type: [String, Number], required: true },
		message: { type: Object, required: true },
		emojisList: { type: Object, required: true }
	},

	methods: {
		getEmojiByName(emojiName) {
			return this.emojisList[emojiName]
		},
		sendMessageReaction(emoji, reaction) {
			this.$emit('send-message-reaction', { emoji, reaction })
		}
	}
}
</script>

<style lang="scss" scoped>
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
</style>
