<template>
	<div ondragstart="return false;">
		<el-container>
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
					:selected="view == 'chats'"
					@click="view = 'chats'"
				/>
				<SideBarIcon
					icon="el-icon-user"
					name="Contacts"
					:selected="view == 'contacts'"
					@click="view = 'contacts'"
				/>
			</el-aside>
			<el-main>
				<el-row v-show="view == 'chats'">
					<!-- main chat view -->
					<el-col :span="5" ondragstart="return false;" class="nodrag">
						<TheRoomsPanel
							:rooms="rooms"
							:selected="selectedRoom"
							:mute-all-groups="muteAllGroups"
							@chroom="chroom"
							@contextmenu="roomContext"
						/>
					</el-col>
					<el-col :span="panel ? 13 : 19">
						<div class="el-loading-spinner"></div>
						<chat-window
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
							accepted-files="image/*"
							:message-actions="[]"
							:styles="styles"
							:single-room="true"
							:room-id="selectedRoom.roomId"
							@send-message="sendMessage"
							@fetch-messages="fetchMessage"
							@delete-message="deleteMessage"
							@open-file="openImage"
							@pokefriend="pokefriend"
							@room-menu="roomContext(selectedRoom)"
						>
							<template v-slot:menu-icon>
								<i class="el-icon-more"></i>
							</template>
						</chat-window>
					</el-col>
					<el-col
						:span="6"
						ondragstart="return false;"
						class="nodrag"
						v-show="panel"
					>
						<transition name="el-zoom-in-top">
							<Stickers
								v-if="panel == 'stickers'"
								@send="sendSticker"
								@close="panel = ''"
							/>
						</transition>
						<IgnoreManage
							v-show="panel == 'ignore'"
							:ignoredChats="ignoredChats"
							@remove="rmIgnore"
							@close="panel = 'stickers'"
						/>
					</el-col>
				</el-row>
				<el-row v-if="view == 'contacts'" type="flex" justify="center">
					<el-col :span="8" ondragstart="return false;" class="nodrag">
						<TheContactsPanel @dblclick="startChat" />
					</el-col>
				</el-row>
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
	import ChatWindow from '@/components/vac-mod/ChatWindow/index'
	import Stickers from '@/components/Stickers'
	import IgnoreManage from '@/components/IgnoreManage'

	//lowdb
	import Datastore from 'lowdb'
	import FileSync from 'lowdb/adapters/FileSync'
	import path from 'path'
	import { remote, clipboard, nativeImage, shell } from 'electron'
	import { WindowsStoreAutoLaunch } from 'electron-winstore-auto-launch';
	import SideBarIcon from '../components/SideBarIcon.vue'
	import TheRoomsPanel from '../components/TheRoomsPanel.vue'
	import TheContactsPanel from '../components/TheContactsPanel.vue'
	const STORE_PATH = remote.app.getPath('userData')
	const glodb = remote.getGlobal("glodb")

	let db
	//oicq
	const bot = remote.getGlobal("bot")

	//date format https://www.cnblogs.com/tugenhua0707/p/3776808.html
	Date.prototype.format = function (fmt) {
		var o = {
			"M+": this.getMonth() + 1,                 //月份 
			"d+": this.getDate(),                    //日 
			"h+": this.getHours(),                   //小时 
			"m+": this.getMinutes(),                 //分 
			"s+": this.getSeconds(),                 //秒 
			"q+": Math.floor((this.getMonth() + 3) / 3), //季度 
			"S": this.getMilliseconds()             //毫秒 
		};
		if (/(y+)/.test(fmt)) {
			fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
		}
		for (var k in o) {
			if (new RegExp("(" + k + ")").test(fmt)) {
				fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
			}
		}
		return fmt;
	}

	//download https://qastack.cn/programming/11944932/how-to-download-a-file-with-node-js-without-using-third-party-libraries
	const https = require('https');
	const fs = require('fs');
	const download = function (url, dest, cb) {
		const file = fs.createWriteStream(dest);
		https.get(url, function (response) {
			response.pipe(file);
			file.on('finish', function () {
				file.close(cb);  // close() is async, call cb after close completes.
			});
		}).on('error', function (err) { // Handle errors
			fs.unlink(dest); // Delete the file async. (But we don't check the result)
			if (cb) cb(err.message);
		});
	};

	//convertImgToBase64 https://blog.csdn.net/myf8520/article/details/107340712
	function convertImgToBase64(url, callback, outputFormat) {
		var canvas = document.createElement('CANVAS'),
			ctx = canvas.getContext('2d'),
			img = new Image;
		img.crossOrigin = 'Anonymous';
		img.onload = function () {
			canvas.height = img.height;
			canvas.width = img.width;
			ctx.drawImage(img, 0, 0);
			var dataURL = canvas.toDataURL(outputFormat || 'image/jpeg');
			callback.call(this, dataURL);
			canvas = null;
		};
		img.src = url;
	}

	export default {
		components: {
			ChatWindow,
			Stickers,
			IgnoreManage,
			SideBarIcon,
			TheRoomsPanel,
			TheContactsPanel
		},
		data() {
			return {
				rooms: [],
				messages: [],
				selectedRoom: { roomId: 0 },
				muteAllGroups: false,
				dndMenuItem: null,
				dnd: false,
				tray: null,
				account: null,
				messagesLoaded: false,
				ignoredChats: [],
				panel: '',
				offline: false,
				offlineReason: "",
				reconnecting: false,
				styles: {
					container: {
						boxShadow: 'none'
					}
				},
				view: 'chats',
				username: '',

			}
		},
		created() {
			this.account = glodb.get('account').value().username
			const adapter = new FileSync(path.join(STORE_PATH, `/chatdata${this.account}.json`))
			db = Datastore(adapter)
			db.defaults({
				rooms: [],
				messages: {},
				muteAllGroups: false,
				dnd: false,
				ignoredChats: []
			})
				.write()
			this.rooms = db.get("rooms").value()
			this.muteAllGroups = db.get("muteAllGroups").value()
			this.dnd = db.get("dnd").value()
			this.ignoredChats = db.get('ignoredChats').value()
			this.dndMenuItem = new remote.MenuItem({
				label: 'Disable notifications', type: 'checkbox',
				checked: this.dnd,
				click: (menuItem, _browserWindow, _event) => {
					this.dnd = menuItem.checked
					db.set("dnd", menuItem.checked).write()
				}
			})

			if (process.env.NODE_ENV === 'development')
				document.title = "[DEBUG] Electron QQ"
			if (process.env.NYA) {
				document.title = "[DEBUG:UI] Electron QQ"
			}
			else {
				this.offline = !bot.getStatus().data.online
				this.username = bot.getLoginInfo().data.nickname
				this.tray = remote.getGlobal('tray')
				this.tray.setToolTip('Electron QQ')
				this.tray.setContextMenu(remote.Menu.buildFromTemplate([
					{
						label: 'Open', type: 'normal', click: () => {
							const window = remote.getCurrentWindow()
							window.show()
							window.focus()
						}
					},
					this.dndMenuItem,
					{ label: 'Exit', type: 'normal', click: () => { remote.getCurrentWindow().destroy() } }
				]))
				this.tray.on("click", () => {
					const window = remote.getCurrentWindow()
					window.show()
					window.focus()
				})
			}

			window.addEventListener('paste', (event) => {
				const nim = clipboard.readImage()
				if (!nim.isEmpty() && this.selectedRoom)
					this.sendMessage({
						content: "",
						room: this.selectedRoom,
						b64img: nim.toDataURL()
					})
			});

			//drag and drop https://www.geeksforgeeks.org/drag-and-drop-files-in-electronjs/
			document.addEventListener('drop', (event) => {
				event.preventDefault();
				event.stopPropagation();
				for (const f of event.dataTransfer.files) {
					// Using the path attribute to get absolute file path 
					const index = f.path.lastIndexOf(".");
					const ext = f.path.substr(index + 1).toLowerCase();
					if (['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp', 'svg', 'tiff'].includes(ext) && this.selectedRoom) {
						this.sendMessage({
							content: "",
							room: this.selectedRoom,
							imgpath: f.path
						})
					}
				}
			});

			document.addEventListener('dragover', (e) => {
				e.preventDefault();
				e.stopPropagation();
			});

			bot.on("message", this.onQQMessage);
			bot.on("notice.friend.recall", this.friendRecall)
			bot.on("notice.group.recall", this.groupRecall)
			bot.on('system.online', this.online)
			bot.on('system.offline', this.onOffline)
			bot.on('notice.friend.poke', this.friendpoke)
		},
		methods: {
			async sendMessage({ content, roomId, file, replyMessage, room, b64img, imgpath }) {
				if (!roomId)
					roomId = room.roomId
				const sendchain = async () => {
					let data
					if (roomId > 0)
						data = (await bot.sendPrivateMsg(roomId, chain, true))
					else
						data = (await bot.sendGroupMsg(-roomId, chain, true))

					if (data.error) {
						this.$notify.error({
							title: 'Failed to send',
							message: data.error.message
						});
						return
					}
					if (roomId > 0) {
						if (!room)
							room = this.rooms.find(e => e.roomId == roomId)
						room.lastMessage = {
							content,
							timestamp: new Date().format("hh:mm")
						}
						this.rooms = [room, ...this.rooms.filter(item => item !== room)];
						//bring the room first
						if (file || b64img || imgpath)
							room.lastMessage.content += "[Image]"

						message._id = data.data.message_id
						this.messages = [...this.messages, message]
						db.get('messages.' + roomId).push(message).write()
						db.set("rooms", this.rooms).write()
					}
				}

				const message = {
					senderId: this.account,
					username: "You",
					content,
					timestamp: new Date().format("hh:mm"),
					date: new Date().format("dd/MM/yyyy"),
				}

				const chain = []

				if (replyMessage) {
					message.replyMessage = {
						_id: replyMessage._id,
						content: replyMessage.username + ": " + replyMessage.content
					}
					if (replyMessage.file) {
						message.replyMessage.file = replyMessage.file
					}

					chain.push({
						type: "reply",
						data: {
							id: replyMessage._id
						}
					})
				}
				if (content)
					chain.push({
						"type": "text",
						"data": {
							"text": content
						}
					})
				if (b64img) {
					chain.push(
						{
							"type": "image",
							"data": {
								"file": "base64://" + b64img.replace(/^data:.+;base64,/, '')
							}
						}
					)
					message.file = {
						type: "image/jpeg",
						url: b64img
					}
				}
				if (imgpath) {
					chain.push(
						{
							"type": "image",
							"data": {
								"file": imgpath
							}
						}
					)
					message.file = {
						type: "image/jpeg",
						url: imgpath.replace(/\\/g, '/')
					}
				}
				if (file) {
					const reader = new FileReader();
					reader.readAsDataURL(file.blob);
					reader.onload = function () {
						const b64 = reader.result.replace(/^data:.+;base64,/, '');
						chain.push(
							{
								"type": "image",
								"data": {
									"file": "base64://" + b64
								}
							}
						)
						message.file = {
							url: reader.result,
							size: file.size,
							type: file.type
						}
						sendchain()
					} //now support image only
				}
				else {
					sendchain()
				}

			},

			fetchMessage(data) {
				if (data.options) {
					this.panel = 'stickers'
					this.messagesLoaded = false
					this.messages = []
					data.room.unreadCount = 0
					this.selectedRoom = data.room
					db.set("rooms", this.rooms).write()
					const muted = (data.room.roomId < 0 && this.muteAllGroups && !data.room.unmute) ||
						(data.room.roomId < 0 && !this.muteAllGroups && data.room.mute) ||
						(data.room.roomId > 0 && data.room.mute)
				}
				const msgs2add = db.get("messages." + data.room.roomId)
					.dropRightWhile(e => this.messages.includes(e))
					.takeRight(10).value()
				setTimeout(() => {
					if (msgs2add.length)
						this.messages = [...msgs2add, ...this.messages]
					else
						this.messagesLoaded = true
				}, 0)				// db.get("messages." + data.room.roomId).last().assign({seen:true}).write()
			},

			onQQMessage(data) {
				console.log(data)
				const now = new Date()
				const groupId = data.group_id
				const senderId = data.sender.user_id
				const roomId = groupId ? -groupId : data.user_id
				if (this.ignoredChats.find(e => e.id == roomId))
					return
				const isSelfMsg = this.account == senderId
				const senderName = groupId ?
					(isSelfMsg ? "You" :
						(data.sender.card || data.sender.nickname)) :
					(data.sender.remark || data.sender.nickname)
				const avatar = groupId ?
					`https://p.qlogo.cn/gh/${groupId}/${groupId}/0` :
					`https://q1.qlogo.cn/g?b=qq&nk=${senderId}&s=640`
				const roomName = groupId ?
					data.group_name : senderName

				const message = {
					senderId: senderId,
					username: senderName,
					content: "",
					timestamp: new Date().format("hh:mm"),
					date: new Date().format("dd/MM/yyyy"),
					_id: data.message_id
				}

				var room = this.rooms.find(e => e.roomId == roomId)
				if (room == undefined) {
					// create room
					room = createRoom(roomId, roomName, avatar)
					this.rooms = [room, ...this.rooms]
					db.set('messages.' + roomId, []).write()
				}
				else {
					this.rooms = [room, ...this.rooms.filter(item => item !== room)];
				}//bring the room first

				//begin process msg
				room.lastMessage = {
					content: "",
					timestamp: now.format("hh:mm"),
					username: senderName
				}
				data.message.forEach(m => {
					switch (m.type) {
						case "text":
						case "at":
							room.lastMessage.content += m.data.text
							message.content += m.data.text
							break
						case "image":
						case "flash":
							room.lastMessage.content += "[Image]"
							var url = m.data.url
							url = url.replace("http://", "nya://").replace("https://", "nya://")
							message.file = {
								type: "image/jpeg",
								url
							}
							break
						case "bface":
							room.lastMessage.content += "[Sticker]" + m.data.text
							var url = `nya://gxh.vip.qq.com/club/item/parcel/item/${m.data.file.substr(0, 2)}/${m.data.file.substr(0, 32)}/300x300.png`
							message.file = {
								type: "image/webp",
								url
							}
							break
						case "file":
							room.lastMessage.content += "[File]" + m.data.name
							message.content += m.data.name
							message._id = m.data.fileid
							message.file = {
								type: 'object/stream',
								size: m.data.size,
								url: m.data.url,
								name: m.data.name
							}
							break
						case "share":
							room.lastMessage.content += "[Link]" + m.data.title
							message.content += m.data.url
							break
						case "reply":
							const replyMessage = db.get('messages.' + roomId)
								.find({ _id: m.data.id }).value()
							if (replyMessage)
								message.replyMessage = {
									_id: m.data.id,
									content: replyMessage.username + ": " + replyMessage.content
								}
							break
						case "json":
							const json = m.data.data
							var appurl = null
							const biliRegex = /(https?:\\?\/\\?\/b23\.tv\\?\/\w*)\??/
							const zhihuRegex = /(https?:\\?\/\\?\/\w*\.?bilibili\.com\\?\/[^?""=]*)\??/
							const biliRegex2 = /(https?:\\?\/\\?\/\w*\.?bilibili\.com\\?\/[^?""=]*)\??/
							const jsonLinkRegex = /{.*""app"":""com.tencent.structmsg"".*""jumpUrl"":""(https?:\\?\/\\?\/[^"",]*)"".*}/
							if (biliRegex.test(json))
								appurl = json.match(biliRegex)[1].replace(/\\\//g, '/')
							else if (biliRegex2.test(json))
								appurl = json.match(biliRegex2)[1].replace(/\\\//g, '/')
							else if (zhihuRegex.test(json))
								appurl = json.match(zhihuRegex)[1].replace(/\\\//g, '/')
							else if (jsonLinkRegex.test(json))
								appurl = json.match(jsonLinkRegex)[1].replace(/\\\//g, '/')
							if (appurl) {
								room.lastMessage.content = appurl
								message.content = appurl
							}
							break
						case "xml":
							if (m.data.data.includes('action="viewMultiMsg"')) {
								room.lastMessage.content += '[Forward multiple messages]'
								message.content += '[Forward multiple messages]'
							}
							const urlRegex = /url="([^"]+)"/
							if (urlRegex.test(m.data.data))
								appurl = m.data.data.match(urlRegex)[1].replace(/\\\//g, '/')
							if (appurl) {
								room.lastMessage.content = appurl
								message.content = appurl
							}
							break
						case "face":
							message.content += `[Face: ${m.data.id}]`
							room.lastMessage.content += `[Face: ${m.data.id}]`
							break
					}
				});
				//notification
				const muted = (room.roomId < 0 && this.muteAllGroups && !room.unmute) ||
					(room.roomId < 0 && !this.muteAllGroups && room.mute) ||
					(room.roomId > 0 && room.mute)
				if (!remote.getCurrentWindow().isFocused() && !this.dnd &&
					!muted && !isSelfMsg) {
					//notification
					if (process.platform == 'darwin') {
						convertImgToBase64(avatar, b64img => {
							const notif = new remote.Notification({
								title: roomName,
								body: (groupId ? (senderName + ": ") : "") + room.lastMessage.content,
								icon: nativeImage.createFromDataURL(b64img),
								hasReply: true,
								replyPlaceholder: 'Reply to ' + roomName,
								urgency: 'critical'
							})
							notif.addListener('click', () => {
								const window = remote.getCurrentWindow()
								window.show()
								window.focus()
								this.selectedRoom = room
							})
							notif.addListener('reply', (e, r) => {
								this.sendMessage({
									content: r,
									room
								})
							})
							notif.show()
						})
					}
					else {
						const notiopin = {
							body: (groupId ? (senderName + ": ") : "") + room.lastMessage.content,
							icon: avatar
						}

						const notif = new Notification(roomName, notiopin)

						notif.onclick = () => {
							const window = remote.getCurrentWindow()
							window.show()
							window.focus()
							this.selectedRoom = room
						}
					}
				}

				if (room != this.selectedRoom) {
					if (isSelfMsg)
						room.unreadCount = 0
					else
						room.unreadCount++
				}
				else
					this.messages = [...this.messages, message]

				db.set("rooms", this.rooms).write()
				db.get('messages.' + roomId).push(message)
					.write()

			},

			openImage(data) {
				if (data.action == "preview") {
					var prev = new remote.BrowserWindow(
						{
							height: 800,
							width: 800,
							useContentSize: true
						}
					)
					prev.loadURL(data.message.file.url.replace("nya://", "https://"))
					prev.title = data.message.username + "'s image"
				}
				else if (data.action == "download") {
					if (data.message.file.type.includes('image')) {
						const downdir = remote.app.getPath("downloads")
						const downpath = path.join(downdir, "QQ_Image_" + new Date().getTime() + ".jpg")
						download(data.message.file.url.replace("nya://", "https://"), downpath, () => {
							this.$notify.success({
								title: 'Image Saved',
								message: downpath
							});
						})
					}
					else {
						shell.openExternal(data.message.file.url)
					}
				}
			},

			async deleteMessage(data) {
				const message = this.messages.find(e => e._id == data.messageId)
				const res = await bot.deleteMsg(data.messageId)
				if (!res.error)
					message.deleted = new Date()
				this.messages = [...this.messages]
				db.get('messages.' + this.selectedRoom.roomId)
					.find({ _id: data.messageId })
					.assign({ deleted: new Date() }).write()
			},

			friendRecall(data) {
				db.get('messages.' + data.user_id)
					.find({ _id: data.message_id })
					.assign({ deleted: new Date() }).write()
				if (data.user_id == this.selectedRoom.roomId) {
					const message = this.messages.find(e => e._id == data.message_id)
					if (message) {
						message.deleted = new Date()
						this.messages = [...this.messages]
					}
				}
			},

			groupRecall(data) {
				db.get('messages.' + -data.group_id)
					.find({ _id: data.message_id })
					.assign({ deleted: new Date() }).write()
				if (-data.group_id == this.selectedRoom.roomId) {
					const message = this.messages.find(e => e._id == data.message_id)
					if (message) {
						message.deleted = new Date()
						this.messages = [...this.messages]
					}
				}
			},

			sendSticker(url) {
				if (this.selectedRoom)
					this.sendMessage({
						content: "",
						room: this.selectedRoom,
						imgpath: url
					})
			},

			rmIgnore(chat) {
				console.log(chat)
				this.ignoredChats = this.ignoredChats.filter(item => item.id != chat.id)
				db.set("ignoredChats", this.ignoredChats).write()
			},

			reconnect() {
				this.reconnecting = true
				bot.login(glodb.get('account.password').value())
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
				menu.append(new remote.MenuItem({
					label: 'Mute all groups', type: 'checkbox',
					checked: this.muteAllGroups,
					click: (menuItem, _browserWindow, _event) => {
						this.muteAllGroups = menuItem.checked
						db.set("muteAllGroups", menuItem.checked).write()
					}
				}))
				menu.append(this.dndMenuItem)
				menu.append(new remote.MenuItem({
					label: 'Manage ignored chats',
					click: () => this.panel = "ignore"
				}))
				menu.append(new remote.MenuItem({
					type: 'separator'
				}))
				menu.append(new remote.MenuItem({
					label: 'Auto login', type: 'checkbox',
					checked: glodb.get('account.autologin').value(),
					click: (menuItem, _browserWindow, _event) => {
						glodb.set('account.autologin', menuItem.checked).write()
					}
				}))
				if (process.windowsStore) {
					menu.append(new remote.MenuItem({
						label: 'Launch when Windows starts', type: 'checkbox',
						checked: WindowsStoreAutoLaunch.getStatus() == 2,
						click: (menuItem, _browserWindow, _event) => {
							console.log(WindowsStoreAutoLaunch.getStatus())
							if (WindowsStoreAutoLaunch.getStatus() == 1) {
								menuItem.checked = false
								this.$notify.error({
									title: 'Failed',
									message: "You have manually disabled auto launch in TaskMgr."
								});
							}
							else if (menuItem.checked)
								WindowsStoreAutoLaunch.enable()
							else
								WindowsStoreAutoLaunch.disable()
						}
					}))
					menu.append(new remote.MenuItem({
						label: 'Show test notification',
						click: (menuItem, _browserWindow, _event) => {
							const notiopin = {
								body: 'test'
							}

							const notif = new Notification('test', notiopin)

							notif.onclick = () => {
								const window = remote.getCurrentWindow()
								window.show()
								window.focus()
							}
						}
					}))
				}

				menu.append(new remote.MenuItem({
					type: 'separator'
				}))
				menu.append(new remote.MenuItem({
					label: remote.app.getVersion(),
					enabled: false
				}))
				menu.append(new remote.MenuItem({
					label: 'Reload',
					type: 'normal',
					click: () => {
						bot.removeListener("message", this.onQQMessage);
						bot.removeListener("notice.friend.recall", this.friendRecall)
						bot.removeListener("notice.group.recall", this.groupRecall)
						bot.removeListener('system.online', this.online)
						bot.removeListener('system.offline', this.onOffline)
						bot.removeListener('notice.friend.poke', this.friendpoke)
						location.reload();
					}
				}))
				menu.append(new remote.MenuItem({
					label: 'Dev Tools',
					role: 'toggleDevTools'
				}))
				menu.append(new remote.MenuItem({
					label: 'Quit',
					click: () => remote.getCurrentWindow().destroy()
				}))
				menu.popup({ window: remote.getCurrentWindow() })
			},

			roomContext(room) {
				const muted = (room.roomId < 0 && this.muteAllGroups && !room.unmute) ||
					(room.roomId < 0 && !this.muteAllGroups && room.mute) ||
					(room.roomId > 0 && room.mute)
				const mutetitle = muted ? "Unmute Chat" : "Mute Chat"
				const pintitle = room.index ? "Unpin Chat" : "Pin Chat"
				const menu = remote.Menu.buildFromTemplate([
					{
						label: mutetitle,
						click: () => {
							if (room.roomId < 0 && this.muteAllGroups)
								room.unmute = !room.unmute
							else
								room.mute = !room.mute
							this.rooms = [...this.rooms]
							db.set("rooms", this.rooms).write()
						}
					},
					{
						label: pintitle,
						click: () => {
							if (room.index)
								room.index = 0
							else
								room.index = 1
							this.rooms = [...this.rooms]
							db.set("rooms", this.rooms).write()
						}
					},
					{
						label: 'Delete Chat',
						click: () => {
							db.unset('messages.' + data.roomId).write()
							this.rooms = this.rooms.filter(item => item.roomId != data.roomId)
							db.set("rooms", this.rooms).write()
						}
					},
					{
						label: 'Ignore Chat',
						click: () => {
							this.ignoredChats.push({
								id: data.roomId,
								name: room.roomName
							})
							db.unset('messages.' + data.roomId).write()
							this.rooms = this.rooms.filter(item => item.roomId != data.roomId)
							db.set("rooms", this.rooms).write()
							db.set("ignoredChats", this.ignoredChats).write()
						}
					},
				])
				menu.popup({ window: remote.getCurrentWindow() })

			},

			friendpoke(data) {
				console.log(data)
				const room = this.rooms.find(e => e.roomId == data.operator_id)
				if (room) {
					this.rooms = [room, ...this.rooms.filter(item => item !== room)];
					var msg = room.roomName + " "
					msg += data.action
					if (data.user_id == data.operator_id) {
						msg += " " + room.roomName
						if (data.suffix)
							msg += "'s "
					}
					else
						msg += data.suffix ? " Your " : " You"
					if (data.suffix)
						msg += data.suffix
					const message = {
						content: msg,
						senderId: 0,
						timestamp: new Date().format("hh:mm"),
						date: new Date().format("dd/MM/yyyy"),
						_id: new Date().getTime(),
						system: true
					}
					if (room != this.selectedRoom) {
						room.unreadCount++
					}
					else
						this.messages = [...this.messages, message]
					db.get('messages.' + data.operator_id).push(message)
						.write()
				}
			},

			startChat(id, name) {
				var room = this.rooms.find(e => e.roomId == id)
				const avatar = id < 0 ?
					`https://p.qlogo.cn/gh/${-id}/${-id}/0` :
					`https://q1.qlogo.cn/g?b=qq&nk=${id}&s=640`

				if (room == undefined) {
					// create room
					room = createRoom(id, name, avatar)
					this.rooms = [room, ...this.rooms]
					db.set('messages.' + id, []).write()
				}
				this.selectedRoom = room
				this.view = 'chats'
			},

			chroom(room) {
				this.selectedRoom = room
			},

			pokefriend() {
				console.log('poke')
			},

			createRoom(roomId, roomName, avatar) {
				const room = {
					roomId,
					roomName,
					avatar,
					index: 0,
					unreadCount: 0,
					mute: false,
					users: [
						{ _id: 1, username: '1' },
						{ _id: 2, username: '2' }
					],
					lastMessage: { content: "", timestamp: "" }
				}
				if (id < 0)
					room.users.push({ _id: 3, username: '3' })
				return room
			}
		}
	}
</script>

<style scoped>
	* {
		-webkit-user-select: none;
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
	.el-avatar {
		cursor: pointer;
	}
	.el-col {
		height: 100vh;
		overflow: hidden;
	}

	.nodrag {
		-webkit-user-select: none;
	}

	:focus {
		outline: none;
	}
</style>