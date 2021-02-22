<template>
	<div id="app">
		<router-view></router-view>
	</div>
</template>

<script>
	window.Clansty = 'Shadow'

	export default {
		name: "app",
	};
</script>

<style>
	@font-face {
		font-family: "msyh";
		src: url("~@/assets/msyh.ttf");
	}
	html,
	body {
		height: 100%;
		width: 100%;
		margin: 0;
		color: #303133;
	}
</style>
