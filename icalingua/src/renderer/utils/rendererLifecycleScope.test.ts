import assert from 'node:assert/strict'
import test from 'node:test'
import type Vue from 'vue'

import { createRendererLifecycleScope } from './rendererLifecycleScope'

type Assert<T extends true> = T
type VueLifecycleScopeHasOnIpc = Assert<'onIpc' extends keyof NonNullable<Vue['lifecycleScope']> ? true : false>

type Listener = (event: unknown, ...args: any[]) => void

class FakeIpcRenderer {
    private listeners = new Map<string, Set<Listener>>()

    on(channel: string, listener: Listener) {
        if (!this.listeners.has(channel)) this.listeners.set(channel, new Set())
        this.listeners.get(channel).add(listener)
    }

    removeListener(channel: string, listener: Listener) {
        this.listeners.get(channel)?.delete(listener)
    }

    emit(channel: string, ...args: any[]) {
        for (const listener of this.listeners.get(channel) || []) listener({}, ...args)
    }
}

test('dispose removes only listeners owned by the scope', () => {
    const ipc = new FakeIpcRenderer()
    const scope = createRendererLifecycleScope(ipc)
    const target = new EventTarget()
    let ownedIpcCalls = 0
    let externalIpcCalls = 0
    let domCalls = 0
    let customCleanupCalls = 0

    const externalListener = () => externalIpcCalls++
    ipc.on('message', externalListener)
    scope.onIpc('message', () => ownedIpcCalls++)
    scope.onEvent(target, 'change', () => domCalls++)
    scope.addCleanup(() => customCleanupCalls++)

    ipc.emit('message')
    target.dispatchEvent(new Event('change'))
    scope.dispose()
    scope.dispose()
    ipc.emit('message')
    target.dispatchEvent(new Event('change'))

    assert.equal(ownedIpcCalls, 1)
    assert.equal(externalIpcCalls, 2)
    assert.equal(domCalls, 1)
    assert.equal(customCleanupCalls, 1)
})

test('dispose cancels pending timers', async () => {
    const scope = createRendererLifecycleScope(new FakeIpcRenderer())
    let timeoutCalls = 0
    let intervalCalls = 0

    scope.timeout(() => timeoutCalls++, 5)
    scope.interval(() => intervalCalls++, 5)
    scope.dispose()
    await new Promise((resolve) => setTimeout(resolve, 20))

    assert.equal(timeoutCalls, 0)
    assert.equal(intervalCalls, 0)
})

test('manual timer cancellation prevents callbacks', async () => {
    const scope = createRendererLifecycleScope(new FakeIpcRenderer())
    let calls = 0
    const timeout = scope.timeout(() => calls++, 5)
    const interval = scope.interval(() => calls++, 5)

    scope.cancelTimeout(timeout)
    scope.cancelInterval(interval)
    await new Promise((resolve) => setTimeout(resolve, 20))
    scope.dispose()

    assert.equal(calls, 0)
})
