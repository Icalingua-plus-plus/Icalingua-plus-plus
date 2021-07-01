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
	</div>
</template>

<script>
import Room from '../components/vac-mod/ChatWindow/Room/Room'
import Stickers from '../components/Stickers'
import Test from '../components/Test'
import IgnoreManage from '../components/IgnoreManage'
import {Multipane, MultipaneResizer} from '../components/multipane'
import {defaultThemeStyles, cssThemeVars} from '../components/vac-mod/themes'
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

let socketIo

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

//downloadManager https://qastack.cn/programming/11944932/how-to-download-a-file-with-node-js-without-using-third-party-libraries
const https = require('https')
const fs = require('fs')

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
			selectedRoomId: 0,
			account: 0,
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
			priority: 3,
			theme: 'default',
			menu: [],
			loading: false,
			isShutUp: false,
		}
	},
	async created() {
		//region db init
		this.account = await ipc.getUin()
		this.rooms = await ipc.getAllRooms()
		this.priority = await ipc.getPriority()
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

		// todo
		// if (db.get('socketIoSlave').value()) {
		// 	this.initSocketIo()
		// }


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
			if (roomId !== this.selectedRoomId) return
			this.messages = [...this.messages, message]
		})
		ipcRenderer.on('deleteMessage', (_, messageId) => {
			const message = this.messages.find((e) => e._id === messageId)
			if (message) {
				message.deleted = new Date()
				this.messages = [...this.messages]
			}
		})
		ipcRenderer.on('setOnline', () => this.reconnecting = this.offline = false)
		ipcRenderer.on('setOffline', (_, msg) => {
			this.offlineReason = msg
			this.offline = true
		})
		ipcRenderer.on('clearCurrentRoomUnread', () => this.selectedRoom.unreadCount = 0)
		ipcRenderer.on('updatePriority', (_, p) => this.priority = p)
		ipcRenderer.on('setAllRooms', (_, p) => this.rooms = p)
		console.log('加载完成')
	},
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
		},
		openImage: ipc.downloadFileByMessageData,
		deleteMessage(messageId) {
			//todo 以后右键菜单都移到主线程了，撤回消息也不用在这里处理了
			ipc.deleteMessage(this.selectedRoomId, messageId)
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
			ipc.reLogin()
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
			if (this.selectedRoom.roomId === room.roomId) return
			this.selectedRoom.at = false
			this.selectedRoomId = room.roomId
			ipc.setSelectedRoom(room.roomId, room.roomName)
			this.fetchMessage(true)
			this.updateAppMenu()
		},
		addToStickers(message) {
			ipc.download(message.file.url, String(new Date().getTime()), path.join(STORE_PATH, 'stickers'))
			this.panel = 'refresh'
			this.$nextTick(() => {
				this.panel = 'stickers'
			})
		},
		exit: ipc.exit,
		downloadImage: ipc.downloadImage,
		pokeGroup(uin) {
			const group = -this.selectedRoom.roomId
			ipc.sendGroupPoke(group, uin)
			this.$refs.room.focusTextarea()
		},
		pokeFriend() {
			if (this.selectedRoom.roomId > 0)
				ipc.sendGroupPoke(this.selectedRoom.roomId, this.selectedRoom.roomId)
			this.$refs.room.focusTextarea()
		},
		revealMessage(message) {
			message.reveal = true
			this.messages = [...this.messages]
			ipc.updateMessage(this.selectedRoom.roomId, message._id, {reveal: true})
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
		selectedRoom() {
			return this.rooms.find(e => e.roomId === this.selectedRoomId) || {roomId: 0}
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
