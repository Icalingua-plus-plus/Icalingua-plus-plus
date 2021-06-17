<template>
	<div>
		<LottieAnimation
			v-for="i in 12"
			:path="lottiePath(i)"
			:height="200"
			:width="200"
			style="display: inline-block"
		/>
	</div>
</template>

<script>
import LottieAnimation from "./LottieAnimation";
import path from "path";

export default {
	components: {
		LottieAnimation
	},
	name: "Test",
	methods: {
		lottiePath(i) {
			i = String(i)
			console.log(path.join(__static, 'qlottie', i, i + '.json'))
			return path.join(__static, 'qlottie', i, i + '.json')
		}
	}
}
</script>

<style scoped>

</style>
