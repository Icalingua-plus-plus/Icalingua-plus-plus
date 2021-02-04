<template>
	<a @click="$emit('click')">
		<el-card class="card">
			<div class="left">
				<el-avatar
					size="large"
					:src="
						chat.id < 0
							? 'https://p.qlogo.cn/gh/' + -chat.id + '/' + -chat.id + '/0'
							: `https://q1.qlogo.cn/g?b=qq&nk=${chat.id}&s=640`
					"
				></el-avatar>
			</div>
			<div class="right">
				<p class="name withoutdesc">{{ chat.name }}</p>
			</div>
		</el-card>
	</a>
</template>

<script>
	export default {
		name: "GroupEntry",
		props: ['chat']
	};
</script>

<style scoped>
	.card {
		margin-bottom: 10px;
		cursor: pointer;
	}
	.left {
		width: max-content;
		float: left;
	}
	.right {
		margin-left: 50px;
	}
	a {
		text-decoration: none;
	}
	.desc {
		margin-top: 10px;
		color: #606266;
	}
	.name {
		font-weight: bold;
		color: #303133;
	}
	.withoutdesc {
		margin-top: 10px;
		margin-bottom: 10px;
	}
</style>