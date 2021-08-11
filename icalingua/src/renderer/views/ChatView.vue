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
					<a slot="reference">
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
			</el-aside>
			<el-main>
				<Multipane v-show="view !== 'kench'">
					<!-- main chat view -->
					<div :style="{ minWidth: '150px', width: '300px', maxWidth: '500px' }">
						<TheRoomsPanel
							:rooms="rooms"
							:selected="selectedRoom"
							:priority="priority"
							@chroom="chroom"
							v-show="view === 'chats'"
						/>

						<TheContactsPanel
							@dblclick="startChat"
							v-show="view === 'contacts'"
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
							@open-file="openImage"
							@pokefriend="pokeFriend"
							@stickers-panel="panel = panel === 'stickers' ? '' : 'stickers'"
							@download-image="downloadImage"
							@pokegroup="pokeGroup"
							@open-forward="openForward"
							@fetch-messages="fetchMessage"
						>
							<template v-slot:menu-icon>
								<i class="el-icon-more"></i>
							</template>
						</Room>
						<pre v-show="selectedRoomId===0&&sysInfo"
						     style="position: absolute;
						         right: 13px;
							     top: 0;
							     font-family: monospace;
							     color: rgb(156, 166, 175);
							 ">{{ sysInfo }}</pre>
						<div class="getting-history" v-if="historyCount">
							<div class="pace-activity"/>
							<span>
								正在获取历史消息... {{ historyCount }}
							</span>
							<el-button @click="stopFetchingHistory" size="mini">就要这么多</el-button>
						</div>
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
					</div>
				</Multipane>
				<div v-show="view === 'kench'">
					<div style="background-color: #5bcffa; height: 20vh"/>
					<div style="background-color: #f5abb9; height: 20vh"/>
					<div style="background-color: #ffffff; height: 20vh"/>
					<div style="background-color: #f5abb9; height: 20vh"/>
					<div style="background-color: #5bcffa; height: 20vh"/>
				</div>
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

<script lang="js">
import Room from '../components/vac-mod/ChatWindow/Room/Room'
import Stickers from '../components/Stickers'
import {Multipane, MultipaneResizer} from '../components/multipane'
import {defaultThemeStyles, cssThemeVars} from '../components/vac-mod/themes'
import path from 'path'
import {ipcRenderer} from 'electron'
import SideBarIcon from '../components/SideBarIcon.vue'
import TheRoomsPanel from '../components/TheRoomsPanel.vue'
import TheContactsPanel from '../components/TheContactsPanel.vue'
import ipc from '../utils/ipc'
import getAvatarUrl from '../../utils/getAvatarUrl'
import createRoom from '../../utils/createRoom'
import fs from 'fs'

