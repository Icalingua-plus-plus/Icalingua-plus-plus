const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

if (!process.versions.electron) {
    const { test } = require('node:test')
    const { spawnSync } = require('node:child_process')
    const os = require('node:os')
    test('real Electron initializes captcha emulation and receives an iframe callback without crashing', () => {
        const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'icalingua-captcha-test-'))
        try {
            const env = { ...process.env, ICALINGUA_CAPTCHA_TEST_DATA: userData }
            delete env.ELECTRON_RUN_AS_NODE
            const result = spawnSync(require('electron'), ['--no-sandbox', __filename], {
                env,
                encoding: 'utf8',
                windowsHide: true,
                timeout: 25000,
            })
            assert.ifError(result.error)
            assert.equal(result.status, 0, result.stdout + result.stderr)
            assert.match(result.stdout, /Captcha Electron integration passed/)
        } finally {
            assert.equal(path.dirname(path.resolve(userData)), path.resolve(os.tmpdir()))
            fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
        }
    })
} else {
    const { app, BrowserWindow } = require('electron')
    const http = require('node:http')
    const vm = require('node:vm')
    const ts = require('typescript')
    app.setPath('userData', process.env.ICALINGUA_CAPTCHA_TEST_DATA)
    app.whenReady()
        .then(async () => {
            const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, 'sliderCaptcha.ts'), 'utf8'), {
                compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
            }).outputText
            const exports = {}
            const frameSessions = new Set()
            vm.runInNewContext(source, {
                exports,
                URL,
                process,
                console,
                setTimeout,
                clearTimeout,
                require(name) {
                    assert.equal(name, '../../utils/IcalinguaWindow')
                    return {
                        newIcalinguaWindow: (options) => {
                            const win = new BrowserWindow({
                                ...options,
                                show: false,
                                webPreferences: {
                                    ...options.webPreferences,
                                    offscreen: true,
                                    backgroundThrottling: false,
                                },
                            })
                            win.webContents.debugger.on('message', (_, method, params) => {
                                if (method === 'Target.attachedToTarget' && params.targetInfo.type === 'iframe')
                                    frameSessions.add(params.sessionId)
                                if (method === 'Target.detachedFromTarget') frameSessions.delete(params.sessionId)
                            })
                            return win
                        },
                    }
                },
            })
            // Both documents run their probes as their very first script. No QQ traffic
            // or real login credentials are involved in this native-process regression.
            const profile = `({platform:navigator.platform,touch:navigator.maxTouchPoints,
                mobile:navigator.userAgentData.mobile,uaPlatform:navigator.userAgentData.platform,
                screen:[screen.width,screen.height],
                iframeNative:Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'src').set.toString().includes('[native code]')})`
            const server = http.createServer((req, res) => {
                res.setHeader('Content-Type', 'text/html')
                res.end(
                    req.url.startsWith('/frame')
                        ? `<style>body{margin:0}button{width:250px;height:100px}</style>
                           <button id="challenge">Challenge</button>
                           <script>
                           parent.postMessage({...${profile},loadedRound:Number(new URLSearchParams(location.search).get('round')||0)},'*');
                           const round=Number(new URLSearchParams(location.search).get('round')||0);
                           const workerStart=performance.now();
                           const worker=new Worker(URL.createObjectURL(new Blob(["postMessage('ready')"],{type:'application/javascript'})));
                           worker.onmessage=()=>{parent.postMessage({workerRound:round,workerMs:performance.now()-workerStart},'*');worker.terminate()};
                           challenge.addEventListener('pointerdown',e=>parent.postMessage({input:e.pointerType,round},'*'));
                           challenge.addEventListener('click',()=>parent.postMessage({confirmedRound:round},'*'));
                           </script>`
                        : `<meta name="viewport" content="width=device-width,initial-scale=1">
                           <style>body{margin:0}iframe{border:0;width:100%;height:300px}</style>
                           <script>window.profile=${profile};window.inputs=[];window.rounds=0;window.readyRound=-1;window.workerTimes=[];
                           addEventListener('message',e=>{
                               if(e.data.input)inputs.push(e.data.input);
                               else if(e.data.workerRound!==undefined)workerTimes.push(e.data);
                               else if(e.data.confirmedRound===rounds){rounds++;document.querySelector('iframe').src='http://localhost:${server.address().port}/frame?round='+rounds}
                               else if(e.data.loadedRound!==undefined){window.frameProfile=e.data;window.readyRound=e.data.loadedRound}
                           })</script>
                           <iframe src="http://localhost:${server.address().port}/frame"></iframe>`,
                )
            })
            await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
            try {
                const submitted = []
                const win = await exports.openSliderCaptcha(`http://127.0.0.1:${server.address().port}/`, (value) =>
                    submitted.push(value),
                )
                const profiles = await win.webContents.executeJavaScript(
                    '({main:window.profile,frame:window.frameProfile})',
                )
                for (const profile of [profiles.main, profiles.frame]) {
                    assert.equal(profile.platform, 'Linux armv8l')
                    assert.equal(profile.touch, 5)
                    assert.equal(profile.mobile, true)
                    assert.equal(profile.uaPlatform, 'Android')
                    assert.equal(profile.iframeNative, true)
                }
                assert.deepEqual(profiles.main.screen, [393, 851])
                await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
                    const start=performance.now();
                    function check(){
                        if(workerTimes.some(e=>e.workerRound===0)){resolve();return}
                        if(performance.now()-start>500){reject(new Error('captcha Worker stayed paused beyond the 500ms fallback deadline'));return}
                        setTimeout(check,10)
                    }check()
                })`)
                // Route actual browser input through the renderer, rather than calling
                // element.click(). Each click replaces the cross-process challenge frame.
                for (let round = 1; round <= 3; round++) {
                    const painted = new Promise((resolve) => win.webContents.once('paint', resolve))
                    win.webContents.invalidate()
                    await painted
                    const session = Array.from(frameSessions).at(-1)
                    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
                        // Queue the complete physical gesture. A touch-emulated press
                        // can wait for release, and a successful click destroys its target.
                        win.webContents.debugger
                            .sendCommand(
                                'Input.dispatchMouseEvent',
                                {
                                    type,
                                    x: 80,
                                    y: 45,
                                    button: type === 'mouseMoved' ? 'none' : 'left',
                                    clickCount: 1,
                                },
                                session,
                            )
                            .catch(() => {})
                    }
                    await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
                        const start=performance.now();
                        function check(){
                            if(rounds===${round}&&readyRound===${round}){resolve();return}
                            if(performance.now()-start>1000){reject(new Error('retry challenge did not receive click: '+JSON.stringify({rounds,readyRound,inputs,expected:${round}})));return}
                            setTimeout(check,10)
                        }check()
                    })`)
                    await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
                        const start=performance.now();
                        function check(){
                            if(workerTimes.some(e=>e.workerRound===${round})){resolve();return}
                            if(performance.now()-start>500){reject(new Error('retry Worker missed startup deadline'));return}
                            setTimeout(check,10)
                        }check()
                    })`)
                }
                const workerTimes = await win.webContents.executeJavaScript('window.workerTimes')
                assert.equal(workerTimes.length, 4)
                assert.ok(
                    workerTimes.every((entry) => entry.workerMs < 500),
                    'all computation workers must start before fallback',
                )
                assert.deepEqual(await win.webContents.executeJavaScript('window.inputs'), ['touch', 'touch', 'touch'])
                const closed = new Promise((resolve) => win.once('closed', resolve))
                await win.webContents.executeJavaScript(`setTimeout(()=>{
                    const frame=document.createElement('iframe');document.body.append(frame);
                    frame.src='jsbridge://CAPTCHA/onVerifyCAPTCHA?p='+
                        encodeURIComponent(JSON.stringify({ticket:'test-ticket',randstr:'test-random'}))+'#2'
                },50)`)
                await closed
                assert.deepEqual(submitted, ['test-ticket,test-random'])
                console.log('Captcha Electron integration passed')
            } finally {
                server.close()
            }
            app.quit()
        })
        .catch((error) => {
            console.error(error)
            app.exit(1)
        })
}
