<template>
	<div id="app">
		<router-view></router-view>
	</div>
</template>

<script>
    export default {
        name: "app",
    };
</script>

<style>
	@font-face {
		font-family: "font";
		src: url("~@/assets/font.ttf");
	}
	* {
		font-family: "font";
	}
</style>