export default {
	components: {
		Room,
		Stickers,
		SideBarIcon,
		TheRoomsPanel,
		TheContactsPanel,
		Multipane,
		MultipaneResizer,
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
			priority: 3,
			theme: 'default',
			menu: [],
			loading: false,
			isShutUp: false,
			sysInfo: '',
			historyCount: 0,
		}
	},
	async created() {
		//region set status
		const STORE_PATH = await ipc.getStorePath()
		const ver = await ipc.getVersion()
		//endregion
		//region listener
		document.addEventListener('dragover', (e) => {
			e.preventDefault()
			e.stopPropagation()
		})
		//keyboard
		document.addEventListener('keydown', (e) => {
			if (e.repeat) {
				return
			}
			else if (e.key === 'w' && e.ctrlKey === true) {
				window.close()
			}
			else if (e.key === 'Escape') {
				this.selectedRoomId = 0
				this.messages = []
				this.panel = ''
				ipc.setSelectedRoom(0, '')
				document.title = 'Icalingua'
			}
			else if (e.key === 'Tab') {
				let unreadRoom = this.rooms.find(
					(e) => e.unreadCount && e.priority >= this.priority,
				)
				if (!unreadRoom) unreadRoom = this.rooms.find((e) => e.unreadCount)
				if (unreadRoom) this.chroom(unreadRoom)
			}
		})
		window.flag = () => this.view = 'kench'
		//endregion

		if (fs.existsSync(path.join(STORE_PATH, 'font.ttf'))) {
			const myFonts = new FontFace(
				'font',
				`url(${path.join(STORE_PATH, 'font.ttf')})`,
				{},
			)
			myFonts.load().then(function (loadFace) {
				document.fonts.add(loadFace)
			})
		}

		ipcRenderer.on('closeLoading', () => this.loading = false)
		ipcRenderer.on('notify', (_, p) => this.$notify(p))
		ipcRenderer.on('addHistoryCount', (_, p) => this.historyCount += p)
		ipcRenderer.on('clearHistoryCount', () => this.historyCount = 0)
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
		ipcRenderer.on('revealMessage', (_, messageId) => {
			const message = this.messages.find((e) => e._id === messageId)
			if (message) {
				message.reveal = true
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
		ipcRenderer.on('setMessages', (_, p) => {
			this.messages = p
			this.messagesLoaded = false
		})
		ipcRenderer.on('startChat', (_, {id, name}) => this.startChat(id, name))
		ipcRenderer.on('closePanel', () => this.panel = '')
		ipcRenderer.on('gotOnlineData', (_, {online, nick, uin, priority, sysInfo}) => {
			this.offline = !online
			this.account = uin
			this.priority = priority
			this.username = nick
			this.sysInfo = (sysInfo ? (sysInfo + '\n\n') : '') + `Client ${ver}
Electron ${process.versions.electron}
Node ${process.versions.node}
Chromium ${process.versions.chrome}`
		})
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
		async fetchMessage(reset) {
			if (reset) {
				this.messagesLoaded = false
				this.messages = []
				this.selectedRoom.unreadCount = 0
				this.selectedRoom.at = false
			}
			const msgs2add = await ipc.fetchMessage(this.selectedRoom.roomId, this.messages.length)
			setTimeout(() => {
				if (msgs2add.length) {
					this.messages = [...msgs2add, ...this.messages]
				}
				else this.messagesLoaded = true
			}, 0)

			return msgs2add[msgs2add.length - 1]
		},
		openImage: ipc.downloadFileByMessageData,
		sendSticker(url) {
			if (this.selectedRoom)
				this.sendMessage({
					content: '',
					room: this.selectedRoom,
					imgpath: url,
				})
			this.$refs.room.focusTextarea()
		},
		reconnect() {
			this.reconnecting = true
			ipc.reLogin()
		},
		startChat(id, name) {
			let room = this.rooms.find((e) => e.roomId === id)
			const avatar = getAvatarUrl(id)

			if (room === undefined) {
				// create room
				room = createRoom(id, name, avatar)
				this.rooms = [room, ...this.rooms]
				ipc.addRoom(room)
			}
			this.chroom(room)
			this.view = 'chats'
		},
		async chroom(room) {
			if ((typeof room) === 'number')
				room = this.rooms.find(e => e.roomId === room)
			if (!room) return
			if (this.selectedRoom.roomId === room.roomId) return
			this.selectedRoom.at = false
			this.selectedRoomId = room.roomId
			ipc.setSelectedRoom(room.roomId, room.roomName)
			await this.fetchMessage(true)
		},
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
		openForward: ipc.openForward,
		stopFetchingHistory() {
			ipc.stopFetchMessage()
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

<style scoped lang="scss">
.getting-history {
	display: flex;
	padding: 5px;
	position: absolute;
	top: 75px;
	right: 10px;
	height: 30px;
	background-color: #F1F3F4;
	align-items: center;
	border-radius: 5px;

	.pace-activity {
		position: relative;
		bottom: unset;
		right: unset;
	}

	span {
		margin: 0 5px;
	}
}

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
