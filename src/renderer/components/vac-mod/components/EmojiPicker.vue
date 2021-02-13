<template>
	<div class="vac-wrapper">
		<emoji-picker :search="search" @emoji="append">
			<div
				slot="emoji-invoker"
				slot-scope="{ events: { click: clickEvent } }"
				class="vac-svg-button"
				:class="{ 'vac-button-reaction': emojiReaction }"
				@click.stop="clickEvent"
				@click="openEmoji"
			>
				<slot name="emoji-picker-icon">
					<svg-icon name="emoji" :param="emojiReaction ? 'reaction' : ''" />
				</slot>
			</div>
			<div
				v-if="emojiOpened"
				slot="emoji-picker"
				slot-scope="{ emojis, insert }"
			>
				<transition name="vac-slide-up" appear>
					<div
						class="vac-emoji-picker"
						:class="{ 'vac-picker-reaction': emojiReaction }"
						:style="{
							height: `${emojiPickerHeight}px`,
							top: positionTop ? emojiPickerHeight : `${emojiPickerTop}px`,
							right: emojiPickerRight,
							display: emojiPickerTop || !emojiReaction ? 'initial' : 'none'
						}"
					>
						<div class="vac-emoji-picker__search">
							<input v-model="search" type="text" />
						</div>
						<div>
							<div v-for="(emojiGroup, category) in emojis" :key="category">
								<h5 v-if="category !== 'Frequently used'">
									{{ category }}
								</h5>
								<div v-if="category !== 'Frequently used'" class="vac-emojis">
									<span
										v-for="(emoji, emojiName) in emojiGroup"
										:key="emojiName"
										:title="emojiName"
										@click="insert({ emoji, emojiName })"
									>
										{{ emoji }}
									</span>
								</div>
							</div>
						</div>
					</div>
				</transition>
			</div>
		</emoji-picker>
	</div>
</template>

<script>
import EmojiPicker from 'vue-emoji-picker'

import SvgIcon from './SvgIcon'

export default {
	components: {
		EmojiPicker,
		SvgIcon
	},

	props: {
		emojiOpened: { type: Boolean, default: false },
		emojiReaction: { type: Boolean, default: false },
		roomFooterRef: { type: HTMLDivElement, default: null },
		positionTop: { type: Boolean, default: false },
		positionRight: { type: Boolean, default: false }
	},

	data() {
		return {
			search: '',
			emojiPickerHeight: 320,
			emojiPickerTop: 0,
			emojiPickerRight: ''
		}
	},

	methods: {
		append({ emoji, emojiName }) {
			this.$emit('add-emoji', { icon: emoji, name: emojiName })
		},
		openEmoji(ev) {
			this.$emit('open-emoji', true)
			this.setEmojiPickerPosition(
				ev.clientY,
				ev.view.innerWidth,
				ev.view.innerHeight
			)
		},
		setEmojiPickerPosition(clientY, innerWidth, innerHeight) {
			setTimeout(() => {
				const mobileSize = innerWidth < 500 || innerHeight < 700

				if (!this.roomFooterRef) {
					if (mobileSize) this.emojiPickerRight = '0px'
					return
				}

				if (mobileSize) {
					this.emojiPickerRight = innerWidth / 2 - 120 + 'px'
					this.emojiPickerTop = 100
					this.emojiPickerHeight = innerHeight - 200
				} else {
					const roomFooterTop = this.roomFooterRef.getBoundingClientRect().top
					const pickerTopPosition =
						roomFooterTop - clientY > this.emojiPickerHeight - 50

					if (pickerTopPosition) this.emojiPickerTop = clientY + 10
					else this.emojiPickerTop = clientY - this.emojiPickerHeight - 10

					this.emojiPickerRight = this.positionTop
						? '-50px'
						: this.positionRight
						? '60px'
						: ''
				}
			}, 0)
		}
	}
}
</script>

<style lang="scss" scoped>
.vac-wrapper {
	position: relative;
	display: flex;
}

.vac-emoji-picker {
	position: absolute;
	z-index: 9999;
	bottom: 32px;
	right: 10px;
	width: 240px;
	overflow: scroll;
	padding: 16px;
	box-sizing: border-box;
	border-radius: 0.5rem;
	background: var(--chat-emoji-bg-color);
	box-shadow: 0 1px 2px -2px rgba(0, 0, 0, 0.1),
		0 1px 2px -1px rgba(0, 0, 0, 0.1), 0 1px 2px 1px rgba(0, 0, 0, 0.1);
}

.vac-picker-reaction {
	position: fixed;
	top: initial;
	right: initial;
}

.vac-emoji-picker__search {
	display: flex;
}

.vac-emoji-picker__search > input {
	flex: 1;
	border-radius: 10rem;
	border: var(--chat-border-style);
	padding: 5px 10px;
	outline: none;
	background: var(--chat-bg-color-input);
	color: var(--chat-color);
}

.vac-emoji-picker h5 {
	margin: 15px 0 8px;
	color: #b1b1b1;
	text-transform: uppercase;
	font-size: 0.8rem;
	cursor: default;
}

.vac-emoji-picker .vac-emojis {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
}

.vac-emoji-picker .vac-emojis:after {
	content: '';
	flex: auto;
}

.vac-emoji-picker .vac-emojis span {
	padding: 0.2rem;
	cursor: pointer;
	border-radius: 5px;
}

.vac-emoji-picker .vac-emojis span:hover {
	background: var(--chat-sidemenu-bg-color-hover);
	cursor: pointer;
}

.vac-button-reaction svg {
	height: 19px;
	width: 19px;
}
</style>
