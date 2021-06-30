<template>
	<div ondragstart="return false;">
		<el-container>
			<!-- sidebar -->
			<el-aside width="65px" ondragstart="return false;">
				<!-- sidebar -->
				<el-popover
					placement="right-end"
					:title="username"
					trigger="hover"
					:content="`${account}`"
				>
					<a @click="appMenu" slot="reference">
						<el-avatar
							:src="`https://q1.qlogo.cn/g?b=qq&nk=${account}&s=640`"
						/>
					</a>
				</el-popover>
				<SideBarIcon
					icon="el-icon-chat-round"
					name="Chats"
					:selected="view === 'chats'"
					@click="view = 'chats'"
				/>
				<SideBarIcon
					icon="el-icon-user"
					name="Contacts"
					:selected="view === 'contacts'"
					@click="view = 'contacts'"
				/>
				<SideBarIcon
					v-if="nuist"
					icon="el-icon-school"
					name="NUIST"
					:selected="view === 'nuist'"
					@click="view = 'nuist'"
				/>
			</el-aside>
			<el-main>
				<Multipane v-show="view === 'chats'">
					<!-- main chat view -->
					<div :style="{ minWidth: '150px', width: '300px', maxWidth: '500px' }">
						<TheRoomsPanel
							:rooms="rooms"
							:selected="selectedRoom"
							:priority="priority"
							@chroom="chroom"
							@contextmenu="roomContext"
						/>
					</div>
					<MultipaneResizer/>
					<div
						style="flex: 1"
						:style="[cssVars]"
						class="vac-card-window"
					>
						<div class="pace-activity" v-show="loading"/>
						<Room
							ref="room"
							:current-user-id="account"
							:rooms="rooms"
							:messages="messages"
							height="100vh"
							:rooms-loaded="true"
							:messages-loaded="messagesLoaded"
							:show-audio="false"
							:show-reaction-emojis="false"
							:show-new-messages-divider="false"
							:load-first-room="false"
							:accepted-files="selectedRoom.roomId>0?'image/*':'*'"
							:message-actions="[]"
							:styles="styles"
							:single-room="true"
							:room-id="selectedRoom.roomId"
							:show-rooms-list="false"
							:is-mobile="false"
							:menu-actions="[]"
							:show-send-icon="true"
							:show-files="true"
							:show-emojis="true"
							:show-footer="!isShutUp"
							:loading-rooms="false"
							:text-formatting="true"
							:mongodb="true"
							@send-message="sendMessage"
							@fetch-messages="fetchMessage"
							@delete-message="deleteMessage"
							@open-file="openImage"
							@pokefriend="pokeFriend"
							@room-menu="roomContext(selectedRoom)"
							@add-to-stickers="addToStickers"
							@stickers-panel="panel = panel === 'stickers' ? '' : 'stickers'"
							@download-image="downloadImage"
							@pokegroup="pokeGroup"
							@reveal-message="revealMessage"
							@get-history="getHistory"
							@open-forward="openForward"
							@start-chat="startChat"
						>
							<template v-slot:menu-icon>
								<i class="el-icon-more"></i>
							</template>
						</Room>
					</div>
					<MultipaneResizer class="resize-next" v-show="panel"/>
					<div
						:style="{ minWidth: '300px', width: '300px', maxWidth: '500px' }"
						v-show="panel"
						class="panel"
					>
						<transition name="el-zoom-in-top">
							<Stickers
								v-if="panel === 'stickers'"
								@send="sendSticker"
								@close="panel = ''"
								@selectEmoji="
                  $refs.room.message += $event.data;
                  $refs.room.focusTextarea();
                "
							/>
						</transition>
						<IgnoreManage
							v-if="panel === 'ignore'"
							:ignoredChats="ignoredChats"
							@remove="rmIgnore"
							@close="panel = ''"
						/>
					</div>
				</Multipane>
				<el-row v-if="view === 'contacts'" type="flex" justify="center">
					<el-col :span="8">
						<TheContactsPanel @dblclick="startChat"/>
					</el-col>
				</el-row>
				<div v-show="view === 'kench'">
					<div style="background-color: #5bcffa; height: 20vh"/>
					<div style="background-color: #f5abb9; height: 20vh"/>
					<div style="background-color: #ffffff; height: 20vh"/>
					<div style="background-color: #f5abb9; height: 20vh"/>
					<div style="background-color: #5bcffa; height: 20vh"/>
				</div>
				<Test v-if="view === 'test'"/>
			</el-main>
		</el-container>
		<el-dialog
			title="You are offline"
			:visible.sync="offline"
			width="30%"
			:close-on-click-modal="false"
			:close-on-press-escape="false"
			:show-close="false"
		>
			<span>{{ offlineReason }}</span>
			<span slot="footer" class="dialog-footer">
        <el-button type="primary" @click="reconnect" :loading="reconnecting">
          Reconnect now
        </el-button>
      </span>
		</el-dialog>
		<el-dialog
			title="Aria2 config"
			:visible.sync="dialogAriaVisible"
			:show-close="false"
			:close-on-press-escape="false"
			:close-on-click-modal="false"
		>
			<el-form v-model="aria2" label-width="100px">
				<el-form-item label="enabled">
					<el-switch v-model="aria2.enabled"/>
				</el-form-item>
				<el-form-item label="host">
					<el-input v-model="aria2.host"/>
				</el-form-item>
				<el-form-item label="port">
					<el-input-number v-model.number="aria2.port"/>
				</el-form-item>
				<el-form-item label="secure">
					<el-switch v-model="aria2.secure"/>
				</el-form-item>
				<el-form-item label="secret">
					<el-input v-model="aria2.secret"/>
				</el-form-item>
				<el-form-item label="path">
					<el-input v-model="aria2.path"/>
				</el-form-item>
			</el-form>
			<div slot="footer" class="dialog-footer">
				<el-button type="primary" @click="closeAria">Close</el-button>
			</div>
		</el-dialog>
	</div>
