<template>
	<div>
		<el-form v-model="aria2" label-width="100px">
			<el-form-item label="enabled">
				<el-switch v-model="aria2.enabled"/>
			</el-form-item>
			<el-form-item label="host">
				<el-input v-model="aria2.host"/>
			</el-form-item>
			<el-form-item label="port">
				<el-input-number v-model.number="aria2.port"/>
			</el-form-item>
			<el-form-item label="secure">
				<el-switch v-model="aria2.secure"/>
			</el-form-item>
			<el-form-item label="secret">
				<el-input v-model="aria2.secret"/>
			</el-form-item>
			<el-form-item label="path">
				<el-input v-model="aria2.path"/>
			</el-form-item>
		</el-form>
		<div slot="footer" class="dialog-footer">
			<el-button type="primary" @click="closeAria">Close</el-button>
		</div>
	</div>
</template>

<script>
export default {
	name: 'Aria2Settings',
}
</script>

<style scoped>

</style>
