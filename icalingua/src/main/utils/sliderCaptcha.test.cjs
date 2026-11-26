const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { EventEmitter } = require('node:events')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

// Exercise the production helper without importing the application's bot/database graph.
function fixture({ failCommand, load, sendCommand } = {}) {
    const calls = []
    const contents = new EventEmitter()
    let rendererReady = false
    contents.setUserAgent = (value) => calls.push(['ua', value])
    contents.enableDeviceEmulation = (value) => {
        assert.equal(rendererReady, true, 'device emulation requires a committed local document')
        calls.push(['device', value])
    }
    contents.debugger = Object.assign(new EventEmitter(), {
        attach: (version) => calls.push(['attach', version]),
        async sendCommand(method, params, sessionId) {
            calls.push([method, params, sessionId])
            if (sendCommand) await sendCommand(method, params, sessionId)
            if (method === failCommand) throw new Error('emulation failed')
        },
    })
    let destroyed = false
    const win = {
        webContents: contents,
        isDestroyed: () => destroyed,
        destroy: () => {
            destroyed = true
        },
        async loadURL(url) {
            calls.push(['load', url])
            await load?.(win)
            rendererReady = true
        },
    }
    const source = ts.transpileModule(readFileSync(path.join(__dirname, 'sliderCaptcha.ts'), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText
    const exports = {}
    vm.runInNewContext(source, {
        exports,
        URL,
        setTimeout,
        clearTimeout,
        console: { error: () => {} },
        process: { versions: { chrome: '142.0.7444.175' } },
        require(name) {
            assert.equal(name, '../../utils/IcalinguaWindow')
            return {
                newIcalinguaWindow(options) {
                    calls.push(['window', options])
                    return win
                },
            }
        },
    })
    function navigate(url) {
        let prevented = false
        contents.emit('will-frame-navigate', {
            url,
            preventDefault() {
                prevented = true
            },
        })
        return prevented
    }
    return { ...exports, win, calls, navigate, debugger: contents.debugger }
}

function callback(result, host = 'CAPTCHA') {
    return `jsbridge://${host}/onVerifyCAPTCHA?p=${encodeURIComponent(JSON.stringify(result))}&mqq_tt=123#2`
}

test('parses MQQ callback parameters and normalized hostnames without truncating the payload', () => {
    const { parseSliderCaptchaResult } = fixture()
    const result = { result: '0', ticket: 'test+/%#中文', randstr: '@random+' }
    assert.equal(parseSliderCaptchaResult(callback(result)), 'test+/%#中文,@random+')
    assert.equal(parseSliderCaptchaResult(callback(result, 'captcha')), 'test+/%#中文,@random+')
})

test('ignores unrelated, malformed, cancelled and incomplete callbacks', () => {
    const { parseSliderCaptchaResult } = fixture()
    for (const url of [
        'invalid',
        'https://example.com',
        'jsbridge://CAPTCHA/onVerifyCAPTCHA?p=%broken#2',
        callback(null),
        callback({ ticket: 'ticket' }),
        callback({ ticket: '', randstr: 'random' }),
        callback({ ticket: 123, randstr: 'random' }),
        callback({ result: 1, ticket: 'ticket', randstr: 'random' }),
        callback({ ticket: 'ticket', randstr: 'random' }).replace('onVerifyCAPTCHA', 'other'),
    ]) {
        assert.equal(parseSliderCaptchaResult(url), undefined)
    }
})

test('sets consistent mobile browser settings before loading, with no preload or page injection', async () => {
    const { openSliderCaptcha, calls } = fixture()
    await openSliderCaptcha('https://ti.qq.com/safe/tools/captcha/sms-verify-login', () => {})
    assert.equal(calls[0][1].webPreferences.contextIsolation, true)
    assert.equal(calls[0][1].webPreferences.sandbox, true)
    assert.equal(calls[0][1].webPreferences.nodeIntegration, false)
    assert.equal(calls[0][1].webPreferences.preload, undefined)
    assert.equal(calls.at(-1)[0], 'load')
    const loads = calls.filter(([method]) => method === 'load')
    assert.deepEqual(
        loads.map(([, url]) => url),
        ['about:blank', 'https://ti.qq.com/safe/tools/captcha/sms-verify-login'],
    )
    assert.ok(calls.findIndex(([method]) => method === 'load') < calls.findIndex(([method]) => method === 'device'))
    const ua = calls.find(([method]) => method === 'Emulation.setUserAgentOverride')[1]
    assert.match(ua.userAgent, /Chrome\/142\.0\.7444\.175 Mobile/)
    assert.equal(ua.userAgent, calls.find(([method]) => method === 'ua')[1])
    assert.equal(ua.platform, 'Linux armv8l')
    assert.equal(ua.userAgentMetadata.platform, 'Android')
    assert.equal(ua.userAgentMetadata.mobile, true)
    assert.equal(calls.find(([method]) => method === 'device')[1].screenPosition, 'mobile')
    assert.equal(calls.find(([method]) => method === 'Emulation.setTouchEmulationEnabled')[1].maxTouchPoints, 5)
    assert.equal(calls.find(([method]) => method === 'Emulation.setEmitTouchEventsForMouse')[1].enabled, true)
    assert.equal(calls.find(([method]) => method === 'Target.setAutoAttach')[1].waitForDebuggerOnStart, true)
})

test('configures cross-process captcha iframes before resuming scripts, including nested targets', async () => {
    const context = fixture()
    await context.openSliderCaptcha('https://ti.qq.com/safe/tools/captcha/sms-verify-login', () => {})
    for (const sessionId of ['captcha-frame', 'nested-frame']) {
        context.debugger.emit('message', {}, 'Target.attachedToTarget', {
            sessionId,
            targetInfo: { type: 'iframe' },
        })
        await new Promise(setImmediate)
        const calls = context.calls.filter(([, , session]) => session === sessionId)
        assert.deepEqual(
            calls.map(([method]) => method),
            [
                'Emulation.setUserAgentOverride',
                'Emulation.setTouchEmulationEnabled',
                'Target.setAutoAttach',
                'Runtime.runIfWaitingForDebugger',
            ],
        )
        assert.equal(calls[0][1].userAgentMetadata.platform, 'Android')
        assert.equal(calls[2][1].waitForDebuggerOnStart, true)
    }
})

test('immediately resumes computation workers without applying iframe-only emulation', async () => {
    const context = fixture()
    await context.openSliderCaptcha('https://example.com', () => {})
    context.debugger.emit('message', {}, 'Target.attachedToTarget', {
        sessionId: 'worker',
        targetInfo: { type: 'worker' },
    })
    await new Promise(setImmediate)
    assert.deepEqual(
        context.calls.filter(([, , session]) => session === 'worker').map(([method]) => method),
        ['Runtime.runIfWaitingForDebugger'],
    )
})

test('keeps mouse-to-touch enabled without toggling it during iframe replacement', async () => {
    const context = fixture()
    await context.openSliderCaptcha('https://example.com', () => {})
    context.calls.length = 0
    context.debugger.emit('message', {}, 'Target.attachedToTarget', {
        sessionId: 'retry-frame',
        targetInfo: { type: 'iframe' },
    })
    await new Promise(setImmediate)
    assert.deepEqual(
        context.calls
            .filter(([method]) => method === 'Emulation.setEmitTouchEventsForMouse')
            .map(([, params]) => params.enabled),
        [],
    )
    context.calls.length = 0
    context.debugger.emit('message', {}, 'Target.detachedFromTarget', { sessionId: 'retry-frame' })
    await new Promise(setImmediate)
    assert.deepEqual(
        context.calls
            .filter(([method]) => method === 'Emulation.setEmitTouchEventsForMouse')
            .map(([, params]) => params.enabled),
        [],
    )
})

test('releases the retry iframe even if its configuration fails', async () => {
    const context = fixture({
        sendCommand(method, _, sessionId) {
            if (sessionId && method === 'Emulation.setUserAgentOverride') throw new Error('target setup failed')
        },
    })
    await context.openSliderCaptcha('https://example.com', () => {})
    context.debugger.emit('message', {}, 'Target.attachedToTarget', {
        sessionId: 'retry-frame',
        targetInfo: { type: 'iframe' },
    })
    await new Promise(setImmediate)
    assert.equal(
        context.calls.filter(
            ([method, , session]) => method === 'Runtime.runIfWaitingForDebugger' && session === 'retry-frame',
        ).length,
        1,
    )
    assert.equal(context.win.isDestroyed(), false)
})

test('bounds iframe debugger pauses instead of blocking retry input for seconds', async () => {
    const context = fixture({
        sendCommand(method, _, sessionId) {
            if (sessionId && method === 'Emulation.setUserAgentOverride') return new Promise(() => {})
        },
    })
    await context.openSliderCaptcha('https://example.com', () => {})
    context.debugger.emit('message', {}, 'Target.attachedToTarget', {
        sessionId: 'retry-frame',
        targetInfo: { type: 'iframe' },
    })
    await new Promise((resolve) => setTimeout(resolve, 350))
    assert.equal(
        context.calls.filter(
            ([method, , session]) => method === 'Runtime.runIfWaitingForDebugger' && session === 'retry-frame',
        ).length,
        1,
    )
    assert.equal(context.win.isDestroyed(), false)
})

test('intercepts iframe callbacks, submits once and closes only on a valid result', async () => {
    const { openSliderCaptcha, navigate, win } = fixture()
    const submitted = []
    await openSliderCaptcha('https://ti.qq.com/safe/tools/captcha/sms-verify-login', (ticket) => submitted.push(ticket))
    assert.equal(navigate('https://captcha.gtimg.com/TCaptcha.js'), false)
    assert.equal(navigate(callback({ ticket: '', randstr: '' })), true)
    assert.equal(win.isDestroyed(), false)
    assert.equal(navigate(callback({ ticket: 'ticket', randstr: 'random' }, 'captcha')), true)
    assert.deepEqual(submitted, ['ticket,random'])
    assert.equal(win.isDestroyed(), true)
    navigate(callback({ ticket: 'duplicate', randstr: 'random' }))
    assert.deepEqual(submitted, ['ticket,random'])
})

test('closes and reports setup failures after bootstrap without loading the remote page', async () => {
    const { openSliderCaptcha, win, calls } = fixture({ failCommand: 'Emulation.setUserAgentOverride' })
    await assert.rejects(
        openSliderCaptcha('https://example.com', () => {}),
        /emulation failed/,
    )
    assert.equal(win.isDestroyed(), true)
    assert.deepEqual(
        calls.filter(([method]) => method === 'load').map(([, url]) => url),
        ['about:blank'],
    )
})

test('handles a user close or a successful callback during an in-flight load', async () => {
    const { openSliderCaptcha } = fixture({
        load(win) {
            win.destroy()
            throw new Error('ERR_ABORTED')
        },
    })
    await openSliderCaptcha('https://example.com', () => {})
})
