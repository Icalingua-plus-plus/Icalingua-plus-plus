<template>
    <div id="login">
        <el-form
            ref="loginForm"
            :model="form"
            :rules="rules"
            :hide-required-asterisk="true"
            :disabled="disabled"
            label-position="left"
        >
            <h1 class="title">
                <span>
                    {{ $route.query.bridge === 'true' ? '配置 Bridge 服务器' : '登录' }}
                </span>
                <span>Version {{ ver }}</span>
            </h1>
            <el-form-item prop="username" v-if="$route.query.disableIdLogin === 'false'">
                <el-input type="text" placeholder="QQ ID" v-model.number="form.username" />
            </el-form-item>
            <el-form-item prop="password" v-if="$route.query.disableIdLogin === 'false'">
                <el-input type="password" placeholder="Password" v-model="form.password" />
            </el-form-item>
            <el-form-item prop="signAPIAddress" v-if="$route.query.disableIdLogin === 'false'">
                <el-input type="text" placeholder="Head Sign API Address" v-model="form.signAPIAddress" />
            </el-form-item>
            <el-form-item prop="protocol" label="Protocol" v-if="$route.query.disableIdLogin === 'false'">
                <div class="protocols">
                    <span>Android Phone</span>
                    <el-radio-group v-model="form.protocol" size="mini">
                        <el-radio-button label="6">8.8.88</el-radio-button>
                        <el-radio-button label="7">8.9.33</el-radio-button>
                        <el-radio-button label="1">8.9.50</el-radio-button>
                        <el-radio-button label="11">8.9.58</el-radio-button>
                        <el-radio-button label="13">8.9.63</el-radio-button>
                    </el-radio-group>
                    <span>Android Pad</span>
                    <el-radio-group v-model="form.protocol" size="mini">
                        <el-radio-button label="8">8.9.33</el-radio-button>
                        <el-radio-button label="2">8.9.50</el-radio-button>
                        <el-radio-button label="12">8.9.58</el-radio-button>
                        <el-radio-button label="14">8.9.63</el-radio-button>
                    </el-radio-group>
                    <span>iPad</span>
                    <el-radio-group v-model="form.protocol" size="mini">
                        <el-radio-button label="9">8.9.33</el-radio-button>
                        <el-radio-button label="5">8.9.50</el-radio-button>
                    </el-radio-group>
                    <span>Other</span>
                    <el-radio-group v-model="form.protocol" size="mini">
                        <el-radio-button label="3">Android Watch 2.0.8</el-radio-button>
                        <el-radio-button label="4">macOS 5.9.3</el-radio-button>
                        <el-radio-button label="10">TIM 3.5.1</el-radio-button>
                    </el-radio-group>
                </div>
            </el-form-item>
            <el-form-item label="Status" v-if="$route.query.disableIdLogin === 'false'">
                <el-radio-group v-model="form.onlineStatus" size="small">
                    <el-radio-button label="11">Online</el-radio-button>
                    <el-radio-button label="31">Away</el-radio-button>
                    <el-radio-button label="41">Hide</el-radio-button>
                    <el-radio-button label="50">Busy</el-radio-button>
                    <el-radio-button label="60">Q Me</el-radio-button>
                    <el-radio-button label="70">Don't Disturb</el-radio-button>
                </el-radio-group>
            </el-form-item>
            <el-form-item prop="autologin">
                <span class="el-form-item__label">Auto login</span>
                <el-switch v-model="form.autologin" />
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
            <p v-if="errmsg" class="error">
                {{ errmsg }}
            </p>
            <el-form-item class="buttons">
                <el-button type="primary" v-on:click="onSubmit('loginForm')">
                    <span v-show="!form.password && $route.query.bridge !== 'true'">QR Code</span>
                    Login
                </el-button>
                <el-button type="warning" v-on:click="cannotLogin">更换设备信息</el-button>
            </el-form-item>
        </el-form>
        <QrcodeDrawer @login="onSubmit('loginForm')" />
        <el-drawer
            class="sms-drawer"
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
            <div class="buttons">
                <el-button @click="submitSmsCode" type="primary" v-if="sendTime !== -1">提交</el-button>
                <el-button @click="sendSmsCode" type="primary" v-if="sendTime === -1">发送验证码</el-button>
                <el-button @click="sendSmsCode" :disabled="sendTime !== 0" v-else>
                    重发{{ sendTime !== 0 ? ` (${sendTime}s)` : '' }}
                </el-button>
                <el-button v-if="verifyUrl" @click="QRCodeVerify">扫码验证</el-button>
            </div>
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
            loginTimeout: null,
        }
    },
    async created() {
        this.ver = await ipc.getVersion()
        const _form = await ipc.getAccount()
        if (!_form.signAPIAddress) _form.signAPIAddress = ''
        this.form = _form
        ipcRenderer.on('error', (_, msg) => {
            if (this.loginTimeout) clearTimeout(this.loginTimeout)
            this.errmsg = msg
            this.disabled = false
            this.shouldSubmitSmsCode = false

            const tmp = String(msg).split(' ')
            const code = tmp[tmp.length - 1]
            switch (code) {
                case '(235)':
                    this.$alert('设备信息可能被封禁, 请点击 更换设备信息 按钮后重试')
                    break
                case '(237)':
                    this.$alert('账号登录过于频繁，请稍后再试')
                    break
                case '(45)':
                    if (this.form.protocol === 3) break
                    if (String(msg).includes('你当前使用的QQ版本过低'))
                        this.$alert(
                            '账号被限制使用内置的 QQ 版本登录，请' +
                                (this.form.protocol >= 13 ? '等待更新' : '更换更高版本协议'),
                        )
                    else
                        this.$alert(
                            this.form.signAPIAddress
                                ? '可能为非常用环境登录，也有可能是 API 配置有误或不支持此版本协议'
                                : '账号被风控需要头部签名，请根据 README 配置头部签名 API 地址',
                        )
                    break
                default:
                    break
            }
        })
        ipcRenderer.on('smsCodeVerify', (_, data) => {
            if (this.loginTimeout) clearTimeout(this.loginTimeout)
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
                    if (!this.form.signAPIAddress) {
                        this.$message.warning('未配置签名 API，可能禁止登录或无法发送消息')
                    }
                    this.loginTimeout = setTimeout(() => {
                        this.$alert(
                            '登录时间似乎过长了，请检查网络是否正常，如果安卓系/苹果系协议互相切换请先删除 token，若还不能登录请携带日志反馈',
                        )
                    }, 60 * 1000)
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
            if (this.loginTimeout) clearTimeout(this.loginTimeout)
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
#login {
    padding: 15px;
    font-family: 'CircularSpotifyTxT Light Web', sans-serif;
}

#login::before {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: -1;
    background-position: bottom;
    background-repeat: no-repeat;
    background-size: contain;
    background-image: url('../assets/loginbg.jpg');
}

.title {
    font-size: 16px;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin: 0 0 15px;
}

.error {
    color: red;
    margin: 0 0 22px;
}

.protocols {
    clear: left;
    display: grid;
    grid-template-columns: max-content 1fr;
    align-items: center;
    gap: 4px;
}

.protocols span {
    color: #606266;
    font-size: 12px;
    line-height: normal;
}

.buttons {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    margin-bottom: 0;
}

.sms-drawer {
    text-align: center;
}

.sms-drawer :deep(.el-drawer__body) {
    padding: 0 20px 20px;
}

.sms-drawer p,
.sms-drawer .el-input {
    margin: 0 0 15px;
}
</style>
