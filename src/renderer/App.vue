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
@import url("~@/assets/stylesheet.css");

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

* {
	font-family: font, "CircularSpotifyTxT Book Web", msyh, "PingFang SC", serif;
}

:focus {
	outline: none;
}

div#app {
	-webkit-user-select: none;
}
</style>
