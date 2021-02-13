<template>
	<transition name="vac-fade-spinner" appear>
		<div
			v-if="show"
			:class="{
				'vac-container-center': !infinite,
				'vac-container-top': infinite
			}"
		>
			<div id="vac-circle" />
		</div>
	</transition>
</template>

<script>
export default {
	name: 'Loader',

	props: {
		show: { type: Boolean, default: false },
		infinite: { type: Boolean, default: false }
	}
}
</script>

<style lang="scss" scoped>
.vac-container-center {
	position: absolute;
	left: 50%;
	top: 50%;
	transform: translate(-50%, -50%);
	z-index: 9;
}

.vac-container-top {
	padding: 21px;

	#vac-circle {
		height: 20px;
		width: 20px;
	}
}

#vac-circle {
	margin: auto;
	height: 28px;
	width: 28px;
	border: 3px rgba(0, 0, 0, 0.25) solid;
	border-top: 3px var(--chat-color-spinner) solid;
	border-right: 3px var(--chat-color-spinner) solid;
	border-bottom: 3px var(--chat-color-spinner) solid;
	border-radius: 50%;
	-webkit-animation: vac-spin 1s infinite linear;
	animation: vac-spin 1s infinite linear;
}

@media only screen and (max-width: 768px) {
	#vac-circle {
		height: 24px;
		width: 24px;
	}

	.vac-container-top {
		padding: 18px;

		#vac-circle {
			height: 16px;
			width: 16px;
		}
	}
}

@-webkit-keyframes vac-spin {
	from {
		-webkit-transform: rotate(0deg);
		transform: rotate(0deg);
	}
	to {
		-webkit-transform: rotate(359deg);
		transform: rotate(359deg);
	}
}
@keyframes vac-spin {
	from {
		-webkit-transform: rotate(0deg);
		transform: rotate(0deg);
		-webkit-transform: rotate(0deg);
		transform: rotate(0deg);
	}
	to {
		-webkit-transform: rotate(359deg);
		transform: rotate(359deg);
		-webkit-transform: rotate(359deg);
		transform: rotate(359deg);
	}
}
</style>
