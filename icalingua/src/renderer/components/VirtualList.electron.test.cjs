const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

if (!process.versions.electron) {
    const { test } = require('node:test')
    const { spawnSync } = require('node:child_process')
    const os = require('node:os')
    test('virtualized panels keep DOM bounded and preserve interactions in Electron', () => {
        const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'icalingua-virtual-list-test-'))
        try {
            const env = { ...process.env, ICALINGUA_VIRTUAL_LIST_TEST_DATA: userData }
            delete env.ELECTRON_RUN_AS_NODE
            const result = spawnSync(require('electron'), ['--no-sandbox', __filename], {
                env,
                encoding: 'utf8',
                windowsHide: true,
                timeout: 60000,
            })
            assert.ifError(result.error)
            assert.equal(result.status, 0, result.stdout + result.stderr)
            assert.match(result.stdout, /Virtual list Electron integration passed/)
            console.log(result.stdout.trim())
        } finally {
            assert.equal(path.dirname(path.resolve(userData)), path.resolve(os.tmpdir()))
            fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
        }
    })
} else {
    const { app, BrowserWindow } = require('electron')
    app.setPath('userData', process.env.ICALINGUA_VIRTUAL_LIST_TEST_DATA)
    app.disableHardwareAcceleration()
    app.whenReady()
        .then(async () => {
            const window = new BrowserWindow({
                width: 900,
                height: 720,
                show: false,
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false,
                    backgroundThrottling: false,
                    offscreen: true,
                },
            })
            // Synthetic data only: prevent avatar or theme URLs from making network requests.
            window.webContents.session.webRequest.onBeforeRequest(
                { urls: ['http://*/*', 'https://*/*'] },
                (_, callback) => callback({ cancel: true }),
            )
            await window.loadURL('about:blank')
            const result = await window.webContents.executeJavaScript(
                `(${runRendererTests.toString()})(${JSON.stringify(__dirname)})`,
            )
            console.log('Virtual list Electron integration passed:', JSON.stringify(result))
            window.destroy()
            app.exit(0)
        })
        .catch((error) => {
            console.error(error)
            app.exit(1)
        })
}

