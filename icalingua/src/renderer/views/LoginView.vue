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
            <el-form-item prop="signAPIKey" v-if="$route.query.disableIdLogin === 'false'">
                <el-input type="text" placeholder="Head Sign API Key" v-model="form.signAPIKey" />
            </el-form-item>
            <el-form-item prop="protocol" label="Protocol" v-if="$route.query.disableIdLogin === 'false'">
                <div class="protocol-selects">
                    <el-select
                        v-model="selectedProtocolCategory"
                        placeholder="设备类型"
                        title="设备类型"
                        size="small"
                        @change="onCategoryChange"
                    >
                        <el-option
                            v-for="category in protocolCategories"
                            :key="category.name"
                            :label="category.name"
                            :value="category.name"
                        />
                    </el-select>
                    <el-select v-model="form.protocol" placeholder="协议版本" title="协议版本" size="small">
                        <el-option
                            v-for="protocol in filteredProtocols"
                            :key="protocol.value"
                            :label="protocol.label"
                            :value="protocol.value"
                        />
                    </el-select>
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
            <el-form-item prop="forceAlgoT544">
                <span class="el-form-item__label">Use 8.9.50's Tlv544</span>
                <el-switch v-model="form.forceAlgoT544" />
            </el-form-item>
            <el-form-item prop="useNT">
                <span class="el-form-item__label">Use NT's register</span>
                <el-switch v-model="form.useNT" />
            </el-form-item>
            <el-form-item prop="forceWt">
                <span class="el-form-item__label">Force WT login</span>
                <el-switch v-model="form.forceWt" />
            </el-form-item>
            <el-form-item prop="apkInfo" v-show="form.protocol === '-1'">
                <span class="el-form-item__label">Custom APK Info (JSON)</span>
                <el-tooltip content="可选，自定义 oicq 协议参数" placement="top">
                    <el-input
                        type="textarea"
                        :rows="3"
                        placeholder='{ "id": "com.tencent.mobileqq", "name": "com.tencent.mobileqq", "version": "9.0.95" }'
                        v-model="apkInfoStr"
                        @blur="onApkInfoBlur"
                    />
                </el-tooltip>
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
            <div v-if="dbUpgrade.active" class="db-upgrade-progress">
                <p>{{ dbUpgrade.message }}</p>
                <el-progress
                    :percentage="
                        dbUpgrade.total > 0 ? Math.min(100, Math.round((dbUpgrade.step / dbUpgrade.total) * 100)) : 0
                    "
                    :indeterminate="dbUpgrade.total <= 0"
                    :stroke-width="16"
                    :text-inside="true"
                />
            </div>
            <el-form-item class="buttons">
                <el-button type="primary" v-on:click="onSubmit('loginForm')">
                    <span v-show="!form.password">QR Code</span>
                    Login
                </el-button>
                <el-button type="warning" v-on:click="cannotLogin">更换设备信息</el-button>
            </el-form-item>
        </el-form>
        <QrcodeDrawer @login="onSubmit('loginForm')" />
        <el-drawer
            class="sms-drawer"
            :title="isNtLogin ? 'NT 登录验证' : '短信验证'"
            :visible="shouldSubmitSmsCode"
            direction="btt"
            :close-on-press-escape="false"
            :show-close="false"
            :wrapper-closable="false"
            size="100%"
        >
            <template v-if="isNtLogin">
                <p>请使用手机 QQ 扫描二维码并进行验证</p>
                <canvas ref="ntQrCode" class="nt-verify-qrcode" role="img" aria-label="NT 登录验证二维码"></canvas>
                <div class="buttons">
                    <el-button @click="reLoginAfterNtVerify" type="primary">已验证，重新登录</el-button>
                </div>
            </template>
            <template v-else-if="qrVerifyUrl">
                <p>请使用手机 QQ 扫描二维码并完成验证</p>
                <canvas ref="smsQrCode" class="nt-verify-qrcode" role="img" aria-label="扫码验证二维码"></canvas>
                <div class="buttons">
                    <el-button @click="reLoginAfterQrVerify" type="primary">已验证，重新登录</el-button>
                    <el-button @click="backToSmsVerify">返回短信验证</el-button>
                </div>
            </template>
            <template v-else>
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
                    <el-button
                        v-if="verifyUrl"
                        @click="QRCodeVerify"
                        :loading="qrVerifyLoading"
                        :disabled="qrVerifyLoading"
                    >
                        扫码验证
                    </el-button>
                </div>
            </template>
        </el-drawer>
    </div>
