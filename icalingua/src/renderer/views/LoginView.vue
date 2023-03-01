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
                <h4 v-if="$route.query.bridge === 'true'">正在配置 Bridge 服务器</h4>
            </center>
            <el-form-item prop="username" v-if="$route.query.disableIdLogin === 'false'">
                <el-input type="text" placeholder="QQ ID" v-model.number="form.username" />
            </el-form-item>
            <el-form-item
                prop="password"
                :style="{ marginBottom: '15px' }"
                v-if="$route.query.disableIdLogin === 'false'"
            >
                <el-input type="password" placeholder="Password" v-model="form.password" />
            </el-form-item>
            <el-form-item prop="protocol" label="Protocol" v-if="$route.query.disableIdLogin === 'false'">
                <el-radio-group v-model="form.protocol" size="small">
                    <el-radio-button label="1">Android</el-radio-button>
                    <el-radio-button label="2">aPad</el-radio-button>
                    <el-radio-button label="3">Android Watch</el-radio-button>
                    <el-radio-button label="4">MacOS</el-radio-button>
                    <el-radio-button label="5">iPad</el-radio-button>
                </el-radio-group>
            </el-form-item>
            <el-form-item label="Status" v-if="$route.query.disableIdLogin === 'false'">
                <el-radio-group v-model="form.onlineStatus" size="small">
                    <el-radio-button label="11">Online</el-radio-button>
                    <el-radio-button label="31">Away From Keyboard</el-radio-button>
                    <el-radio-button label="41">Hide</el-radio-button>
                    <el-radio-button label="50">Busy</el-radio-button>
                    <el-radio-button label="60">Q Me</el-radio-button>
                    <el-radio-button label="70">Don't Disturb</el-radio-button>
                </el-radio-group>
            </el-form-item>
            <el-form-item prop="autologin" class="nobottmar">
                <span class="el-form-item__label">Auto login</span>
                <el-switch v-model="form.autologin" :style="{ marginLeft: '5px' }" />
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
            <el-form-item prop="connStr" v-show="form.storageType === 'mdb'">
                <el-input
                    :show-password="form.mdbConnStr && form.mdbConnStr.split(':').length > 2"
                    placeholder="MongoDB connect string"
                    v-model="form.mdbConnStr"
                />
            </el-form-item>
            <el-form-item prop="rdsHost" v-show="form.storageType === 'redis'">
                <el-input placeholder="Redis Host" v-model="form.rdsHost" />
            </el-form-item>
            <el-form-item prop="sqlHost" v-show="form.storageType === 'mysql' || form.storageType === 'pg'">
                <el-input placeholder="Host" v-model="form.sqlHost" />
            </el-form-item>
            <el-form-item prop="sqlUsername" v-show="form.storageType === 'mysql' || form.storageType === 'pg'">
                <el-input placeholder="username" v-model="form.sqlUsername" />
            </el-form-item>
            <el-form-item prop="sqlPassword" v-show="form.storageType === 'mysql' || form.storageType === 'pg'">
                <el-input placeholder="password" type="password" v-model="form.sqlPassword" />
            </el-form-item>
            <el-form-item prop="sqlDatabase" v-show="form.storageType === 'mysql' || form.storageType === 'pg'">
                <el-input placeholder="database" v-model="form.sqlDatabase" />
            </el-form-item>
            <p class="red">
                {{ errmsg }}
            </p>
            <el-form-item align="center">
                <el-button type="primary" v-on:click="onSubmit('loginForm')">
                    <span v-show="!form.password && $route.query.bridge !== 'true'">QR Code</span>
                    Login
                </el-button>
                <el-button type="warning" v-if="errmsg !== ''" v-on:click="cannotLogin"> 无法登录?</el-button>
            </el-form-item>
        </el-form>
        <QrcodeDrawer @login="onSubmit('loginForm')" />
        <el-drawer
            title="短信验证"
            :visible="shouldSubmitSmsCode"
            direction="btt"
            :close-on-press-escape="false"
            :show-close="false"
            :wrapper-closable="false"
            size="100%"
        >
            <p v-if="phone">{{ sendTime !== -1 ? '已' : '' }}向 {{ phone }} 发送验证码</p>
            <el-input
                placeholder="短信验证码"
                v-model="smsCode"
                @input="smsCode = smsCode.slice(0, 6)"
                @keydown.enter.native="submitSmsCode"
            />
            <center>
                <el-button @click="submitSmsCode" type="primary" v-if="sendTime !== -1"> 提交</el-button>
                <el-button @click="sendSmsCode" v-if="sendTime === -1"> 发送验证码</el-button>
                <el-button @click="sendSmsCode" v-if="sendTime !== -1" :disabled="sendTime !== 0">
                    重发 ({{ sendTime }}s)
                </el-button>
                <el-button v-if="verifyUrl" @click="QRCodeVerify"> 扫码验证</el-button>
            </center>
        </el-drawer>
    </div>
</template>

<script>
import { ipcRenderer } from 'electron'
import ipc from '../utils/ipc'
import md5 from 'md5'
import QrcodeDrawer from '../components/QrcodeDrawer'

export default {
    name: 'LoginView',
    components: { QrcodeDrawer },
    data() {
        return {
            ver: '',
            /**
             * @type LoginForm
             */
            form: {},
            rules: {
                username: [{ required: true, trigger: 'blur' }],
            },
            disabled: false,
            errmsg: '',
            shouldSubmitSmsCode: false,
            smsCode: '',
            verifyUrl: '',
            phone: '',
            sendTime: -1,
        }
    },
    async created() {
        this.ver = await ipc.getVersion()
        this.form = await ipc.getAccount()
        ipcRenderer.on('error', (_, msg) => {
            this.errmsg = msg
            this.disabled = false
            this.shouldSubmitSmsCode = false
        })
        ipcRenderer.on('smsCodeVerify', (_, data) => {
            const parsed = JSON.parse(data)
            console.log(parsed.url)
            this.shouldSubmitSmsCode = true
            this.verifyUrl = parsed.url
            this.phone = parsed.phone
        })
    },
    methods: {
        onSubmit(formName) {
            this.$refs[formName].validate(async (valid) => {
                if (valid || this.$route.query.disableIdLogin === 'true') {
                    this.disabled = true
                    if (this.form.password && !/^([a-f\d]{32}|[A-F\d]{32})$/.test(this.form.password))
                        this.form.password = md5(this.form.password)
                    await ipcRenderer.send('createBot', this.form)
                } else {
                    return false
                }
            })
        },
        submitSmsCode() {
            ipcRenderer.send('submitSmsCode', this.smsCode)
        },
        sendSmsCode() {
            ipcRenderer.send('submitSmsCode', 'sendSmsCode')
            this.sendTime = 60
            const timer = setInterval(() => {
                if (this.sendTime === 0) {
                    clearInterval(timer)
                    return
                }
                this.sendTime--
            }, 1000)
        },
        QRCodeVerify() {
            ipcRenderer.send('QRCodeVerify', this.verifyUrl)
        },
        cannotLogin() {
            this.$confirm(
                '无法登录有可能由风控造成，随机生成不同的设备消息或许可以解决，但也有可能造成更严重的风控，是否尝试随机生成?',
                '提示',
                {
                    confirmButtonText: '确定',
                    cancelButtonText: '取消',
                },
            ).then(() => {
                ipcRenderer.send('randomDevice', this.form.username)
                this.$message({
                    type: 'success',
                    message: `已尝试随机生成 ${this.form.username} 的设备消息`,
                })
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
    background-image: url('../assets/loginbg.jpg');
    font-family: 'CircularSpotifyTxT Light Web', sans-serif;
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
