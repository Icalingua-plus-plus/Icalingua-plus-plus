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
            </center>
            <p>
                请编辑 <code>~/.config/icalingua/config.yaml</code> 设置 bridge 后端信息
            </p>
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