</template>

<script>
import Room from '../components/vac-mod/ChatWindow/Room/Room'
import Stickers from '../components/Stickers'
import Test from '../components/Test'
import IgnoreManage from '../components/IgnoreManage'
import {Multipane, MultipaneResizer} from '../components/multipane'
import {defaultThemeStyles, cssThemeVars} from '../components/vac-mod/themes'
import Datastore from 'lowdb'
import FileSync from 'lowdb/adapters/FileSync'
import path from 'path'
import {
	clipboard,
	shell,
	ipcRenderer,
} from 'electron'
import SideBarIcon from '../components/SideBarIcon.vue'
import TheRoomsPanel from '../components/TheRoomsPanel.vue'
import TheContactsPanel from '../components/TheContactsPanel.vue'
import {io} from 'socket.io-client'
import ipc from '../utils/ipc'

const remote = require('@electron/remote')
const STORE_PATH = remote.getGlobal('STORE_PATH')

const Aria2 = require('aria2')

let db, aria, socketIo

//region copied code
//date format https://www.cnblogs.com/tugenhua0707/p/3776808.html
Date.prototype.format = function (fmt) {
	var o = {
		'M+': this.getMonth() + 1, //月份
		'd+': this.getDate(), //日
		'h+': this.getHours(), //小时
		'm+': this.getMinutes(), //分
		's+': this.getSeconds(), //秒
		'q+': Math.floor((this.getMonth() + 3) / 3), //季度
		S: this.getMilliseconds(), //毫秒
	}
	if (/(y+)/.test(fmt)) {
		fmt = fmt.replace(
			RegExp.$1,
			(this.getFullYear() + '').substr(4 - RegExp.$1.length),
		)
	}
	for (var k in o) {
		if (new RegExp('(' + k + ')').test(fmt)) {
			fmt = fmt.replace(
				RegExp.$1,
				RegExp.$1.length === 1 ? o[k] : ('00' + o[k]).substr(('' + o[k]).length),
			)
		}
	}
	return fmt
}

//download https://qastack.cn/programming/11944932/how-to-download-a-file-with-node-js-without-using-third-party-libraries
const https = require('https')
const fs = require('fs')
const download = function (url, dest, cb) {
	const file = fs.createWriteStream(dest)
	https
		.get(url, function (response) {
			response.pipe(file)
			file.on('finish', function () {
				file.close(cb) // close() is async, call cb after close completes.
			})
		})
		.on('error', function (err) {
			// Handle errors
			fs.unlink(dest) // Delete the file async. (But we don't check the result)
			if (cb) cb(err.message)
		})
}

//convertImgToBase64 https://blog.csdn.net/myf8520/article/details/107340712
function convertImgToBase64(url, callback, outputFormat) {
	var canvas = document.createElement('CANVAS'),
		ctx = canvas.getContext('2d'),
		img = new Image()
	img.crossOrigin = 'Anonymous'
	img.onload = function () {
		canvas.height = img.height
		canvas.width = img.width
		ctx.drawImage(img, 0, 0)
		var dataURL = canvas.toDataURL(outputFormat || 'image/png')
		callback.call(this, dataURL)
		canvas = null
	}
	img.src = url
}

//endregion

//onlineStatusTypes
const ONLINE_STATUS_TYPES = {
	Online: 11,
	AFK: 31,
	Hide: 41,
}

