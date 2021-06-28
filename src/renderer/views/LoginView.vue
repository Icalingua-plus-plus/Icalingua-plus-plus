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
			v-show="view === 'login'"
		>
			<center>
				<h5>Version {{ ver }}</h5>
			</center>
			<el-form-item prop="username">
				<el-input type="text" placeholder="QQ ID" v-model="form.username"/>
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
			<el-form-item prop="autologin" class="nobottmar">
				<span class="el-form-item__label">Auto login</span>
				<el-switch v-model="form.autologin" :style="{ marginLeft: '5px' }"/>
			</el-form-item>
			<el-form-item label="Storage engine">
				<el-radio-group v-model="storage" size="small" disabled>
					<el-radio-button label="idb">Indexed DB</el-radio-button>
					<el-radio-button label="mdb">MongoDB</el-radio-button>
					<el-radio-button label="redis">Redis (Beta)</el-radio-button>
				</el-radio-group>
			</el-form-item>
			<el-form-item label="Status">
				<el-radio-group v-model="form.onlineStatus" size="small">
					<el-radio-button label="11">Online</el-radio-button>
					<el-radio-button label="31">Away From Keyboard</el-radio-button>
					<el-radio-button label="41">Hide</el-radio-button>
				</el-radio-group>
			</el-form-item>
			<el-form-item prop="connStr" v-show="storage==='mdb'">
				<el-input
					:show-password="connStr.split(':').length>2"
					placeholder="MongoDB connect string"
					v-model="connStr"
				/>
			</el-form-item>
			<el-form-item prop="rdsHost" v-show="storage==='redis'">
				<el-input
					placeholder="Redis Host"
					v-model="rdsHost"
				/>
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
		<el-form
			:rules="rules"
			:hide-required-asterisk="true"
			label-position="top"
			class="login-box"
			v-show="view === 'captcha'"
		>
			<center>
				<h4>验证码</h4>
				<el-form-item prop="captchaimg">
					<img :src="captchaimg" width="50%"/>
				</el-form-item>
			</center>
			<el-form-item prop="captcha">
				<el-input type="text" placeholder="输入验证码" v-model="captcha"/>
			</el-form-item>
			<p class="red">
				{{ errmsg }}
			</p>
			<el-form-item align="center">
				<el-button type="primary" @click="captchaLogin"> Login</el-button>
			</el-form-item>
		</el-form>
	</div>
</template>

<script>
import {ipcRenderer} from 'electron'

const remote = require('@electron/remote')

const md5 = require("md5");
const path = require("path");
const fs = require("fs");

const glodb = remote.getGlobal("glodb");
export default {
	name: "LoginView",
	data() {
		return {
			ver: remote.app.getVersion(),
			form: {
				username: "",
				password: "",
				protocol: 2,
				autologin: false,
				onlineStatus: 11,
			},

			rules: {
				username: [{required: true, trigger: "blur"}],
				password: [{required: true, trigger: "blur"}],
			},

			disabled: false,
			errmsg: "",
			view: "login",
			captcha: "",
			captchaimg: "",

			storage: '',
			connStr: '',
			rdsHost: ''
		};
	},
	created() {
		const account = glodb.get("account").value();
		if (account)
			this.form = {
				username: account.username,
				password: account.password,
				protocol: account.protocol,
				autologin: account.autologin,
				onlineStatus: account.onlineStatus
			};
		// this.storage = glodb.get("storage").value() || 'idb'
		this.storage = 'mdb'
		if (this.storage === 'json') this.storage = 'idb'
		this.connStr = glodb.get("connStr").value() || 'mongodb://localhost'
		this.rdsHost = glodb.get("rdsHost").value() || '127.0.0.1'
		ipcRenderer.on('error', (_, msg) => {
			this.errmsg = msg
			this.disabled = false;
		})
	},
	mounted() {
		if (this.form.autologin) this.onSubmit("loginForm");
	},
	methods: {
		onSubmit(formName) {
			this.$refs[formName].validate(async (valid) => {
				if (valid) {
					this.disabled = true;
					glodb.set("storage", this.storage)
						.set("rdsHost", this.rdsHost)
						.set("connStr", this.connStr).write();
					if (!/^([a-f\d]{32}|[A-F\d]{32})$/.test(this.form.password))
						this.form.password = md5(this.form.password);
					await ipcRenderer.invoke('createBot', this.form, {
						storageType: this.storage,
						mdbConnStr: this.connStr,
						rdsHost: this.rdsHost
					});
				}
				else {
					return false;
				}
			});
		},

		captchaLogin() {
			const bot = remote.getGlobal("bot");
			bot.captchaLogin(this.captcha);
		},
	},
};
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
	background-image: url("../assets/loginbg.jpg");
	font-family: "CircularSpotifyTxT Light Web", sans-serif;
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
