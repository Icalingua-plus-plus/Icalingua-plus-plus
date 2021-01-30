<template>
	<el-row>
		<!-- <el-col :span="6">
			
		</el-col> -->
		<el-col :span="19">
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
				:menu-actions="menuActions"
				:message-actions="messageActions"
				@send-message="sendMessage"
				@fetch-messages="fetchMessage"
				@delete-message="deleteMessage"
				@open-file="openImage"
				@menu-action-handler="roomAction"
				@message-action-handler="messageActionsHandler"
			/>
		</el-col>
		<el-col :span="5">
			<Stickers v-show="panel == 'stickers'" @send="sendSticker" />
			<IgnoreManage
				v-show="panel == 'ignore'"
				:ignoredChats="ignoredChats"
				@remove="rmIgnore"
				@close="closePanel"
			/>
		</el-col>
	</el-row>
</template>

<script>
	import ChatWindow from 'vue-advanced-chat'
	import Stickers from '@/components/Stickers'
	import IgnoreManage from '@/components/IgnoreManage'
	import 'vue-advanced-chat/dist/vue-advanced-chat.css'

	//lowdb
	import Datastore from 'lowdb'
	import FileSync from 'lowdb/adapters/FileSync'
	import path from 'path'
	import { remote, clipboard, nativeImage, shell } from 'electron'
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
	const http = require('http');
	const fs = require('fs');
	const download = function (url, dest, cb) {
		const file = fs.createWriteStream(dest);
		http.get(url, function (response) {
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
			IgnoreManage
		},
		data() {
			return {
				rooms: [],
				messages: [],
				selectedRoom: null,
				menuActions: [
					{
						name: 'mute',
						title: 'Mute Chat'
					},
					{
						name: 'pin',
						title: 'Pin Chat'
					},
					{
						name: 'del',
						title: 'Delete Chat'
					},
					{
						name: 'ignore',
						title: 'Ignore Chat'
					}
				],
				muteAllGroups: false,
				dndMenuItem: null,
				dnd: false,
				tray: null,
				messageActions: [
					{
						name: 'copy',
						title: 'Copy'
					},
					{
						name: 'replyMessage',
						title: 'Reply'
					},
					{
						name: 'deleteMessage',
						title: 'Delete Message',
						onlyMe: true
					}
				],
				account: null,
				messagesLoaded: false,
				ignoredChats: [],
				panel: ''
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

			remote.Menu.setApplicationMenu(remote.Menu.buildFromTemplate([
				{
					label: 'System', type: 'submenu', submenu: remote.Menu.buildFromTemplate([
						{ label: 'Logout', type: 'normal', click: () => { remote.getCurrentWindow().destroy() } }
					])
				},
				{
					label: 'Notification', type: 'submenu', submenu: remote.Menu.buildFromTemplate([
						{
							label: 'Mute all groups', type: 'checkbox',
							checked: this.muteAllGroups,
							click: (menuItem, _browserWindow, _event) => {
								this.muteAllGroups = menuItem.checked
								db.set("muteAllGroups", menuItem.checked).write()
								const muted = (this.selectedRoom.roomId < 0 && this.muteAllGroups && !this.selectedRoom.unmute) ||
									(this.selectedRoom.roomId < 0 && !this.muteAllGroups && this.selectedRoom.mute) ||
									(this.selectedRoom.roomId > 0 && this.selectedRoom.mute)
								this.menuActions.find(e => e.name == "mute").title = muted ? "Unmute Chat" : "Mute Chat"
							}
						},
						this.dndMenuItem,
						{
							label: 'Manage ignored chats',
							click: () => this.panel = "ignore"
						},
					])
				},
				{
					label: 'About', type: 'submenu', submenu: remote.Menu.buildFromTemplate([
						{ label: 'About', type: 'normal', role: 'about' },
						{ label: 'Dev Tools', type: 'normal', role: 'toggleDevTools', accelerator: 'F12' }
					])
				},
			]))

			if (process.env.NODE_ENV === 'development')
				document.title = "[DEBUG] Electron QQ"
			if (process.env.NYA) {
				document.title = "[DEBUG:UI] Electron QQ"
			}
			else {
				this.tray = new remote.Tray(path.join(__static, '/256x256.png'))
				this.tray.setToolTip('Electron QQ')
				this.tray.setContextMenu(remote.Menu.buildFromTemplate([
					{ label: 'Open', type: 'normal', click: () => { remote.getCurrentWindow().show() } },
					this.dndMenuItem,
					{ label: 'Exit', type: 'normal', click: () => { remote.getCurrentWindow().destroy() } }
				]))
				this.tray.on("click", () => {
					remote.getCurrentWindow().show()
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
					console.log('File Path of dragged files: ', f.path)
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
					sender_id: this.account,
					username: "You",
					content,
					timestamp: new Date().format("hh:mm")
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
				console.log(data)
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
					this.menuActions.find(e => e.name == "mute").title = muted ? "Unmute Chat" : "Mute Chat"
					this.menuActions.find(e => e.name == "pin").title = data.room.index ? "Unpin Chat" : "Pin Chat"
				}
				const msgs2add = db.get("messages." + data.room.roomId)
					.dropRightWhile(e => this.messages.includes(e))
					.takeRight(10).value()
				if (msgs2add.length)
					this.messages = [...msgs2add, ...this.messages]
				else
					this.messagesLoaded = true
				// db.get("messages." + data.room.roomId).last().assign({seen:true}).write()
			},

			onQQMessage(data) {
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
					`http://p.qlogo.cn/gh/${groupId}/${groupId}/0` :
					`http://q1.qlogo.cn/g?b=qq&nk=${senderId}&s=640`
				const roomName = groupId ?
					data.group_name : senderName

				const message = {
					sender_id: senderId,
					username: senderName,
					content: "",
					timestamp: new Date().format("hh:mm"),
					_id: data.message_id
				}

				var room = this.rooms.find(e => e.roomId == roomId)
				if (room == undefined) {
					room = {
						roomId,
						roomName,
						avatar,
						unreadCount: 0,
						lastMessage: {
							content: "",
							timestamp: ""
						},
						users: [
							{
								_id: roomId,
							},
							{
								_id: 0,
							}
						]
					}
					if (groupId) //recognize group
						room.users.push({ _id: 233 })
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
							room.lastMessage.content += m.data.text
							message.content += m.data.text
							break
						case "image":
							room.lastMessage.content += "[Image]"
							var url = m.data.url
							url = url.replace("http://", "nya://").replace("https://", "nya://")
							message.file = {
								type: "image/jpeg",
								url
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
							const zhihuRegex = /(https?:\\?\/\\?\/\w*\.?zhihu\.com\\?\/[^?""=]*)\??/
							const jsonLinkRegex = /{.*""app"":""com.tencent.structmsg"".*""jumpUrl"":""(https?:\\?\/\\?\/[^"",]*)"".*}/
							if (biliRegex.test(json))
								appurl = json.match(biliRegex)[1].replace(/\\\//g, '/')
							else if (zhihuRegex.test(json))
								appurl = json.match(zhihuRegex)[1].replace(/\\\//g, '/')
							else if (jsonLinkRegex.test(json))
								appurl = json.match(jsonLinkRegex)[1].replace(/\\\//g, '/')

							if (appurl) {
								room.lastMessage.content = appurl
								message.content = appurl
							}
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
					const notiopin = {
						body: (groupId ? (senderName + ": ") : "") + room.lastMessage.content,
						icon: avatar
					}

					const notif = new Notification(roomName, notiopin)

					notif.onclick = () => {
						remote.getCurrentWindow().show()
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
					prev.loadURL(data.message.file.url)
					prev.title = data.message.username + "'s image"
				}
				else if (data.action == "download") {
					const downdir = remote.app.getPath("downloads")
					const downpath = path.join(downdir, "QQ_Image_" + new Date().getTime() + ".jpg")
					download(data.message.file.url.replace("nya://", "http://"), downpath, () => {
						this.$notify.success({
							title: 'Image Saved',
							message: downpath
						});
					})
				}
			},

			roomAction(data) {
				if (data.action.name == "pin") {
					const room = this.rooms.find(e => e.roomId == data.roomId)
					if (room.index)
						room.index = undefined
					else
						room.index = 1
					this.menuActions.find(e => e.name == "pin").title = room.index ? "Unpin Chat" : "Pin Chat"
					this.rooms = [...this.rooms]
					db.set("rooms", this.rooms).write()
				}
				else if (data.action.name == "mute") {
					const room = this.rooms.find(e => e.roomId == data.roomId)
					if (room.roomId < 0 && this.muteAllGroups)
						room.unmute = !room.unmute
					else
						room.mute = !room.mute
					const muted = (room.roomId < 0 && this.muteAllGroups && !room.unmute) ||
						(room.roomId < 0 && !this.muteAllGroups && room.mute) ||
						(room.roomId > 0 && room.mute)
					this.menuActions.find(e => e.name == "mute").title = muted ? "Unmute Chat" : "Mute Chat"
					this.rooms = [...this.rooms]
					db.set("rooms", this.rooms).write()
				}
				else if (data.action.name == "ignore") {
					const room = this.rooms.find(e => e.roomId == data.roomId)
					this.ignoredChats.push({
						id: data.roomId,
						name: room.roomName
					})
					db.unset('messages.' + data.roomId).write()
					this.rooms = this.rooms.filter(item => item.roomId != data.roomId)
					db.set("rooms", this.rooms).write()
					db.set("ignoredChats", this.ignoredChats).write()
				}
				else if (data.action.name == "del") {
					db.unset('messages.' + data.roomId).write()
					this.rooms = this.rooms.filter(item => item.roomId != data.roomId)
					db.set("rooms", this.rooms).write()
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

			messageActionsHandler(data) {
				if (data.action.name == "copy") {
					if (data.message.file)
						convertImgToBase64(data.message.file.url, function (base64Image) {
							const image = nativeImage.createFromDataURL(base64Image)
							clipboard.writeImage(image)
						})
					else
						clipboard.writeText(data.message.content)
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

			closePanel() {
				this.panel = 'stickers'
			}
		}
	}
</script>