async function runRendererTests(componentsDir) {
    const require = window.require('node:module').createRequire(componentsDir + '/VirtualList.electron.test.cjs')
    const assert = require('node:assert/strict')
    const fs = require('node:fs')
    const path = require('node:path')
    const ts = require('typescript')
    const compiler = require('vue-template-compiler')
    const sass = require('sass')
    const Vue = require('vue/dist/vue.common.js')
    Vue.config.productionTip = false
    Vue.config.devtools = false
    Vue.use(require('element-ui'))
    const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
    const errors = []
    Vue.config.errorHandler = (error) => errors.push(error.stack || String(error))
    window.addEventListener('error', (event) => errors.push(event.message))
    let activeObservers = 0
    const NativeResizeObserver = window.ResizeObserver
    window.ResizeObserver = class extends NativeResizeObserver {
        constructor(callback) {
            super(callback)
            this.active = true
            activeObservers++
        }
        disconnect() {
            super.disconnect()
            if (this.active) activeObservers--
            this.active = false
        }
    }
    function addStyle(css) {
        const style = document.createElement('style')
        style.textContent = css
        document.head.appendChild(style)
    }
    addStyle(fs.readFileSync(require.resolve('element-ui/lib/theme-chalk/index.css'), 'utf8'))
    addStyle('body{margin:0;font-family:Arial} :root{--chat-border-style:1px solid #ddd;--chat-border-color:#ddd}')
    const friends = Array.from({ length: 10000 }, (_, index) => ({
        uin: 100000 + index,
        nick: `Friend ${index}`,
        remark: index === 9999 ? 'LASTFRIEND' : `Friend ${index}`,
        sc: index === 9999 ? 'LASTFRIEND' : `FRIEND ${index}`,
    }))
    const groups = friends.map((friend, index) => ({
        group_id: friend.uin,
        group_name: index === 9999 ? 'LASTGROUP' : `Group ${index}`,
        group_remark: `Remark ${index}`,
        owner_id: 42,
        sc: index === 9999 ? 'LASTGROUP' : `GROUP ${index}`,
    }))
    const members = friends.map((friend, index) => ({
        user_id: friend.uin,
        group_id: 123,
        nickname: friend.nick,
        card: index === 9999 ? 'LASTMEMBER' : friend.nick,
        role: index === 0 ? 'owner' : index === 1 ? 'admin' : 'member',
    }))
    const calls = { searches: [], jumps: [], menus: [] }
    const listeners = new Map()
    const ipcRenderer = {
        async invoke(channel) {
            if (channel === 'getFriendsAndGroups')
                return { friends: [{ name: 'Friends', friends }], groups, friendsFallback: [] }
            if (channel === 'getGroupMembers') return members
            throw new Error(`Unexpected IPC: ${channel}`)
        },
        on(channel, callback) {
            if (!listeners.has(channel)) listeners.set(channel, new Set())
            listeners.get(channel).add(callback)
        },
        removeListener(channel, callback) {
            listeners.get(channel)?.delete(callback)
        },
    }
    function message(index, long = false) {
        return {
            _id: `message-${index}`,
            roomId: -123,
            senderId: 1,
            head_img: pixel,
            username: 'Sender',
            time: 1800000000000 - index * 1000,
            content: `Result ${index} <unsafe> needle ${long ? 'long message '.repeat(60) : ''}`,
        }
    }
    const ipc = {
        async searchMessages(...args) {
            calls.searches.push(args)
            const offset = typeof args[2] === 'number' ? args[2] : args[2].offset
            return Array.from({ length: Math.min(20, 45 - offset) }, (_, index) => message(offset + index))
        },
        gotoMessage(...args) {
            calls.jumps.push(args)
        },
        popupContactMenu(...args) {
            calls.menus.push(args)
        },
        popupGroupMemberMenu(...args) {
            calls.menus.push(args)
        },
    }
    const modules = new Map()
    function loadModule(file) {
        if (modules.has(file)) return modules.get(file).exports
        const module = { exports: {} }
        modules.set(file, module)
        const localRequire = (id) => {
            if (id === 'electron') return { ipcRenderer }
            if (id.endsWith('/ipc')) return ipc
            if (id.endsWith('/themes')) return {}
            if (id.endsWith('/getAvatarUrl')) return () => pixel
            if (id.startsWith('.')) {
                const target = path.resolve(path.dirname(file), id)
                if (target.endsWith('.vue')) return loadModule(target)
                if (fs.existsSync(target + '.ts')) return loadModule(target + '.ts')
            }
            return require(id)
        }
        let source = fs.readFileSync(file, 'utf8')
        let sfc
        if (file.endsWith('.vue')) {
            sfc = compiler.parseComponent(source)
            assert.deepEqual(compiler.compile(sfc.template.content).errors, [], file)
            source = sfc.script.content
        }
        const script = ts.transpileModule(source, {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
        }).outputText
        new Function('require', 'module', 'exports', script)(localRequire, module, module.exports)
        if (sfc) {
            Object.assign(module.exports.default, compiler.compileToFunctions(sfc.template.content))
            const style = sfc.styles[0]
            if (style) addStyle(style.lang === 'scss' ? sass.compileString(style.content).css : style.content)
        }
        return module.exports
    }
    const VirtualList = loadModule(path.join(componentsDir, 'VirtualList.vue')).default
    const Contacts = loadModule(path.join(componentsDir, 'TheContactsPanel.vue')).default
    const Members = loadModule(path.join(componentsDir, 'TheGroupMemberPanel.vue')).default
    const Search = loadModule(path.join(componentsDir, '../views/MessageSearchView.vue')).default
    async function settle(milliseconds = 100) {
        await Vue.nextTick()
        await new Promise((resolve) => setTimeout(resolve, milliseconds))
        await Vue.nextTick()
    }
    function mount(component, props = {}) {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const root = new Vue({ render: (h) => h(component, { ref: 'subject', props }) }).$mount(host)
        return {
            subject: root.$refs.subject,
            destroy() {
                root.$destroy()
                root.$el.remove()
            },
        }
    }
    function rowCount(subject) {
        const count = subject.$el.querySelectorAll('.virtual-list-row').length
        assert.ok(count > 0 && count < 60, `Expected a bounded visible range, got ${count}`)
        return count
    }
    async function bottom(subject) {
        const list = subject.$el.matches('.virtual-list') ? subject.$el : subject.$el.querySelector('.virtual-list')
        list.scrollTop = list.scrollHeight
        list.dispatchEvent(new Event('scroll'))
        await settle()
    }

    const contactMount = mount(Contacts, {
        chatGroups: [{ name: 'Category', rooms: [-1, ...friends.map((f) => f.uin)] }],
    })
    const contacts = contactMount.subject
    await settle()
    contacts.$el.querySelector('.contact-group-header').click()
    await settle()
    assert.ok(
        contacts.$el.querySelectorAll('.contact-entry-root').length < 60,
        'Opening must keep large groups virtual',
    )
    await settle(350)
    rowCount(contacts)
    const contactCount = contacts.$el.querySelectorAll('.contact-entry-root').length
    await bottom(contacts)
    assert.match(contacts.$el.textContent, /LASTFRIEND/)
    let clicked
    contacts.$on('dblclick', (...args) => {
        clicked = args
    })
    const lastContact = Array.from(contacts.$el.querySelectorAll('.contact-entry-root')).at(-1)
    lastContact.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    assert.deepEqual(clicked, [109999, 'LASTFRIEND'])
    contacts.searchContext = 'LASTFRIEND'
    await settle()
    assert.equal(contacts.$el.querySelectorAll('.contact-entry-root').length, 1)
    assert.equal(contacts.$refs.list.$el.scrollTop, 0)
    contacts.searchContext = ''
    contacts.activeName = 'groups'
    await settle()
    rowCount(contacts)
    await bottom(contacts)
    assert.match(contacts.$el.textContent, /LASTGROUP/)
    Array.from(contacts.$el.querySelectorAll('.contact-entry-root'))
        .at(-1)
        .dispatchEvent(new MouseEvent('contextmenu', { button: 2, bubbles: true }))
    assert.equal(calls.menus.at(-1)[3], 109999)
    assert.equal(calls.menus.at(-1)[4].ownerId, 42)
    contacts.activeName = 'categories'
    await settle()
    rowCount(contacts)
    assert.equal(contacts.contactRows[0].members.length, 10000, 'The category sentinel must be excluded')
    contacts.$el.querySelector('.contact-group-header').click()
    await settle()
    assert.ok(contacts.$el.querySelector('.contact-group-body').getBoundingClientRect().height > 0)
    assert.ok(
        contacts.$el.querySelectorAll('.contact-entry-root').length < 60,
        'Closing must keep large groups virtual',
    )
    await settle(350)
    assert.equal(contacts.$el.querySelectorAll('.contact-entry-root').length, 0)
    contactMount.destroy()

    const animationMount = mount(Contacts)
    const animatedContacts = animationMount.subject
    await settle()
    animatedContacts.friendsAll = Object.freeze([
        { name: 'Small', friends: friends.slice(0, 4) },
        { name: 'Next', friends: friends.slice(4, 5) },
    ])
    await settle()
    const header = animatedContacts.$el.querySelector('.contact-group-header')
    const body = animatedContacts.$el.querySelector('.contact-group-body')
    const nextHeader = animatedContacts.$el.querySelectorAll('.contact-group-header')[1]
    const closedTop = nextHeader.getBoundingClientRect().top
    header.click()
    await settle(90)
    const openingHeight = body.getBoundingClientRect().height
    assert.ok(
        openingHeight > 0 && openingHeight < 4 * 71,
        `Expected an intermediate opening height, got ${openingHeight}`,
    )
    await settle(350)
    assert.ok(Math.abs(body.getBoundingClientRect().height - 4 * 71) < 1)
    assert.ok(Math.abs(nextHeader.getBoundingClientRect().top - closedTop - 4 * 71) < 1)
    header.click()
    await settle(90)
    const closingHeight = body.getBoundingClientRect().height
    assert.ok(
        closingHeight > 0 && closingHeight < 4 * 71,
        `Expected an intermediate closing height, got ${closingHeight}`,
    )
    await settle(350)
    assert.equal(getComputedStyle(body).display, 'none')
    assert.equal(animatedContacts.$el.querySelectorAll('.contact-entry-root').length, 0)
    assert.ok(Math.abs(nextHeader.getBoundingClientRect().top - closedTop) < 1)
    header.click()
    await settle(60)
    header.click()
    await settle(60)
    header.click()
    await settle(400)
    assert.ok(Math.abs(body.getBoundingClientRect().height - 4 * 71) < 1, 'Rapid toggles must settle fully open')
    header.click()
    await Vue.nextTick()
    animationMount.destroy()

    const memberMount = mount(Members, { gin: 123, groupmemberShown: true })
    const memberPanel = memberMount.subject
    await settle()
    const memberCount = rowCount(memberPanel)
    assert.match(memberPanel.$el.textContent, /群主/)
    await bottom(memberPanel)
    assert.match(memberPanel.$el.textContent, /LASTMEMBER/)
    memberPanel.searchContext = 'LASTMEMBER'
    await settle()
    assert.equal(memberPanel.$el.querySelectorAll('.contact-entry-root').length, 1)
    memberPanel.$el
        .querySelector('.contact-entry-root')
        .dispatchEvent(new MouseEvent('contextmenu', { button: 2, bubbles: true }))
    assert.equal(calls.menus.at(-1)[3], 109999)
    assert.equal(calls.menus.at(-1)[4].groupId, 123)
    memberMount.destroy()

    const searchMount = mount(Search)
    const search = searchMount.subject
    search.messages = Array.from({ length: 10000 }, (_, index) => message(index, index % 2 === 0))
    search.noMore = true
    search.activeSearch = { roomId: 0, keyword: 'needle' }
    await settle()
    const searchCount = rowCount(search)
    assert.equal(search.$el.querySelector('unsafe'), null, 'Highlighting must escape message HTML')
    assert.equal(search.$el.querySelector('.highlight').textContent, 'needle')
    await bottom(search)
    assert.match(search.$el.textContent, /Result 9999/)
    Array.from(search.$el.querySelectorAll('.result-action button')).at(-1).click()
    assert.deepEqual(calls.jumps.at(-1), [-123, 'message-9999'])
    search.clearResults()
    search.keyword = 'needle'
    search.$el.style.height = '2400px'
    await search.doSearch()
    await settle()
    await settle()
    assert.equal(search.messages.length, 45, 'Underfilled viewports must load subsequent pages automatically')
    assert.equal(search.noMore, true)
    assert.deepEqual(
        calls.searches.map((args) => (typeof args[2] === 'number' ? args[2] : args[2].offset)),
        [0, 20, 40],
    )
    assert.equal(search.$el.querySelector('.virtual-list').scrollTop, 0)
    searchMount.destroy()

    const resizeMount = mount({
        components: { VirtualList },
        data: () => ({ height: 200 }),
        render(h) {
            return h('div', { style: { display: 'flex', height: this.height + 'px' } }, [
                h(VirtualList, {
                    ref: 'list',
                    props: { items: friends, itemKey: 'uin', estimatedItemHeight: 40 },
                    scopedSlots: { default: ({ item }) => h('div', { style: { height: '40px' } }, item.nick) },
                }),
            ])
        },
    })
    await settle()
    const smallCount = rowCount(resizeMount.subject)
    resizeMount.subject.height = 600
    await settle()
    assert.ok(rowCount(resizeMount.subject) > smallCount, 'Resizing must update the visible range')
    resizeMount.subject.$el.style.display = 'none'
    await settle()
    resizeMount.subject.$el.style.display = 'flex'
    await settle()
    rowCount(resizeMount.subject)
    resizeMount.subject.$refs.list.$el.dispatchEvent(new Event('scroll'))
    resizeMount.destroy()
    await settle()
    assert.equal(activeObservers, 0, 'All ResizeObservers must be disconnected on destruction')
    assert.equal(listeners.get('initMessageSearch').size, 0, 'Search IPC listeners must be removed')
    assert.deepEqual(errors, [])
    return { dataRows: 10000, mountedRows: { contacts: contactCount, members: memberCount, search: searchCount } }
}
