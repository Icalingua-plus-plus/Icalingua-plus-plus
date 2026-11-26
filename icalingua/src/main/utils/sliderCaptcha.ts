import { newIcalinguaWindow } from '../../utils/IcalinguaWindow'

function isCaptchaCallback(url: URL): boolean {
    return (
        url.protocol === 'jsbridge:' && url.hostname.toLowerCase() === 'captcha' && url.pathname === '/onVerifyCAPTCHA'
    )
}

export function parseSliderCaptchaResult(url: string): string | undefined {
    try {
        // MQQ appends a callback id as a fragment, and can append other query parameters.
        const callback = new URL(url)
        if (!isCaptchaCallback(callback)) return
        const result = JSON.parse(callback.searchParams.get('p'))
        if (typeof result?.ticket !== 'string' || !result.ticket) return
        if (typeof result?.randstr !== 'string' || !result.randstr) return
        if (result.result !== undefined && String(result.result) !== '0') return
        return result.ticket + ',' + result.randstr
    } catch {
        // Ignore incomplete/cancelled callbacks without logging login credentials.
    }
}

export async function openSliderCaptcha(url: string, onVerified: (ticket: string) => void) {
    const win = newIcalinguaWindow({
        width: 393,
        height: 720,
        useContentSize: true,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        },
    })
    const contents = win.webContents
    let submitted = false
    contents.on('will-frame-navigate', (event) => {
        if (!isCaptchaCallback(new URL(event.url))) return
        event.preventDefault()
        const ticket = parseSliderCaptchaResult(event.url)
        if (!ticket || submitted) return
        submitted = true
        onVerified(ticket)
        if (!win.isDestroyed()) win.destroy()
    })

    try {
        // Electron 39 dereferences the main frame's native view in enableDeviceEmulation.
        // A newly created window can have no view yet, causing a native crash rather
        // than a catchable JS error. Commit a local document before touching the view.
        await win.loadURL('about:blank')
        if (win.isDestroyed()) return
        // Configure the browser before any remote script runs. A mobile UA alone leaves
        // desktop platform/client hints, screen metrics and mouse-only input behind.
        const chromeVersion = process.versions.chrome
        const userAgent =
            'Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) ' +
            `Version/4.0 Chrome/${chromeVersion} Mobile Safari/537.36 QQ/8.9.50.10650`
        contents.setUserAgent(userAgent)
        contents.enableDeviceEmulation({
            screenPosition: 'mobile',
            screenSize: { width: 393, height: 851 },
            viewPosition: { x: 0, y: 0 },
            deviceScaleFactor: 2.75,
            viewSize: { width: 0, height: 0 },
            scale: 1,
        })
        contents.debugger.attach('1.3')
        const userAgentOverride = {
            userAgent,
            platform: 'Linux armv8l',
            userAgentMetadata: {
                brands: [{ brand: 'Chromium', version: chromeVersion.split('.')[0] }],
                fullVersionList: [{ brand: 'Chromium', version: chromeVersion }],
                platform: 'Android',
                platformVersion: '13.0.0',
                architecture: 'arm',
                model: 'Pixel 7',
                mobile: true,
                bitness: '64',
                wow64: false,
            },
        }
        const autoAttach = {
            autoAttach: true,
            waitForDebuggerOnStart: true,
            flatten: true,
            // Chromium can pause workers created by an auto-attached iframe too.
            // Include them so their startup wait can always be released explicitly.
            filter: [{ type: 'iframe' }, { type: 'worker' }, { exclude: true }],
        }
        const configureTarget = async (sessionId?: string) => {
            await contents.debugger.sendCommand('Emulation.setUserAgentOverride', userAgentOverride, sessionId)
            await contents.debugger.sendCommand(
                'Emulation.setTouchEmulationEnabled',
                { enabled: true, maxTouchPoints: 5 },
                sessionId,
            )
            if (!sessionId) {
                await contents.debugger.sendCommand('Emulation.setEmitTouchEventsForMouse', {
                    enabled: true,
                    configuration: 'mobile',
                })
            }
            // Auto-attach is not recursive; each iframe can create more remote frames.
            await contents.debugger.sendCommand('Target.setAutoAttach', autoAttach, sessionId)
        }
        const frameSessions = new Set<string>()
        const reportFrameError = (error: Error) => {
            if (!win.isDestroyed()) console.error('Failed to configure captcha iframe', error)
        }
        contents.debugger.on('message', (_, method, params) => {
            if (method === 'Target.detachedFromTarget') {
                frameSessions.delete(params.sessionId)
                return
            }
            if (method === 'Target.attachedToTarget' && params.targetInfo.type === 'worker') {
                // Tencent waits only 500ms for its computation worker to become ready.
                // An excluded, paused worker makes it fall back to expensive synchronous
                // work in the challenge frame, freezing subsequent touch input.
                contents.debugger
                    .sendCommand('Runtime.runIfWaitingForDebugger', {}, params.sessionId)
                    .catch(reportFrameError)
                return
            }
            if (method !== 'Target.attachedToTarget' || params.targetInfo.type !== 'iframe') return
            const sessionId = params.sessionId as string
            frameSessions.add(sessionId)
            let resumed = false
            const resume = async () => {
                if (resumed || !frameSessions.has(sessionId) || win.isDestroyed()) return
                resumed = true
                await contents.debugger.sendCommand('Runtime.runIfWaitingForDebugger', {}, sessionId)
            }
            // A retry creates a new target too. Never leave it paused for seconds if
            // an emulation command stalls; the page must remain able to handle input.
            const resumeTimer = setTimeout(() => {
                resume().catch(reportFrameError)
            }, 300)
            configureTarget(sessionId)
                .catch(reportFrameError)
                .finally(() => {
                    clearTimeout(resumeTimer)
                    return resume()
                })
                .catch(reportFrameError)
        })
        await configureTarget()
        // MQQ sends its result through an iframe navigation. Receive it in the main
        // process so Image/iframe prototypes and the page's JS world stay untouched.
        await win.loadURL(url)
    } catch (error) {
        // A successful callback or a manual close can abort an in-flight load.
        if (win.isDestroyed()) return
        win.destroy()
        throw error
    }
    return win
}