export default {
	components: {
		Room,
		Stickers,
		IgnoreManage,
		SideBarIcon,
		TheRoomsPanel,
		TheContactsPanel,
		Multipane,
		MultipaneResizer,
		Test,
	},
	data() {
		return {
			rooms: [],
			messages: [],
			selectedRoom: {roomId: 0},
			account: null,
			messagesLoaded: false,
			ignoredChats: [],
			panel: '',
			offline: false,
			offlineReason: '',
			reconnecting: false,
			styles: {
				container: {
					boxShadow: 'none',
				},
			},
			view: 'chats',
			username: '',
			darkTaskIcon: false,
			nuist: false,
			aria2: {
				enabled: false,
				host: '127.0.0.1',
				port: 6800,
				secure: false,
				secret: '',
				path: '/jsonrpc',
			},
			dialogAriaVisible: false,
			aria,
			priority: 3,
			theme: 'default',
			menu: [],
			loading: false,
			isShutUp: false,
			status: ONLINE_STATUS_TYPES.Online,
		}
	},
	async created() {
		//region db init
		this.account = await ipc.getUin()
		const adapter = new FileSync(
			path.join(STORE_PATH, `/chatdata${this.account}v2.json`),
			{
				serialize: (data) => JSON.stringify(data, null, false),
			},
		)
		db = Datastore(adapter)
		db.defaults({
			ignoredChats: [],
			darkTaskIcon: false,
			aria2: {
				enabled: false,
				host: '127.0.0.1',
				port: 6800,
				secure: false,
				secret: '',
				path: '/jsonrpc',
			},
			priority: 3,
		}).write()
		db.unset('rooms').unset('messages').write()
		this.rooms = await ipc.getAllRooms()
		this.priority = await ipc.getSetting('priority')
		this.darkTaskIcon = await ipc.getSetting('darkTaskIcon')
		this.ignoredChats = await ipc.getSetting('ignoredChats')
		this.aria2 = await ipc.getSetting('aria2')//todo
		this.status = await ipc.getSetting('account.onlineStatus')
		//endregion
		//region set status
		this.offline = !await ipc.isOnline()
		this.username = await ipc.getNick()

		//endregion
		//region listener
		document.addEventListener('dragover', (e) => {
			e.preventDefault()
			e.stopPropagation()
		})
		//keyboard
		document.addEventListener('keydown', (e) => {
			if (e.repeat) return
			if (e.key === 'w' && e.ctrlKey === true) {
				remote.getCurrentWindow().minimize()
			}
			else if (e.key === 'Tab') {
				let unreadRoom = this.rooms.find(
					(e) => e.unreadCount && e.priority >= this.priority,
				)
				if (!unreadRoom) unreadRoom = this.rooms.find((e) => e.unreadCount)
				if (unreadRoom) this.chroom(unreadRoom)
			}
		})
		ipcRenderer.on('openForward', (e, resId) => this.openForward(resId))
		ipcRenderer.on('openImage', (e, resId) => this.openImage(resId))
		ipcRenderer.on('downloadImage', (e, resId) => this.downloadImage(resId))
		window.setupSocketIoSlave = url => {
			if (url) {
				db.set('socketIoSlave', url).write()
				this.initSocketIo()
			}
			else {
				db.set('socketIoSlave', false).write()
				socketIo = null
			}
		}
		window.flag = () => this.view = 'kench'
		window.test = () => this.view = 'test'
		//endregion
		//region build menu
		const updatePriority = lev => {
			this.priority = lev
			ipc.setSetting('priority', lev)
			this.updateAppMenu()
		}
		this.menu = [
			new remote.MenuItem({
				label: 'Notification Priority',
				submenu: [
					{
						type: 'radio',
						label: '1',
						checked: this.priority === 1,
						click: () => updatePriority(1),
					},
					{
						type: 'radio',
						label: '2',
						checked: this.priority === 2,
						click: () => updatePriority(2),
					},
					{
						type: 'radio',
						label: '3',
						checked: this.priority === 3,
						click: () => updatePriority(3),
					},
					{
						type: 'radio',
						label: '4',
						checked: this.priority === 4,
						click: () => updatePriority(4),
					},
					{
						type: 'radio',
						label: '5',
						checked: this.priority === 5,
						click: () => updatePriority(5),
					},
				],
			}),
			[
				new remote.MenuItem({
					label: 'Status',
					submenu: [
						{
							type: 'radio',
							label: 'Online',
							checked: this.status === ONLINE_STATUS_TYPES.Online,
							click: () => (this.setOnlineStatus(ONLINE_STATUS_TYPES.Online)),
						},
						{
							type: 'radio',
							label: 'Away from keyboard',
							checked: this.status === ONLINE_STATUS_TYPES.AFK,
							click: () => (this.setOnlineStatus(ONLINE_STATUS_TYPES.AFK)),
						},
						{
							type: 'radio',
							label: 'Hide',
							checked: this.status === ONLINE_STATUS_TYPES.Hide,
							click: () => (this.setOnlineStatus(ONLINE_STATUS_TYPES.Hide)),
						},
					],
				}),
				new remote.MenuItem({
					label: 'Manage ignored chats',
					click: () => (this.panel = 'ignore'),
				}),
				new remote.MenuItem({
					label: 'Aria2 download options',
					click: () => (this.dialogAriaVisible = true),
				}),
				new remote.MenuItem({
					label: 'Auto login',
					type: 'checkbox',
					checked: await ipc.getSetting('account.autologin'),
					click: (menuItem) => {
						ipc.setSetting('account.autologin', menuItem.checked)
					},
				}),
			],
			[
				new remote.MenuItem({
					label: remote.app.getVersion(),
					enabled: false,
				}),
				new remote.MenuItem({
					label: 'GitHub',
					click: () => shell.openExternal('https://github.com/Clansty/electron-qq'),
				}),
				new remote.MenuItem({
					label: 'Reload',
					click: () => {
						location.reload()
					},
				}),
				new remote.MenuItem({
					label: 'Dev Tools',
					role: 'toggleDevTools',
				}),
				new remote.MenuItem({
					label: 'Quit',
					click: this.exit,
				}),
			],
		]
		this.updateAppMenu()

		if (fs.existsSync(path.join(STORE_PATH, 'font.ttf'))) {
			console.log('nya')
			const myFonts = new FontFace(
				'font',
				`url(${path.join(STORE_PATH, 'font.ttf')})`,
				{},
			)
			myFonts.load().then(function (loadFace) {
				document.fonts.add(loadFace)
			})
		}

		if (this.aria2.enabled) this.startAria()

		if (db.get('socketIoSlave').value()) {
			this.initSocketIo()
		}


		ipcRenderer.on('closeLoading', () => this.loading = false)
		ipcRenderer.on('notify', (_, p) => this.$notify(p))
		ipcRenderer.on('notifyError', (_, p) => this.$notify.error(p))
		ipcRenderer.on('notifySuccess', (_, p) => this.$notify.success(p))
		ipcRenderer.on('message', (_, p) => this.$message(p))
		ipcRenderer.on('messageError', (_, p) => this.$message.error(p))
		ipcRenderer.on('messageSuccess', (_, p) => this.$message.success(p))
		ipcRenderer.on('setShutUp', (_, p) => this.isShutUp = p)
		ipcRenderer.on('chroom', (_, p) => this.chroom(p))
		ipcRenderer.on('updateRoom', (_, room) => {
			this.rooms = [room, ...this.rooms.filter(item => item.roomId !== room.roomId)]
		})
		ipcRenderer.on('addMessage', (_, {roomId, message}) => {
			if (roomId !== this.selectedRoom.roomId) return
			this.messages = [...this.messages, message]
		})
	},
	//todo set selected room id
	methods: {
		async sendMessage({content, roomId, file, replyMessage, room, b64img, imgpath}) {
			this.loading = true
			if (!room && !roomId) {
				room = this.selectedRoom
				roomId = room.roomId
			}
			if (!room) room = this.rooms.find((e) => e.roomId === roomId)
			if (!roomId) roomId = room.roomId
			if (file) {
				if (file.type.includes('image')) {
					const b64 = Buffer.from(await file.blob.arrayBuffer()).toString('base64')
					b64img = `data:${file.type};base64,${b64}`
					file = null
				}
				else
					file = {
						type: file.type,
						size: file.size,
						path: file.path,
					}

			}
			ipc.sendMessage({content, roomId, file, replyMessage, room, b64img, imgpath})
		},
		fetchMessage(reset) {
			if (reset) {
				this.messagesLoaded = false
				this.messages = []
				this.selectedRoom.unreadCount = 0
				this.selectedRoom.at = false
			}
			ipc.fetchMessage(this.selectedRoom.roomId, this.messages.length)
				.then(msgs2add => {
					setTimeout(() => {
						if (msgs2add.length) {
							this.messages = [...msgs2add, ...this.messages]
						}
						else this.messagesLoaded = true
					}, 0)
				})
			this.updateTrayIcon()
		},
		async openImage(data) {
			if (data.action === 'download') {
				if (data.message.file.type.includes('image')) {
					this.downloadImage(data.message.file.url)
				}
				else {
					if (this.selectedRoom.roomId < 0 && data.message.file.fid) {
						const gfs = bot.acquireGfs(-this.selectedRoom.roomId)
						data.message.file.url = (await gfs.download(data.message.file.fid)).url
					}
					if (this.aria2.enabled && data.message.file.url.startsWith('http'))
						this.download(
							data.message.file.url,
							null,
							() => {
								this.$message('Pushed to Aria2 JSONRPC')
							},
							data.message.content,
						)
					else shell.openExternal(data.message.file.url)
				}
			}
		},
		async deleteMessage(messageId) {
			const message = this.messages.find((e) => e._id === messageId)
			const res = await bot.deleteMsg(messageId)
			console.log(res)
			if (!res.error) {
				message.deleted = new Date()
				this.messages = [...this.messages]
				storage.updateMessage(this.selectedRoom.roomId, messageId, {deleted: new Date()})
			}
			else {
				this.$notify.error({
					title: 'Failed to delete message',
					message: res.error.message,
				})
			}
		},
		friendRecall(data) {
			if (data.user_id == this.selectedRoom.roomId) {
				const message = this.messages.find((e) => e._id == data.message_id)
				if (message) {
					message.deleted = new Date()
					this.messages = [...this.messages]
				}
			}
			storage.updateMessage(data.user_id, data.message_id, {deleted: new Date()})
		},
		groupRecall(data) {
			if (-data.group_id == this.selectedRoom.roomId) {
				const message = this.messages.find((e) => e._id == data.message_id)
				if (message) {
					message.deleted = new Date()
					this.messages = [...this.messages]
				}
			}
			storage.updateMessage(-data.group_id, data.message_id, {deleted: new Date()})
		},
		sendSticker(url) {
			if (this.selectedRoom)
				this.sendMessage({
					content: '',
					room: this.selectedRoom,
					imgpath: url,
				})
			this.$refs.room.focusTextarea()
		},
		rmIgnore(chat) {
			console.log(chat)
			this.ignoredChats = this.ignoredChats.filter(
				(item) => item.id != chat.id,
			)
			db.set('ignoredChats', this.ignoredChats).write()
		},
		reconnect() {
			this.reconnecting = true
			ipc.login()
		},
		online() {
			this.reconnecting = this.offline = false
		},
		onOffline(data) {
			this.offlineReason = data.message
			console.log(data)
			this.offline = true
		},
		appMenu() {
			const menu = new remote.Menu()
			menu.append(this.menu[0])
			for (let i = 0; i < this.menu[1].length; i++)
				menu.append(this.menu[1][i])
			menu.append(
				new remote.MenuItem({
					type: 'separator',
				}),
			)
			for (let i = 0; i < this.menu[2].length; i++)
				menu.append(this.menu[2][i])
			menu.popup({window: remote.getCurrentWindow()})
		},
		roomContext(room, build) {
			const pintitle = room.index ? 'Unpin Chat' : 'Pin Chat'
			const updatePriority = (lev) => {
				room.priority = lev
				ipc.updateRoom(room.roomId, {priority: lev})
			}
			const menu = remote.Menu.buildFromTemplate([
				{
					label: 'Notification Priority',
					submenu: [
						{
							type: 'radio',
							label: '1',
							checked: room.priority === 1,
							click: () => updatePriority(1),
						},
						{
							type: 'radio',
							label: '2',
							checked: room.priority === 2,
							click: () => updatePriority(2),
						},
						{
							type: 'radio',
							label: '3',
							checked: room.priority === 3,
							click: () => updatePriority(3),
						},
						{
							type: 'radio',
							label: '4',
							checked: room.priority === 4,
							click: () => updatePriority(4),
						},
						{
							type: 'radio',
							label: '5',
							checked: room.priority === 5,
							click: () => updatePriority(5),
						},
					],
				},
				{
					label: pintitle,
					click: () => {
						if (room.index) room.index = 0
						else room.index = 1
						this.rooms = [...this.rooms]
						storage.updateRoom(room.roomId, room)
					},
				},
				{
					label: 'Delete Chat',
					click: () => {
						this.rooms = this.rooms.filter((item) => item != room)
						storage.removeRoom(room.roomId)
					},
				},
				{
					label: 'Ignore Chat',
					click: () => {
						this.ignoredChats.push({
							id: room.roomId,
							name: room.roomName,
						})
						this.rooms = this.rooms.filter((item) => item != room)
						storage.removeRoom(room.roomId)
						db.set('ignoredChats', this.ignoredChats).write()
					},
				},
				{
					label: 'Copy Name',
					click: () => {
						clipboard.writeText(room.roomName)
					},
				},
				{
					label: 'Copy ID',
					click: () => {
						clipboard.writeText(String(Math.abs(room.roomId)))
					},
				},
				{
					label: 'View Avatar',
					click: () => {
						ipcRenderer.send('openImage', room.avatar, false)
					},
				},
				{
					label: 'Download Avatar',
					click: () => {
						this.downloadImage(room.avatar)
					},
				},
				{
					label: 'Auto Download',
					submenu: [
						{
							type: 'checkbox',
							label: 'Files in this chat',
							checked: !!room.autoDownload,
							click: (menuItem) => {
								room.autoDownload = menuItem.checked
								storage.updateRoom(room.roomId, room)
							},
						},
						{
							label: 'Set download path',
							click: () => {
								const selection = remote.dialog.showOpenDialogSync(remote.getCurrentWindow(), {
									title: 'Select download path',
									properties: ['openDirectory'],
									defaultPath: room.downloadPath,
								})
								console.log(selection)
								if (selection && selection.length) {
									room.downloadPath = selection[0]
									storage.updateRoom(room.roomId, room)
								}
							},
						},
					],
				},
				{
					label: 'Get History',
					click: () => {
						this.getLatestHistory(room.roomId)
					},
				},
			])
			if (build) return menu
			menu.popup({window: remote.getCurrentWindow()})
		},
		friendPoke(data) {
			console.log(data)
			const roomId =
				data.operator_id == this.account ? data.user_id : data.operator_id
			const room = this.rooms.find((e) => e.roomId == roomId)
			if (room) {
				this.rooms = [room, ...this.rooms.filter((item) => item !== room)]
				room.utime = data.time * 1000
				let msg = ''
				if (data.operator_id != this.account) msg += room.roomName
				else msg += '你'
				msg += data.action
				if (data.operator_id == data.target_id) msg += '自己'
				else if (data.target_id != this.account) msg += room.roomName
				else msg += '你'
				if (data.suffix) msg += data.suffix
				room.lastMessage = {
					content: msg,
					username: null,
					timestamp: new Date().format('hh:mm'),
				}
				const message = {
					content: msg,
					senderId: 0,
					timestamp: new Date().format('hh:mm'),
					date: new Date().format('dd/MM/yyyy'),
					_id: data.time,
					system: true,
					time: data.time * 1000,
				}
				if (room === this.selectedRoom)
					this.messages = [...this.messages, message]
				storage.updateRoom(room.roomId, room)
				storage.addMessage(roomId, message)
			}
		},
		startChat(id, name) {
			var room = this.rooms.find((e) => e.roomId == id)
			const avatar =
				id < 0
					? `https://p.qlogo.cn/gh/${-id}/${-id}/0`
					: `https://q1.qlogo.cn/g?b=qq&nk=${id}&s=640`

			if (room === undefined) {
				// create room
				room = this.createRoom(id, name, avatar)
				this.rooms = [room, ...this.rooms]
				storage.addRoom(room)
			}
			this.chroom(room)
			this.view = 'chats'
		},
		chroom(room) {
			if ((typeof room) === 'number')
				room = this.rooms.find(e => e.roomId === room)
			if (!room) return
			if (this.selectedRoom === room) return
			this.selectedRoom.at = false
			this.selectedRoom = room
			this.updateTrayIcon()
			this.fetchMessage(true)
			this.updateAppMenu()
		},
		pokeFriend() {
			console.log('poke')
			if (this.selectedRoom.roomId > 0)
				bot.sendGroupPoke(this.selectedRoom.roomId, this.selectedRoom.roomId)
			this.$refs.room.focusTextarea()
		},
		addToStickers(message) {
			const downpath = path.join(
				STORE_PATH,
				'/stickers/',
				String(new Date().getTime()),
			)
			download(
				message.file.url.replace('http://', 'https://'),
				downpath,
				() => {
					this.$notify.success({
						title: 'Image Saved to stickers folder',
						message: downpath,
					})
					this.panel = 'refresh'
					this.$nextTick(() => {
						this.panel = 'stickers'
					})
				},
			)
		},
		getUnreadCount() {
			return this.rooms.filter((e) => {
				return e.unreadCount && e.priority >= this.priority
			}).length
		},
		clearCurrentRoomUnread() {
			this.selectedRoom.unreadCount = 0
			this.updateTrayIcon()
		},
		updateTrayIcon() {
			let p
			const unread = this.getUnreadCount()
			const title = this.selectedRoom.roomName
				? this.selectedRoom.roomName
				: 'Electron QQ'
			if (unread) {
				p = path.join(
					__static,
					this.darkTaskIcon ? 'darknewmsg.png' : 'newmsg.png',
				)
				const newMsgRoom = this.rooms.find(
					(e) => e.unreadCount && e.priority >= this.priority,
				)
				const extra = newMsgRoom ? (' : ' + newMsgRoom.roomName) : ''
				document.title = `(${unread}${extra}) ${title}`
			}
			else {
				p = path.join(__static, this.darkTaskIcon ? 'dark.png' : '256x256.png')
				document.title = title
			}
			if (socketIo) socketIo.emit('qqCount', unread)
			// this.tray.setImage(p);
			// remote.app.setBadgeCount(unread);
		},
		closeAria() {
			this.dialogAriaVisible = false
			db.set('aria2', this.aria2).write()
			if (this.aria2.enabled) this.startAria()
		},
		startAria() {
			this.aria = new Aria2(this.aria2)
			this.aria
				.open()
				.then(this.$message('Aria2 RPC connected'))
				.catch((err) => {
					console.log(err)
					this.$message('Aria2 failed')
				})
		},
		download(url, dest, cb, out, dir) {
			if (this.aria2.enabled) {
				const opt = {}
				if (dir) opt.dir = dir
				if (out) opt.out = out
				else if (dest) {
					opt.dir = path.dirname(dest)
					opt.out = path.basename(dest)
				}
				this.aria
					.call('aria2.addUri', [url], opt)
					.then(cb)
					.catch((err) => {
						console.log(err)
						this.$message('Aria2 failed')
					})
			}
			else download(url, dest ? dest : path.join(dir, cb), cb)
		},
		exit: ipc.exit,
		downloadImage(url) {
			console.log(url)
			const downdir = remote.app.getPath('downloads')
			const downpath = path.join(
				downdir,
				'QQ_Image_' + new Date().getTime() + '.jpg',
			)
			this.download(url.replace('http://', 'https://'), downpath, () => {
				this.$notify.success({
					title: 'Image Saved',
					message: downpath,
				})
			})
		},
		async groupPoke(data) {
			console.log(data)
			const room = this.rooms.find((e) => e.roomId == -data.group_id)
			if (room) {
				this.rooms = [room, ...this.rooms.filter((item) => item !== room)]
				room.utime = data.time * 1000
				let operator = (
					await bot.getGroupMemberInfo(data.group_id, data.operator_id, false)
				).data
				operator = operator.card ? operator.card : operator.nickname
				let user = (
					await bot.getGroupMemberInfo(data.group_id, data.user_id, false)
				).data
				user = user.card ? user.card : user.nickname
				let msg = ''
				if (data.operator_id != this.account) msg += operator
				else msg += '你'
				msg += data.action
				if (data.user_id != this.account) msg += user
				else if (data.operator_id == this.account) msg += '自己'
				else msg += '你'
				if (data.suffix) msg += data.suffix
				room.lastMessage = {
					content: msg,
					username: null,
					timestamp: new Date().format('hh:mm'),
				}
				const message = {
					content: msg,
					senderId: 0,
					timestamp: new Date().format('hh:mm'),
					date: new Date().format('dd/MM/yyyy'),
					_id: data.time,
					system: true,
					time: data.time * 1000,
				}
				if (room === this.selectedRoom)
					this.messages = [...this.messages, message]
				storage.updateRoom(room.roomId, room)
				storage.addMessage(room.roomId, message)
			}
		},
		pokeGroup(uin) {
			const group = -this.selectedRoom.roomId
			bot.sendGroupPoke(group, uin)
			this.$refs.room.focusTextarea()
		},
		revealMessage(message) {
			message.reveal = true
			this.messages = [...this.messages]
			storage.updateMessage(this.selectedRoom.roomId, message._id, {reveal: true})
		},
		updateAppMenu() {
			const menu = remote.Menu.buildFromTemplate([
				{
					label: 'Electron QQ',
					submenu: this.menu[2],
				},
				this.menu[0],
				{
					label: 'Options',
					submenu: this.menu[1],
				},
			])
			if (this.selectedRoom)
				menu.append(
					new remote.MenuItem({
						label: this.selectedRoom.roomName,
						submenu: this.roomContext(this.selectedRoom, true),
					}),
				)
			remote.Menu.setApplicationMenu(menu)
		},
		async getHistory(message, roomId = this.selectedRoom.roomId) {
			const messages = []
			while (true) {
				const history = await bot.getChatHistory(message._id)
				console.log(history)
				if (history.error) {
					console.log(history.error)
					this.$message.error('错误：' + history.error.message)
					break
				}
				if (history.data.length < 2) break
				const newMsgs = []
				for (let i = 0; i < history.data.length; i++) {
					const data = history.data[i]
					const message = {
						senderId: data.sender.user_id,
						username: data.group_id
							? data.anonymous
								? data.anonymous.name
								: data.sender.card || data.sender.nickname
							: data.sender.remark || data.sender.nickname,
						content: '',
						timestamp: new Date(data.time * 1000).format('hh:mm'),
						date: new Date(data.time * 1000).format('dd/MM/yyyy'),
						_id: data.message_id,
						time: data.time * 1000,
					}
					await this.processMessage(
						data.message,
						message,
						{},
						roomId,
					)
					messages.push(message)
					newMsgs.push(message)
				}
				message = newMsgs[0]
				const firstOwnMsg = roomId < 0 ?
					newMsgs[0] : //群的话只要第一条消息就行
					newMsgs.find(e => e.senderId == this.account)
				if (!firstOwnMsg || await storage.getMessage(roomId, firstOwnMsg._id)) break
			}
			console.log(messages)
			this.$message.success(`已拉取 ${messages.length} 条消息`)
			storage.updateMessage(roomId, message._id, {historyGot: true})
			await storage.addMessages(roomId, messages)
			if (roomId === this.selectedRoom.roomId)
				storage.fetchMessages(roomId, 0, this.messages.length)
					.then(msgs2add => setTimeout(() => {
						console.log('ok')
						this.messages = msgs2add
						this.fetchMessage()
					}, 0))
		},
		getLatestHistory(roomId) {
			let buffer
			let uid = roomId
			if (roomId < 0) {
				buffer = Buffer.alloc(21)
				uid = -uid
			}
			else buffer = Buffer.alloc(17)
			buffer.writeUInt32BE(uid, 0)
			this.getHistory({
				_id: buffer.toString('base64'),
			}, roomId)
		},
		async openForward(resId) {
			const history = await bot.getForwardMsg(resId)
			console.log(history)
			if (history.error) {
				console.log(history.error)
				return
			}
			const messages = []
			for (let i = 0; i < history.data.length; i++) {
				const data = history.data[i]
				const message = {
					senderId: data.user_id,
					username: data.nickname,
					content: '',
					timestamp: new Date(data.time * 1000).format('hh:mm'),
					date: new Date(data.time * 1000).format('dd/MM/yyyy'),
					_id: i,
					time: data.time * 1000,
				}
				await this.processMessage(
					data.message,
					message,
					{},
					this.selectedRoom.roomId,
				)
				messages.push(message)
			}
			const size = remote.screen.getPrimaryDisplay().size
			let width = size.width - 300
			if (width > 1440) width = 900
			const win = new remote.BrowserWindow({
				height: size.height - 200,
				width,
				autoHideMenuBar: true,
				webPreferences: {
					nodeIntegration: true,
					enableRemoteModule: true,
					webSecurity: false,
					contextIsolation: false,
				},
			})
			const winURL =
				process.env.NODE_ENV === 'development'
					? `http://localhost:9080`
					: `file://${__dirname}/index.html`
			win.loadURL(winURL + '#/history')
			win.webContents.on('did-finish-load', function () {
				win.webContents.send(
					'loadMessages',
					messages,
					remote.getCurrentWindow().id,
				)
			})
		},
		initSocketIo() {
			socketIo = new io(db.get('socketIoSlave').value(), {transports: ['websocket']})
			console.log(socketIo)
		},
		setOnlineStatus(status) {
			bot.setOnlineStatus(status)
				.then(() => {
					this.status = status
					this.updateAppMenu()
					ipc.setSetting('account.onlineStatus', status)
				})
				.catch((res) => console.log(res))
		},
	},
	computed: {
		cssVars() {
			const defaultStyles = defaultThemeStyles['light']
			const customStyles = {}

			Object.keys(defaultStyles).map((key) => {
				customStyles[key] = {
					...defaultStyles[key],
					...(this.styles[key] || {}),
				}
			})

			return cssThemeVars(customStyles)
		},
	},
}
</script>