</template>

<script>
import { ipcRenderer } from 'electron'
import ipc from '../utils/ipc'
import { createRendererLifecycleScope } from '../utils/rendererLifecycleScope'
import md5 from 'md5'
import QRCode from 'qrcode-terminal/vendor/QRCode'
import QRErrorCorrectLevel from 'qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel'
import QrcodeDrawer from '../components/QrcodeDrawer'

let loginTimeout = null
let qrLoginInterval = null
let smsCodeInterval = null

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
            apkInfoStr: '',
            rules: {
                username: [{ required: true, trigger: 'blur' }],
            },
            disabled: false,
            errmsg: '',
            dbUpgrade: { active: false, step: 0, total: 0, message: '' },
            shouldSubmitSmsCode: false,
            smsCode: '',
            verifyUrl: '',
            phone: '',
            sendTime: -1,
            qrVerifyUrl: '',
            qrVerifyLoading: false,
            qrVerifyGeneration: 0,
            selectedProtocolCategory: 'Android Phone',
            protocolCategories: [
                {
                    name: 'Android Phone',
                    protocols: [
                        { label: '8.2.11', value: '10001' },
                        { label: '8.8.88', value: '6' },
                        { label: '8.9.33', value: '7' },
                        { label: '8.9.50', value: '1' },
                        { label: '8.9.58', value: '11' },
                        { label: '8.9.63', value: '13' },
                        { label: '8.9.68', value: '15' },
                        { label: '8.9.70', value: '17' },
                        { label: '8.9.71', value: '23' },
                        { label: '8.9.73', value: '19' },
                        { label: '8.9.75', value: '21' },
                        { label: '8.9.76', value: '25' },
                        { label: '8.9.78', value: '27' },
                        { label: '8.9.80', value: '29' },
                        { label: '8.9.83', value: '31' },
                        { label: '8.9.85', value: '33' },
                        { label: '8.9.88', value: '35' },
                        { label: '8.9.93', value: '37' },
                        { label: '9.0.0', value: '39' },
                        { label: '9.0.8', value: '41' },
                        { label: '9.0.17', value: '43' },
                        { label: '9.0.25', value: '45' },
                        { label: '9.0.35', value: '47' },
                        { label: '9.0.50', value: '49' },
                        { label: '9.0.56', value: '51' },
                        { label: '9.0.70', value: '53' },
                        { label: '9.0.95', value: '55' },
                        { label: '9.1.0', value: '57' },
                        { label: '9.1.20', value: '59' },
                        { label: '9.2.80', value: '61' },
                    ],
                },
                {
                    name: 'Android Pad',
                    protocols: [
                        { label: '8.9.33', value: '8' },
                        { label: '8.9.50', value: '2' },
                        { label: '8.9.58', value: '12' },
                        { label: '8.9.63', value: '14' },
                        { label: '8.9.68', value: '16' },
                        { label: '8.9.70', value: '18' },
                        { label: '8.9.71', value: '24' },
                        { label: '8.9.73', value: '20' },
                        { label: '8.9.75', value: '22' },
                        { label: '8.9.76', value: '26' },
                        { label: '8.9.78', value: '28' },
                        { label: '8.9.80', value: '30' },
                        { label: '8.9.83', value: '32' },
                        { label: '8.9.85', value: '34' },
                        { label: '8.9.88', value: '36' },
                        { label: '8.9.93', value: '38' },
                        { label: '9.0.0', value: '40' },
                        { label: '9.0.8', value: '42' },
                        { label: '9.0.17', value: '44' },
                        { label: '9.0.25', value: '46' },
                        { label: '9.0.35', value: '48' },
                        { label: '9.0.50', value: '50' },
                        { label: '9.0.56', value: '52' },
                        { label: '9.0.70', value: '54' },
                        { label: '9.0.95', value: '56' },
                        { label: '9.1.0', value: '58' },
                        { label: '9.1.20', value: '60' },
                        { label: '9.2.80', value: '62' },
                    ],
                },
                {
                    name: 'Android Watch',
                    protocols: [
                        { label: '2.0.5', value: '30002' },
                        { label: '2.0.8', value: '30001' },
                        { label: '9.0.1', value: '3' },
                        { label: '9.0.3', value: '30003' },
                    ],
                },
                {
                    name: 'iPad',
                    protocols: [
                        { label: '8.9.33', value: '9' },
                        { label: '8.9.50', value: '5' },
                    ],
                },
                {
                    name: 'macOS',
                    protocols: [{ label: '6.8.2', value: '4' }],
                },
                {
                    name: 'Android TIM',
                    protocols: [{ label: '3.5.1', value: '10' }],
                },
                {
                    name: 'Custom',
                    protocols: [{ label: 'Custom', value: '-1' }],
                },
            ],
        }
    },
    computed: {
        filteredProtocols() {
            const category = this.protocolCategories.find((c) => c.name === this.selectedProtocolCategory)
            return category ? category.protocols : []
        },
        isNtLogin() {
            return typeof this.verifyUrl === 'string' && this.verifyUrl.includes('&is_nt=1')
        },
    },
    async created() {
        this.lifecycleScope = createRendererLifecycleScope()
        this.ver = await ipc.getVersion()
        this.dbUpgrade = await ipc.getDbUpgradeProgress()
        const _form = await ipc.getAccount()
        if (!_form.signAPIAddress) _form.signAPIAddress = ''
        if (_form.forceWt == null) _form.forceWt = false
        this.apkInfoStr = _form.apkInfo || ''

        if (_form.protocol != null) _form.protocol = String(_form.protocol)
        this.form = _form

        // 根据保存的 protocol 值初始化设备类型选择
        if (_form.protocol) {
            const protocolValue = _form.protocol
            for (const category of this.protocolCategories) {
                if (category.protocols.some((p) => p.value === protocolValue)) {
                    this.selectedProtocolCategory = category.name
                    break
                }
            }
        }
        this.lifecycleScope.onIpc('error', (_, msg) => {
            this.clearLoginTimeout()
            this.clearQrLoginInterval()
            this.clearSmsCodeInterval()
            this.resetQrVerify()
            this.errmsg = msg
            this.disabled = false
            this.shouldSubmitSmsCode = false
            this.smsCode = ''
            this.verifyUrl = ''
            this.phone = ''
            this.sendTime = -1
            this.dbUpgrade = { active: false, step: 0, total: 0, message: '' }

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
                    if (String(msg).includes('QQ版本过低'))
                        this.$alert('账号被限制使用内置的 QQ 版本登录，请更换更高版本协议后重试')
                    else
                        this.$alert(
                            this.form.signAPIAddress
                                ? '可能是 API 配置有误或版本不匹配，请检查 API 配置'
                                : '账号被风控需要头部签名，请根据 README 配置头部签名 API 地址',
                        )
                    break
                default:
                    break
            }
        })
        this.lifecycleScope.onIpc('smsCodeVerify', (_, data) => {
            this.clearLoginTimeout()
            this.clearSmsCodeInterval()
            this.resetQrVerify()
            const parsed = JSON.parse(data)
            this.smsCode = ''
            this.sendTime = -1
            this.verifyUrl = parsed.url || ''
            this.phone = parsed.phone || ''
            this.shouldSubmitSmsCode = true
            if (this.isNtLogin) {
                this.$nextTick(() => this.renderNtVerifyQrCode())
            }
        })
        this.lifecycleScope.onIpc('qrcodeLogin', async (_, url) => {
            this.clearQrLoginInterval()
            qrLoginInterval = this.lifecycleScope.interval(() => {
                const submitForm = { ...this.form, protocol: Number(this.form.protocol) || 2 }
                ipcRenderer.send('createBot', submitForm)
            }, 5 * 1000)
        })
        this.lifecycleScope.onIpc('dbUpgradeProgress', (_, progress) => {
            this.dbUpgrade = progress
            this.clearLoginTimeout()
        })
    },
    beforeDestroy() {
        this.clearSmsCodeInterval()
        this.lifecycleScope?.dispose()
        loginTimeout = null
        qrLoginInterval = null
        smsCodeInterval = null
    },
    methods: {
        clearLoginTimeout() {
            if (!loginTimeout) return
            this.lifecycleScope.cancelTimeout(loginTimeout)
            loginTimeout = null
        },
        clearQrLoginInterval() {
            if (!qrLoginInterval) return
            this.lifecycleScope.cancelInterval(qrLoginInterval)
            qrLoginInterval = null
        },
        clearSmsCodeInterval() {
            if (!smsCodeInterval) return
            this.lifecycleScope.cancelInterval(smsCodeInterval)
            smsCodeInterval = null
        },
        resetQrVerify() {
            this.qrVerifyGeneration++
            this.qrVerifyUrl = ''
            this.qrVerifyLoading = false
        },
        renderQrCode(canvas, content, errorMessage) {
            if (!canvas || !content) return

            try {
                const qrCode = new QRCode(-1, QRErrorCorrectLevel.M)
                qrCode.addData(content)
                qrCode.make()

                const quietZone = 4
                const moduleCount = qrCode.getModuleCount()
                const moduleSize = Math.max(2, Math.floor(320 / (moduleCount + quietZone * 2)))
                const canvasSize = (moduleCount + quietZone * 2) * moduleSize
                const context = canvas.getContext('2d')
                if (!context) throw new Error('当前环境不支持 Canvas')

                canvas.width = canvasSize
                canvas.height = canvasSize
                context.imageSmoothingEnabled = false
                context.fillStyle = '#fff'
                context.fillRect(0, 0, canvasSize, canvasSize)
                context.fillStyle = '#000'
                qrCode.modules.forEach((row, rowIndex) => {
                    row.forEach((dark, columnIndex) => {
                        if (dark) {
                            context.fillRect(
                                (columnIndex + quietZone) * moduleSize,
                                (rowIndex + quietZone) * moduleSize,
                                moduleSize,
                                moduleSize,
                            )
                        }
                    })
                })
            } catch (e) {
                canvas.width = 0
                canvas.height = 0
                this.$message.error(errorMessage + (e.message || e))
            }
        },
        renderNtVerifyQrCode() {
            if (!this.isNtLogin) return
            this.renderQrCode(this.$refs.ntQrCode, this.verifyUrl, '无法生成 NT 登录二维码：')
        },
        renderSmsVerifyQrCode() {
            this.renderQrCode(this.$refs.smsQrCode, this.qrVerifyUrl, '无法生成扫码验证二维码：')
        },
        onCategoryChange() {
            // 切换设备类型时，自动选择该类型的第一个协议版本
            const category = this.protocolCategories.find((c) => c.name === this.selectedProtocolCategory)
            if (category && category.protocols.length > 0) {
                this.form.protocol = category.protocols[0].value
            }
        },
        onSubmit(formName) {
            this.$refs[formName].validate(async (valid) => {
                if (valid || this.$route.query.disableIdLogin === 'true') {
                    this.disabled = true
                    this.dbUpgrade = { active: false, step: 0, total: 0, message: '' }
                    if (this.form.password && !/^([a-f\d]{32}|[A-F\d]{32})$/.test(this.form.password))
                        this.form.password = md5(this.form.password)
                    if (!this.form.signAPIAddress) {
                        this.$message.warning('未配置签名 API，可能禁止登录或无法发送消息')
                    }
                    if (!this.form.useNT) {
                        this.$message('使用新版本时建议使用 NT 上线以支持部分新功能')
                    }
                    if (this.form.password) {
                        this.clearLoginTimeout()
                        loginTimeout = this.lifecycleScope.timeout(() => {
                            this.$alert(
                                '登录时间似乎过长了，请检查网络是否正常，切换非同类协议请先删除 token，若仍无法登录请携带日志反馈',
                            )
                        }, 60 * 1000)
                    }
                    const submitForm = { ...this.form, protocol: Number(this.form.protocol) || 2 }
                    if (this.form.protocol === '-1') {
                        const apkStr = this.apkInfoStr.trim()
                        if (apkStr) {
                            try {
                                JSON.parse(apkStr)
                            } catch (e) {
                                this.$message.error('APK Info JSON 格式错误: ' + e.message)
                                this.disabled = false
                                return
                            }
                        }
                        submitForm.apkInfo = apkStr || '{}'
                    }
                    await ipcRenderer.send('createBot', submitForm)
                } else {
                    return false
                }
            })
        },
        submitSmsCode() {
            if (this.isNtLogin) return
            ipcRenderer.send('submitSmsCode', this.smsCode)
        },
        sendSmsCode() {
            if (this.isNtLogin) return
            this.clearSmsCodeInterval()
            ipcRenderer.send('submitSmsCode', 'sendSmsCode')
            this.sendTime = 60
            smsCodeInterval = this.lifecycleScope.interval(() => {
                if (this.sendTime === 0) {
                    this.clearSmsCodeInterval()
                    return
                }
                this.sendTime--
            }, 1000)
        },
        reLoginAfterNtVerify() {
            if (!this.isNtLogin) return
            this.clearLoginTimeout()
            this.clearSmsCodeInterval()
            this.shouldSubmitSmsCode = false
            this.disabled = true
            ipcRenderer.send('reLogin')
        },
        async QRCodeVerify() {
            if (this.isNtLogin || !this.verifyUrl || this.qrVerifyLoading || this.qrVerifyUrl) return
            this.clearLoginTimeout()
            const generation = ++this.qrVerifyGeneration
            this.qrVerifyLoading = true
            try {
                const result = await ipc.createQRCodeVerify(this.verifyUrl, this.form.username)
                if (generation !== this.qrVerifyGeneration) return

                this.qrVerifyUrl = result.qrUrl
                await this.$nextTick()
                if (generation !== this.qrVerifyGeneration) return
                this.renderSmsVerifyQrCode()
            } catch (e) {
                if (generation === this.qrVerifyGeneration) {
                    this.$message.error('无法获取扫码验证二维码：' + (e.message || e))
                }
            } finally {
                if (generation === this.qrVerifyGeneration) this.qrVerifyLoading = false
            }
        },
        backToSmsVerify() {
            this.resetQrVerify()
        },
        reLoginAfterQrVerify() {
            if (!this.qrVerifyUrl) return
            this.resetQrVerify()
            this.shouldSubmitSmsCode = false
            this.disabled = true
            ipc.reLogin()
        },
        cannotLogin() {
            this.$confirm(
                '无法登录/发送消息有可能由风控造成，随机生成不同的设备消息或许可以解决，但也有可能造成更严重的风控，是否尝试随机生成?',
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
        onApkInfoBlur() {
            const val = this.apkInfoStr.trim()
            if (!val) return
            try {
                JSON.parse(val)
            } catch (e) {
                this.$message.error('APK Info JSON 格式错误: ' + e.message)
            }
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

.db-upgrade-progress {
    margin: 0 0 22px;
}

.db-upgrade-progress p {
    margin: 0 0 8px;
    color: #606266;
    font-size: 13px;
}

.protocol-selects {
    display: flex;
    gap: 10px;
    width: 100%;
}

.protocol-selects .el-select {
    flex: 1;
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

.nt-verify-qrcode {
    display: block;
    width: min(80vw, 320px);
    height: auto;
    margin: 0 auto 15px;
    image-rendering: pixelated;
    background: #fff;
}
</style>
