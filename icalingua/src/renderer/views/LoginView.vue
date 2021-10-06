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
                <h5>Version {{ ver }}</h5>
                <h4 v-if="$route.query.bridge==='true'">
                    正在配置 Bridge 服务器
                </h4>
            </center>
            <el-form-item prop="username">
                <el-input type="text" placeholder="QQ ID" v-model.number="form.username"/>
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
                <el-select v-model="form.storageType" size="small">
                    <el-option label="MongoDB" value="mdb">MongoDB</el-option>
                    <el-option label="Redis" value="redis">Redis</el-option>
                    <el-option label="SQLite (内置)" value="sqlite">SQLite (内置)</el-option>
                    <el-option label="MySQL / MariaDB" value="mysql">MySQL / MariaDB</el-option>
                    <el-option label="PostgreSQL" value="pg">PostgreSQL</el-option>
                </el-select>
            </el-form-item>
            <el-form-item label="Status">
                <el-radio-group v-model="form.onlineStatus" size="small">
                    <el-radio-button label="11">Online</el-radio-button>
                    <el-radio-button label="31">Away From Keyboard</el-radio-button>
                    <el-radio-button label="41">Hide</el-radio-button>
                </el-radio-group>
            </el-form-item>
            <el-form-item prop="connStr" v-show="form.storageType==='mdb'">
                <el-input
                    :show-password="form.mdbConnStr.split(':').length>2"
                    placeholder="MongoDB connect string"
                    v-model="form.mdbConnStr"
                />
            </el-form-item>
            <el-form-item prop="rdsHost" v-show="form.storageType==='redis'">
                <el-input
                    placeholder="Redis Host"
                    v-model="form.rdsHost"
                />
            </el-form-item>
            <el-form-item prop="sqlHost" v-show="form.storageType==='mysql' || form.storageType==='pg'">
                <el-input
                    placeholder="Host"
                    v-model="form.sqlHost"
                />
            </el-form-item>
            <el-form-item prop="sqlUsername" v-show="form.storageType==='mysql' || form.storageType==='pg'">
                <el-input
                    placeholder="username"
                    v-model="form.sqlUsername"
                />
            </el-form-item>
            <el-form-item prop="sqlPassword" v-show="form.storageType==='mysql' || form.storageType==='pg'">
                <el-input
                    placeholder="password"
                    type="password"
                    v-model="form.sqlPassword"
                />
            </el-form-item>
            <el-form-item prop="sqlDatabase" v-show="form.storageType==='mysql' || form.storageType==='pg'">
                <el-input
                    placeholder="database"
                    v-model="form.sqlDatabase"
                />
            </el-form-item>
            <p class="red">
                {{ errmsg }}
            </p>
            <el-form-item align="center">
                <el-button type="primary" v-on:click="onSubmit('loginForm')">
                    <span v-show="!form.password&&$route.query.bridge!=='true'">QR Code</span>
                    Login
                </el-button>
            </el-form-item>
        </el-form>
        <QrcodeDrawer @login="onSubmit('loginForm')"/>
    </div>
</template>

<script>
import {ipcRenderer} from 'electron'
import ipc from '../utils/ipc'
import md5 from 'md5'
import QrcodeDrawer from '../components/QrcodeDrawer'

export default {
    name: 'LoginView',
    components: {QrcodeDrawer},
    data() {
        return {
            ver: '',
            /**
             * @type LoginForm
             */
            form: {},
            rules: {
                username: [{required: true, trigger: 'blur'}],
            },
            disabled: false,
            errmsg: '',
        }
    },
    async created() {
        this.ver = await ipc.getVersion()
        this.form = await ipc.getAccount()
        ipcRenderer.on('error', (_, msg) => {
            this.errmsg = msg
            this.disabled = false
        })
    },
    methods: {
        onSubmit(formName) {
            (this.$refs[formName]).validate(async (valid) => {
                if (valid) {
                    if (!this.form.password && this.$route.query.bridge === 'true') {
                        this.$message('Bridge 模式下暂不支持扫码登录')
                        return
                    }
                    this.disabled = true
                    if (this.form.password && !/^([a-f\d]{32}|[A-F\d]{32})$/.test(this.form.password))
                        this.form.password = md5(this.form.password)
                    await ipcRenderer.send('createBot', this.form)
                }
                else {
                    return false
                }
            })
        },
    },
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
  background-image: url("../assets/loongson.svg");
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
