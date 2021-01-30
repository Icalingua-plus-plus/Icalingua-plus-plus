<template>
	<div id="login">
		<el-form
			ref="loginForm"
			:model="form"
			:rules="rules"
			:hide-required-asterisk="true"
			:disabled="disabled"
			label-position="top"
			class="login-box"
		>
			<center>
				<h5>Version {{ ver }} Preview</h5>
			</center>
			<h4 class="red nobottmar">Insider version</h4>
			<h2 class="red notopmar">DO NOT DISTRIBUTE</h2>
			<el-form-item prop="username">
				<el-input type="text" placeholder="QQ ID" v-model="form.username" />
			</el-form-item>
			<el-form-item prop="password" :style="{ marginBottom: '15px' }">
				<el-input
					type="password"
					placeholder="Password"
					v-model="form.password"
				/>
			</el-form-item>
			<el-form-item prop="protocol" label="Protocol">
				<el-radio-group v-model="form.protocol" size="small">
					<el-radio-button label="1">Android</el-radio-button>
					<el-radio-button label="2">aPad</el-radio-button>
					<el-radio-button label="3">Android Watch</el-radio-button>
					<el-radio-button label="4">MacOS</el-radio-button>
					<el-radio-button label="5">iPad</el-radio-button>
				</el-radio-group>
			</el-form-item>
			<el-form-item prop="autologin">
				<span class="el-form-item__label">Auto login</span>
				<el-switch
					v-model="form.autologin"
					:style="{ marginLeft: '5px' }"
				></el-switch>
			</el-form-item>
			<p class="red">
				{{ errmsg }}
			</p>
			<el-form-item align="center">
				<el-button type="primary" v-on:click="onSubmit('loginForm')">
					Login
				</el-button>
			</el-form-item>
		</el-form>
	</div>
</template>

<script>
	import { remote } from 'electron'
	const md5 = require('md5')
	const path = require('path')

	const glodb = remote.getGlobal('glodb')
	glodb.defaults({
		account: {
			username: '',
			password: '',
			protocol: 2,
			autologin: false,
		}
	})
		.write()
	export default {
		name: "LoginView",
		data() {
			return {
				ver: remote.app.getVersion(),
				form: {
					username: '',
					password: '',
					protocol: 2,
					autologin: false,
				},

				rules: {
					username: [
						{ required: true, trigger: 'blur' }
					],
					password: [
						{ required: true, trigger: 'blur' }
					]
				},

				disabled: false,
				errmsg: '',
			}
		},
		created() {
			const account = glodb.get("account").value()
			if (account)
				this.form = {
					username: account.username,
					password: account.password,
					protocol: account.protocol,
					autologin: account.autologin
				}
		},
		mounted() {
			if (this.form.autologin)
				this.onSubmit("loginForm")
		},
		methods: {
			onSubmit(formName) {
				this.$refs[formName].validate((valid) => {
					if (valid) {
						this.disabled = true
						const createBot = remote.getGlobal("createBot")
						createBot(this.form)
						const bot = remote.getGlobal("bot")
						if (!/^([a-f\d]{32}|[A-F\d]{32})$/.test(this.form.password))
							this.form.password = md5(this.form.password)

						const slider = (data) => {
							console.log(data)
							this.errmsg = "Require slider captcha that is not supported"
							this.disabled = false
						}
						const captcha = (data) => {
							console.log(data)
							this.errmsg = "Require captcha that is not supported"
							this.disabled = false
						}
						const onErr = (data) => {
							console.log(data)
							this.errmsg = data.message
							this.disabled = false
						}
						const onSucceed = () => {
							bot.removeListener("system.login.slider", slider);
							bot.removeListener("system.login.captcha", captcha);
							bot.removeListener("system.login.error", onErr);
							bot.removeListener("system.online", onSucceed);
							bot.removeListener("system.login.device", verify);
							//save account info
							glodb.set('account', {
								username: Number(this.form.username),
								password: this.form.password,
								protocol: Number(this.form.protocol),
								autologin: this.form.autologin
							}).write()

							const loadMainWindow = remote.getGlobal("loadMainWindow")
							loadMainWindow()
							//close login window
							remote.getCurrentWindow().destroy()
						}
						const verify = (data) => {
							const veriWin = new remote.BrowserWindow({
								height: 500,
								width: 500,
								webPreferences: {
									nativeWindowOpen: true
								}
							})
							veriWin.on("close", () => {
								this.onSubmit("loginForm")
							})
							veriWin.webContents.on("did-finish-load", function () {
								veriWin.webContents.executeJavaScript("mqq.invoke=function(a, b, c){if(b=='closeWebViews'){window.close();}}");
							});
							veriWin.loadURL(data.url.replace('safe/verify', 'safe/qrcode'))
						}
						bot.on("system.login.slider", slider);
						bot.on("system.login.captcha", captcha);
						bot.on("system.login.error", onErr);
						bot.on("system.online", onSucceed);
						bot.on("system.login.device", verify);
						bot.login(this.form.password)
					} else {
						return false;
					}
				});
			}
		}
	}
</script>

<style scoped>
	div#login {
		height: 100%;
		width: 100%;
		margin: 0;
		position: absolute;
		background-position: bottom;
		background-repeat: no-repeat;
		background-size: contain;
		background-image: url("~@/assets/loginbg.jpg");
	}
	.login-box {
		margin: 15px;
	}
	.red {
		color: red;
	}
	.nobottmar {
		margin-bottom: 0;
	}
	.notopmar {
		margin-top: 0;
	}
</style>