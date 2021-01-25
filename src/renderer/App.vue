<template>
	<div id="app">
		<chat-window
			:current-user-id="0"
			:rooms="rooms"
			:messages="messages"
			height="calc(100vh - 20px)"
			:rooms-loaded="true"
			:messages-loaded="true"
			:show-audio="false"
			:show-reaction-emojis="false"
			:show-new-messages-divider="false"
			accepted-files="image/*"
			@send-message="sendMessage"
			@fetch-messages="fetchMessage"
		/>
	</div>
</template>

<script>
	import ChatWindow from 'vue-advanced-chat'
	import 'vue-advanced-chat/dist/vue-advanced-chat.css'

	//lowdb
	import Datastore from 'lowdb'
	import FileSync from 'lowdb/adapters/FileSync'
	import path from 'path'
	import { remote } from 'electron'
	const STORE_PATH = remote.app.getPath('userData')
	const adapter = new FileSync(path.join(STORE_PATH, '/chatdata.json'))
	const db = Datastore(adapter)
	db.defaults({
		rooms: [],
		messages: {},
	})
		.write()
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

	export default {
		components: {
			ChatWindow
		},
		data() {
			return {
				rooms: db.get("rooms").value(),
				messages: [],
				selectedRoom: null
			}
		},
		created() {
			bot.on("message", data => this.onQQMessage(data));
		},
		methods: {
			async sendMessage({ content, roomId, file, replyMessage }) {
				const sendchain = async () => {
					let data
					if (roomId > 0)
						data = (await bot.sendPrivateMsg(roomId, chain, true))
					else
						data = (await bot.sendGroupMsg(-roomId, chain, true))

					if (data.error) {
						this.$notify.error({
							title: '发送失败',
							message: data.error.message
						});
						return
					}
					const room = this.rooms.find(e => e.roomId == roomId)
					room.lastMessage = {
						content,
						timestamp: new Date().format("hh:mm")
					}
					this.rooms = [room, ...this.rooms.filter(item => item !== room)];
					//bring the room first
					if (file)
						room.lastMessage.content += "[Image]"

					message._id = data.data.message_id
					db.update('messages.' + roomId, n => [...n, message])
						.write()
					this.messages = [...this.messages, message]
					db.set("rooms", this.rooms).write()
				}
				const message = {
					sender_id: 0,
					content,
					timestamp: new Date().format("hh:mm")
				}

				if (replyMessage) {
					message.replyMessage = {
						_id: replyMessage._id,
						content: replyMessage.content,
						sender_id: replyMessage.sender_id
					}
					if (replyMessage.file) {
						message.replyMessage.file = replyMessage.file
					}
				}

				const chain = []
				if (content)
					chain.push({
						"type": "text",
						"data": {
							"text": content
						}
					})
				if (file) {
					const reader = new FileReader();
					reader.readAsDataURL(file.blob);
					reader.onload = function () {
						const b64 = reader.result.replace(/^data:.+;base64,/, '');
						message.file = {
							name: file.name,
							size: file.size,
							type: file.type,
							extension: file.extension,
							url: reader.result
						}
						chain.push(
							{
								"type": "image",
								"data": {
									"file": "base64://" + b64
								}
							}
						)
						sendchain()
					} //now support image only
				}
				else {
					sendchain()
				}

			},

			fetchMessage(data) {
				data.room.unreadCount = 0
				this.messages = db.get("messages." + data.room.roomId).value()
				this.selectedRoom = data.room
				// db.get("messages." + data.room.roomId).last().assign({seen:true}).write()
			},

			onQQMessage(data) {
				console.log(data)
				const groupId = data.group_id
				const senderId = data.user_id
				const roomId = groupId ? -groupId : senderId

				const message = {
					sender_id: roomId,
					content: "",
					timestamp: new Date().format("hh:mm"),
					_id: data.message_id
				}

				var room = this.rooms.find(e => e.roomId == roomId)
				if (room == undefined) {
					room = {
						roomId,
						roomName: groupId ?
							data.group_name : (data.sender.remark || data.sender.nickname),
						avatar: groupId ?
							`http://p.qlogo.cn/gh/${groupId}/${groupId}/0` :
							`http://q1.qlogo.cn/g?b=qq&nk=${senderId}&s=640`,
						unreadCount: 0,
						lastMessage: {
							content: "",
							timestamp: ""
						},
						users: [
							{
								_id: data.user_id,
								username: data.sender.remark || data.sender.nickname,
								avatar: `http://q1.qlogo.cn/g?b=qq&nk=${data.user_id}&s=640`
							},
							{
								_id: 0,
								username: "You",
								avatar: "http://q1.qlogo.cn/g?b=qq&nk=2981882373&s=640"
							}
						]
					}
					this.rooms = [...this.rooms, room]
					db.set('messages.' + data.user_id, []).write()
				}
				//bring the room first
				room.
				//begin process msg
				room.lastMessage = {
					content: "",
					timestamp: new Date().format("hh:mm")
				}
				data.message.forEach(m => {
					switch (m.type) {
						case "text":
							room.lastMessage.content += m.data.text
							message.content += m.data.text
							break
						case "image":
							room.lastMessage.content += "[Image]"
							message.file = {
								name: "image",
								size: 233,
								type: "image/jpeg",
								extension: "jpg",
								url: m.data.url
							}
							break
						case "share":
							room.lastMessage.content += "[Link]" + m.data.title
							message.content += m.data.url
							break

					}
				});
				//notification
				if (!remote.getCurrentWindow().isFocused()) {
					//notification
					const notiopin = {
						body: room.lastMessage.content,
						icon: `http://q1.qlogo.cn/g?b=qq&nk=${data.user_id}&s=640`
					}
					if (message.file)
						notiopin.image = message.file.url


					const notif = new Notification((data.sender.remark || data.sender.nickname) + ":", notiopin)

					notif.onclick = () => {
						remote.getCurrentWindow().show()
					}
				}
				if (room != this.selectedRoom)
					room.unreadCount++
				else
					this.messages = [...this.messages, message]

				db.set("rooms", this.rooms).write()
				db.update('messages.' + data.user_id, n => [...n, message])
					.write()

			}
		}
	}
  </script>

<style>
	@font-face {
		font-family: "font";
		src: url("/static/font.ttf");
	}
	div#app {
		font-family: "font";
	}
</style>