<style scoped>
.el-main {
	padding: 0;
	height: 100vh;
}

.el-aside {
	background-color: #303133;
	color: #eee;
	text-align: center;
	padding-top: 15px;
	-webkit-user-select: none;
}

.el-avatar {
	cursor: pointer;
}

main div {
	height: 100vh;
	overflow: hidden;
}

@keyframes pace-spinner {
	0% {
		transform: rotate(0deg);
	}
	100% {
		transform: rotate(360deg);
	}
}

.pace-activity {
	display: block;
	position: absolute;
	z-index: 2000;
	bottom: 66px;
	right: 15px;
	width: 14px;
	height: 14px;
	border: solid 2px transparent;
	border-top-color: #29d;
	border-left-color: #29d;
	border-radius: 10px;
	animation: pace-spinner 400ms linear infinite;
}

@media screen and (max-width: 1200px) {
	.resize-next {
		display: none
	}

	.panel {
		position: absolute;
		height: 60vh;
		bottom: 70px;
		right: 15px;
		border-radius: 10px;
		border: solid #DCDFE6 2px;
	}
}
</style>

<style lang="scss">
@import "../components/vac-mod/styles/index.scss";

.vac-card-window {
	display: block;
	background: var(--chat-content-bg-color);
	color: var(--chat-color);
	overflow-wrap: break-word;
	position: relative;
	white-space: normal;
	border: var(--chat-container-border);
	border-radius: var(--chat-container-border-radius);
	box-shadow: var(--chat-container-box-shadow);
	-webkit-tap-highlight-color: transparent;

	* {
		font-family: inherit;
	}

	a {
		color: #0d579c;
		font-weight: 500;
	}

	.vac-chat-container {
		height: 100%;
		display: flex;

		input {
			min-width: 10px;
		}

		textarea,
		input[type="text"],
		input[type="search"] {
			-webkit-appearance: none;
		}
	}
}
</style>
