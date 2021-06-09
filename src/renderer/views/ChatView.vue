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
				<el-row v-show="view === 'chats'">
					<!-- main chat view -->
					<el-col :span="5" ondragstart="return false;" class="nodrag">
						<TheRoomsPanel
							:rooms="rooms"
							:selected="selectedRoom"
							:priority="priority"
							@chroom="chroom"
							@contextmenu="roomContext"
						/>
					</el-col>
					<el-col
						:span="panel ? 13 : 19"
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
							:mongodb="mongodb"
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
					</el-col>
					<el-col
						:span="6"
						ondragstart="return false;"
						class="nodrag"
						v-show="panel"
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
							v-show="panel === 'ignore'"
							:ignoredChats="ignoredChats"
							@remove="rmIgnore"
							@close="panel = ''"
						/>
					</el-col>
				</el-row>
				<el-row v-if="view === 'contacts'" type="flex" justify="center">
					<el-col :span="8" ondragstart="return false;" class="nodrag">
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
import Room from "../components/vac-mod/ChatWindow/Room/Room";
import Stickers from "../components/Stickers";
import IgnoreManage from "../components/IgnoreManage";
import {defaultThemeStyles, cssThemeVars} from "../components/vac-mod/themes";

//lowdb
import Datastore from "lowdb";
import FileSync from "lowdb/adapters/FileSync";
import path from "path";
import {
	clipboard,
	nativeImage,
	shell,
	ipcRenderer,
} from "electron";
import SideBarIcon from "../components/SideBarIcon.vue";
import TheRoomsPanel from "../components/TheRoomsPanel.vue";
import TheContactsPanel from "../components/TheContactsPanel.vue";
import {io} from "socket.io-client";

import MongoStorageProvider from "../providers/MongoStorageProvider";
import IndexedStorageProvider from "../providers/IndexedStorageProvider";
import RedisStorageProvider from "../providers/RedisStorageProvider"

const _ = require('lodash');
const remote = require('@electron/remote')
const STORE_PATH = remote.getGlobal("STORE_PATH");
const glodb = remote.getGlobal("glodb");

const Aria2 = require("aria2");

let db, aria, socketIo
/**
 * @type StorageProvider
 */
let storage
//oicq
const bot = remote.getGlobal("bot");
console.log(bot);

//region copied code
//date format https://www.cnblogs.com/tugenhua0707/p/3776808.html
Date.prototype.format = function (fmt) {
	var o = {
		"M+": this.getMonth() + 1, //月份
		"d+": this.getDate(), //日
		"h+": this.getHours(), //小时
		"m+": this.getMinutes(), //分
		"s+": this.getSeconds(), //秒
		"q+": Math.floor((this.getMonth() + 3) / 3), //季度
		S: this.getMilliseconds(), //毫秒
	};
	if (/(y+)/.test(fmt)) {
		fmt = fmt.replace(
			RegExp.$1,
			(this.getFullYear() + "").substr(4 - RegExp.$1.length)
		);
	}
	for (var k in o) {
		if (new RegExp("(" + k + ")").test(fmt)) {
			fmt = fmt.replace(
				RegExp.$1,
				RegExp.$1.length === 1 ? o[k] : ("00" + o[k]).substr(("" + o[k]).length)
			);
		}
	}
	return fmt;
};

//download https://qastack.cn/programming/11944932/how-to-download-a-file-with-node-js-without-using-third-party-libraries
const https = require("https");
const fs = require("fs");
const download = function (url, dest, cb) {
	const file = fs.createWriteStream(dest);
	https
		.get(url, function (response) {
			response.pipe(file);
			file.on("finish", function () {
				file.close(cb); // close() is async, call cb after close completes.
			});
		})
		.on("error", function (err) {
			// Handle errors
			fs.unlink(dest); // Delete the file async. (But we don't check the result)
			if (cb) cb(err.message);
		});
};

//convertImgToBase64 https://blog.csdn.net/myf8520/article/details/107340712
function convertImgToBase64(url, callback, outputFormat) {
	var canvas = document.createElement("CANVAS"),
		ctx = canvas.getContext("2d"),
		img = new Image();
	img.crossOrigin = "Anonymous";
	img.onload = function () {
		canvas.height = img.height;
		canvas.width = img.width;
		ctx.drawImage(img, 0, 0);
		var dataURL = canvas.toDataURL(outputFormat || "image/png");
		callback.call(this, dataURL);
		canvas = null;
	};
	img.src = url;
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
	},
	data() {
		return {
			rooms: [],
			messages: [],
			selectedRoom: {roomId: 0},
			tray: null,
			account: null,
			messagesLoaded: false,
			ignoredChats: [],
			panel: "",
			offline: false,
			offlineReason: "",
			reconnecting: false,
			styles: {
				container: {
					boxShadow: "none",
				},
			},
			view: "chats",
			username: "",
			darkTaskIcon: false,
			nuist: false,
			aria2: {
				enabled: false,
				host: "127.0.0.1",
				port: 6800,
				secure: false,
				secret: "",
				path: "/jsonrpc",
			},
			dialogAriaVisible: false,
			aria,
			mongodb: false,
			priority: 1,
			theme: "default",
			menu: [],
			loading: false,
			isShutUp: false
		};
	},
	created() {
		const loading = this.$loading({
			lock: true,
		});
		//region db init
		this.account = glodb.get("account").value().username;
		this.mongodb = glodb.get("mongodb").value();
		const adapter = new FileSync(
			path.join(STORE_PATH, `/chatdata${this.account}v2.json`),
			{
				serialize: (data) => JSON.stringify(data, null, false),
			}
		);
		db = Datastore(adapter);
		db.defaults({
			ignoredChats: [],
			darkTaskIcon: false,
			aria2: {
				enabled: false,
				host: "127.0.0.1",
				port: 6800,
				secure: false,
				secret: "",
				path: "/jsonrpc",
			},
			priority: 3,
		}).write();
		if (this.mongodb) {
			storage = new MongoStorageProvider(glodb.get("connStr").value(), this.account)
			storage.connect()
				.then(() => {
					storage.getAllRooms()
						.then((e) => {
							this.rooms = e;
							this.rooms.forEach((e) => {
								//更新群的名称
								if (e.roomId > -1) return;
								const group = bot.gl.get(-e.roomId)
								if (group && group.group_name !== e.roomName) {
									e.roomName = group.group_name;
									storage.updateRoom(e.roomId, {roomName: group.group_name})
								}
							});
						});
					bot.on("message", this.onQQMessage);
					bot.on("notice.friend.recall", this.friendRecall);
					bot.on("notice.group.recall", this.groupRecall);
					bot.on("system.online", this.online);
					bot.on("system.offline", this.onOffline);
					bot.on("notice.friend.poke", this.friendPoke);
					bot.on("notice.group.poke", this.groupPoke);
					remote.getCurrentWindow().on("focus", this.clearCurrentRoomUnread);
					loading.close();
				})
				.catch((err) => {
					console.log(err);
					glodb.set("account.autologin", false).write()
					alert('Error connecting to MongoDB database')
					//remote.getCurrentWindow().destroy()
				})
		}
		else {
			db.defaults({
				rooms: [],
				messages: {},
			}).write();
			this.rooms = db.get("rooms").value();
		}
		this.priority = db.get("priority").value();
		this.darkTaskIcon = db.get("darkTaskIcon").value();
		this.ignoredChats = db.get("ignoredChats").value();
		this.aria2 = db.get("aria2").value();
		//endregion
		//region set status
		if (process.env.NODE_ENV === "development")
			document.title = "[DEBUG] Electron QQ";
		if (process.env.NYA) {
			document.title = "[DEBUG:UI] Electron QQ";
		}
		else {
			this.offline = !bot.getStatus().data.online;
			this.username = bot.getLoginInfo().data.nickname;
			this.tray = remote.getGlobal("tray");
			this.tray.setToolTip("Electron QQ");
			this.tray.on("click", () => {
				const window = remote.getCurrentWindow();
				window.show();
				window.focus();
			});
		}

		//endregion
		//region listener
		document.addEventListener("dragover", (e) => {
			e.preventDefault();
			e.stopPropagation();
		});
		//keyboard
		document.addEventListener("keydown", (e) => {
			if (e.repeat) return;
			if (e.key === "w" && e.ctrlKey === true) {
				remote.getCurrentWindow().minimize();
			}
			else if (e.key === "Tab") {
				let unreadRoom = this.rooms.find(
					(e) => e.unreadCount && e.priority >= this.priority
				);
				if (!unreadRoom) unreadRoom = this.rooms.find((e) => e.unreadCount);
				if (unreadRoom) this.chroom(unreadRoom);
			}
		});
		ipcRenderer.on("openForward", (e, resId) => this.openForward(resId));
		ipcRenderer.on("openImage", (e, resId) => this.openImage(resId));
		ipcRenderer.on("downloadImage", (e, resId) => this.downloadImage(resId));
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
		//endregion
		//region build menu
		const updatePriority = (lev) => {
			this.priority = lev;
			db.set("priority", lev).write();
			this.updateAppMenu();
		};
		this.menu = [
			new remote.MenuItem({
				label: "Notification Priority",
				submenu: [
					{
						type: "radio",
						label: "1",
						checked: this.priority === 1,
						click: () => updatePriority(1),
					},
					{
						type: "radio",
						label: "2",
						checked: this.priority === 2,
						click: () => updatePriority(2),
					},
					{
						type: "radio",
						label: "3",
						checked: this.priority === 3,
						click: () => updatePriority(3),
					},
					{
						type: "radio",
						label: "4",
						checked: this.priority === 4,
						click: () => updatePriority(4),
					},
					{
						type: "radio",
						label: "5",
						checked: this.priority === 5,
						click: () => updatePriority(5),
					},
				],
			}),
			[
				new remote.MenuItem({
					label: "Manage ignored chats",
					click: () => (this.panel = "ignore"),
				}),
				new remote.MenuItem({
					label: "Aria2 download options",
					click: () => (this.dialogAriaVisible = true),
				}),
				new remote.MenuItem({
					label: "Auto login",
					type: "checkbox",
					checked: glodb.get("account.autologin").value(),
					click: (menuItem) => {
						glodb.set("account.autologin", menuItem.checked).write();
					},
				}),
			],
			[
				new remote.MenuItem({
					label: remote.app.getVersion(),
					enabled: false,
				}),
				new remote.MenuItem({
					label: "Reload",
					type: "normal",
					click: () => {
						bot.removeListener("message", this.onQQMessage);
						bot.removeListener("notice.friend.recall", this.friendRecall);
						bot.removeListener("notice.group.recall", this.groupRecall);
						bot.removeListener("system.online", this.online);
						bot.removeListener("system.offline", this.onOffline);
						bot.removeListener("notice.friend.poke", this.friendPoke);
						remote
							.getCurrentWindow()
							.removeListener("focus", this.clearCurrentRoomUnread);
						location.reload();
					},
				}),
				new remote.MenuItem({
					label: "Dev Tools",
					role: "toggleDevTools",
				}),
				new remote.MenuItem({
					label: "Quit",
					click: this.exit,
				}),
			],
		];
		this.updateAppMenu();
		this.tray.setContextMenu(
			remote.Menu.buildFromTemplate([
				{
					label: "Open",
					type: "normal",
					click: () => {
						const window = remote.getCurrentWindow();
						window.show();
						window.focus();
					},
				},
				this.menu[0],
				{
					label: "Icon theme",
					submenu: [
						{
							label: "Dark",
							type: "radio",
							checked: this.darkTaskIcon,
							click: () => {
								this.darkTaskIcon = true;
								this.updateTrayIcon();
								db.set("darkTaskIcon", true).write();
							},
						},
						{
							label: "Light",
							type: "radio",
							checked: !this.darkTaskIcon,
							click: () => {
								this.darkTaskIcon = false;
								this.updateTrayIcon();
								db.set("darkTaskIcon", false).write();
							},
						},
					],
				},
				{
					label: "Exit",
					type: "normal",
					click: this.exit,
				},
			])
		);

		if (fs.existsSync(path.join(STORE_PATH, "font.ttf"))) {
			console.log("nya");
			const myFonts = new FontFace(
				"font",
				`url(${path.join(STORE_PATH, "font.ttf")})`,
				{}
			);
			myFonts.load().then(function (loadFace) {
				document.fonts.add(loadFace);
			});
		}

		if (this.aria2.enabled) this.startAria();

		if (db.get('socketIoSlave').value()) {
			this.initSocketIo()
		}

		if (!this.mongodb) {
			bot.on("message", this.onQQMessage);
			bot.on("notice.friend.recall", this.friendRecall);
			bot.on("notice.group.recall", this.groupRecall);
			bot.on("system.online", this.online);
			bot.on("system.offline", this.onOffline);
			bot.on("notice.friend.poke", this.friendPoke);
			bot.on("notice.group.poke", this.groupPoke);
			remote.getCurrentWindow().on("focus", this.clearCurrentRoomUnread);
			loading.close();
		}
	},
	methods: {
		async sendMessage({content, roomId, file, replyMessage, room, b64img, imgpath,}) {
			this.loading = true
			if (!room && !roomId) {
				room = this.selectedRoom;
				roomId = room.roomId;
			}
			if (!roomId) roomId = room.roomId;
			const sendchain = async () => {
				let data;
				if (roomId > 0) data = await bot.sendPrivateMsg(roomId, chain, true);
				else data = await bot.sendGroupMsg(-roomId, chain, true);

				this.loading = false
				if (data.error) {
					this.$notify.error({
						title: "Failed to send",
						message: data.error.message,
					});
					return;
				}
				if (roomId > 0) {
					console.log(data);
					if (!room) room = this.rooms.find((e) => e.roomId === roomId);
					room.lastMessage = {
						content,
						timestamp: new Date().format("hh:mm"),
					};
					this.rooms = [room, ...this.rooms.filter((item) => item !== room)];
					//bring the room first
					if (file || b64img || imgpath) room.lastMessage.content += "[Image]";

					message._id = data.data.message_id;
					this.messages = [...this.messages, message];
					room.utime = new Date().getTime();
					if (this.mongodb) {
						message.time = new Date().getTime();
						storage.addMessage(roomId, message)
						storage.updateRoom(room.roomId, room)
					}
					else {
						db.get("messages." + roomId)
							.push(message)
							.write();
						db.set("rooms", this.rooms).write();
					}
				}
			};

			const message = {
				senderId: this.account,
				username: "You",
				content,
				timestamp: new Date().format("hh:mm"),
				date: new Date().format("dd/MM/yyyy"),
			};

			const chain = [];

			if (replyMessage) {
				message.replyMessage = {
					_id: replyMessage._id,
					username: replyMessage.username,
					content: replyMessage.content,
				};
				if (replyMessage.file) {
					message.replyMessage.file = replyMessage.file;
				}

				chain.push({
					type: "reply",
					data: {
						id: replyMessage._id,
					},
				});
			}
			if (content)
				chain.push({
					type: "text",
					data: {
						text: content,
					},
				});
			if (b64img) {
				chain.push({
					type: "image",
					data: {
						file: "base64://" + b64img.replace(/^data:.+;base64,/, ""),
					},
				});
				message.file = {
					type: "image/jpeg",
					url: b64img,
				};
			}
			if (imgpath) {
				chain.push({
					type: "image",
					data: {
						file: imgpath,
					},
				});
				message.file = {
					type: "image/jpeg",
					url: imgpath.replace(/\\/g, "/"),
				};
			}
			if (file) {
				if (file.type && file.type.includes('image')) {
					const reader = new FileReader();
					reader.readAsDataURL(file.blob);
					reader.onload = function () {
						const b64 = reader.result.replace(/^data:.+;base64,/, "");
						chain.push({
							type: "image",
							data: {
								file: "base64://" + b64,
							},
						});
						message.file = {
							url: reader.result,
							size: file.size,
							type: file.type,
						};
						sendchain();
					}
				}
				else {
					//is a group file
					if (roomId > 0) {
						this.$message('暂时无法向好友发送文件')
						return
					}
					const gfs = bot.acquireGfs(-roomId)
					gfs.upload(file.path).then(() => this.loading = false)
					this.$message('文件上传中')
				}
			}
			else {
				sendchain();
			}
		},
		fetchMessage(reset) {
			if (reset) {
				this.messagesLoaded = false;
				this.messages = [];
				this.selectedRoom.unreadCount = 0;
				this.selectedRoom.at = false;
				if (this.mongodb)
					storage.updateRoom(this.selectedRoom.roomId, this.selectedRoom)
				else db.set("rooms", this.rooms).write();

				if (this.selectedRoom.roomId < 0) {
					const gid = -this.selectedRoom.roomId
					const group = bot.gl.get(gid)
					if (group)
						this.isShutUp = group.shutup_time_me
					else {
						this.isShutUp = true
						this.$message('你已经不是群成员了')
					}
				}
				else {
					this.isShutUp = false
				}
			}
			if (this.mongodb) {
				storage.fetchMessages(this.selectedRoom.roomId, this.messages.length, 20)
					.then((msgs2add) => {
						setTimeout(() => {
							if (msgs2add.length) {
								this.messages = [...msgs2add, ...this.messages];
							}
							else this.messagesLoaded = true;
						}, 0);
					});
			}
			else {
				const msgs2add = db
					.get("messages." + this.selectedRoom.roomId)
					.dropRightWhile((e) => this.messages.includes(e))
					.takeRight(10)
					.value();
				setTimeout(() => {
					if (msgs2add.length) this.messages = [...msgs2add, ...this.messages];
					else this.messagesLoaded = true;
				}, 0);
			}
			this.updateTrayIcon();
		},
		async onQQMessage(data, history) {
			console.log(data);
			const now = new Date(data.time * 1000);
			const groupId = data.group_id;
			const senderId = data.sender.user_id;
			let roomId = groupId ? -groupId : data.user_id;
			if (typeof history === "number") roomId = history;
			if (this.ignoredChats.find((e) => e.id == roomId)) return;
			const isSelfMsg = this.account == senderId;
			const senderName = groupId
				? data.anonymous
					? data.anonymous.name
					: isSelfMsg
						? "You"
						: data.sender.card || data.sender.nickname
				: data.sender.remark || data.sender.nickname;
			const avatar = groupId
				? `https://p.qlogo.cn/gh/${groupId}/${groupId}/0`
				: `https://q1.qlogo.cn/g?b=qq&nk=${senderId}&s=640`;
			let roomName = groupId ? data.group_name : senderName;

			const message = {
				senderId: senderId,
				username: senderName,
				content: "",
				timestamp: now.format("hh:mm"),
				date: now.format("dd/MM/yyyy"),
				_id: data.message_id,
				role: data.sender.role,
			};

			let room = this.rooms.find((e) => e.roomId == roomId);
			if (room === undefined) {
				const group = bot.gl.get(groupId)
				if (group && group.group_name !== roomName) roomName = group.group_name;
				// create room
				room = this.createRoom(roomId, roomName, avatar);
				this.rooms = [room, ...this.rooms];
				if (this.mongodb) storage.addRoom(room);
				else db.set("messages." + roomId, []).write();
			}
			else {
				if (!history && !room.roomName.startsWith(roomName)) room.roomName = roomName;
				if (!history)
					this.rooms = [room, ...this.rooms.filter((item) => item !== room)];
			} //bring the room first

			//begin process msg
			const lastMessage = {
				content: "",
				timestamp: now.format("hh:mm"),
				username: senderName,
			};
			let at

			////process message////
			await this.processMessage(data.message, message, lastMessage, roomId);
			at = message.at;
			if (!history && at) room.at = at;

			//run only if is not history message
			if (!history) {
				//notification
				if (!room.priority) {
					room.priority = groupId ? 2 : 4;
				}
				if (
					(!remote.getCurrentWindow().isFocused() ||
						room !== this.selectedRoom) &&
					(room.priority >= this.priority || at) &&
					!isSelfMsg
				) {
					//notification
					if (process.platform === "darwin") {
						convertImgToBase64(avatar, (b64img) => {
							const notif = new remote.Notification({
								title: room.roomName,
								body: (groupId ? senderName + ": " : "") + lastMessage.content,
								icon: nativeImage.createFromDataURL(b64img),
								hasReply: true,
								replyPlaceholder: "Reply to " + roomName,
								urgency: "critical",
							});
							notif.addListener("click", () => {
								const window = remote.getCurrentWindow();
								window.show();
								window.focus();
								this.chroom(room);
							});
							notif.addListener("reply", (e, r) => {
								this.sendMessage({
									content: r,
									room,
								});
							});
							notif.show();
						});
					}
					else {
						const notiopin = {
							body: (groupId ? senderName + ": " : "") + lastMessage.content,
							icon: avatar,
						};

						const notif = new Notification(room.roomName, notiopin);

						notif.onclick = () => {
							const window = remote.getCurrentWindow();
							window.show();
							window.focus();
							this.chroom(room);
						};
					}
				}

				if (
					room !== this.selectedRoom ||
					!remote.getCurrentWindow().isFocused()
				) {
					if (isSelfMsg) {
						room.unreadCount = 0;
						room.at = false;
					}
					else room.unreadCount++;
				}
				if (room === this.selectedRoom)
					this.messages = [...this.messages, message];
				room.utime = data.time * 1000;
				room.lastMessage = lastMessage;
				this.updateTrayIcon(room.roomName);
				if (message.file && message.file.name && room.autoDownload) {
					this.download(message.file.url, null, () => console.log(message.file.name), message.file.name, room.downloadPath)
				}
			}

			if (this.mongodb) {
				message.time = data.time * 1000;
				if (!history)
					storage.updateRoom(roomId, room)
				storage.addMessage(roomId, message)
			}
			else {
				db.set("rooms", this.rooms).write();
				db.get("messages." + roomId)
					.push(message)
					.write();
			}
			return message;
		},
		async openImage(data) {
			if (data.action === "download") {
				if (data.message.file.type.includes("image")) {
					this.downloadImage(data.message.file.url);
				}
				else {
					if (this.selectedRoom.roomId < 0 && data.message.file.fid) {
						const gfs = bot.acquireGfs(-this.selectedRoom.roomId)
						data.message.file.url = (await gfs.download(data.message.file.fid)).url
					}
					if (this.aria2.enabled && data.message.file.url.startsWith("http"))
						this.download(
							data.message.file.url,
							null,
							() => {
								this.$message("Pushed to Aria2 JSONRPC");
							},
							data.message.content
						);
					else shell.openExternal(data.message.file.url);
				}
			}
		},
		async deleteMessage(messageId) {
			const message = this.messages.find((e) => e._id === messageId);
			const res = await bot.deleteMsg(messageId);
			console.log(res);
			if (!res.error) {
				message.deleted = new Date();
				this.messages = [...this.messages];
				if (this.mongodb)
					storage.updateMessage(this.selectedRoom.roomId, messageId, {deleted: new Date()})
				else
					db.get("messages." + this.selectedRoom.roomId)
						.find({_id: messageId})
						.assign({deleted: new Date()})
						.write();
			}
			else {
				this.$notify.error({
					title: "Failed to delete message",
					message: res.error.message,
				});
			}
		},
		friendRecall(data) {
			if (data.user_id == this.selectedRoom.roomId) {
				const message = this.messages.find((e) => e._id == data.message_id);
				if (message) {
					message.deleted = new Date();
					this.messages = [...this.messages];
				}
			}
			if (this.mongodb)
				storage.updateMessage(data.user_id, data.message_id, {deleted: new Date()})
			else
				db.get("messages." + data.user_id)
					.find({_id: data.message_id})
					.assign({deleted: new Date()})
					.write();
		},
		groupRecall(data) {
			if (-data.group_id == this.selectedRoom.roomId) {
				const message = this.messages.find((e) => e._id == data.message_id);
				if (message) {
					message.deleted = new Date();
					this.messages = [...this.messages];
				}
			}
			if (this.mongodb)
				storage.updateMessage(-data.group_id, data.message_id, {deleted: new Date()})
			else
				db.get("messages." + -data.group_id)
					.find({_id: data.message_id})
					.assign({deleted: new Date()})
					.write();
		},
		sendSticker(url) {
			if (this.selectedRoom)
				this.sendMessage({
					content: "",
					room: this.selectedRoom,
					imgpath: url,
				});
			this.$refs.room.focusTextarea();
		},
		rmIgnore(chat) {
			console.log(chat);
			this.ignoredChats = this.ignoredChats.filter(
				(item) => item.id != chat.id
			);
			db.set("ignoredChats", this.ignoredChats).write();
		},
		reconnect() {
			this.reconnecting = true;
			bot.login(glodb.get("account.password").value());
		},
		online() {
			this.reconnecting = this.offline = false;
		},
		onOffline(data) {
			this.offlineReason = data.message;
			console.log(data);
			this.offline = true;
		},
		appMenu() {
			const menu = new remote.Menu();
			menu.append(this.menu[0]);
			for (let i = 0; i < this.menu[1].length; i++)
				menu.append(this.menu[1][i]);
			menu.append(
				new remote.MenuItem({
					type: "separator",
				})
			);
			for (let i = 0; i < this.menu[2].length; i++)
				menu.append(this.menu[2][i]);
			menu.popup({window: remote.getCurrentWindow()});
		},
		roomContext(room, build) {
			const pintitle = room.index ? "Unpin Chat" : "Pin Chat";
			const updatePriority = (lev) => {
				room.priority = lev;
				if (this.mongodb) {
					storage.updateRoom(room.roomId, {priority: lev})
				}
				this.updateAppMenu();
			};
			const menu = remote.Menu.buildFromTemplate([
				{
					label: "Notification Priority",
					submenu: [
						{
							type: "radio",
							label: "1",
							checked: room.priority === 1,
							click: () => updatePriority(1),
						},
						{
							type: "radio",
							label: "2",
							checked: room.priority === 2,
							click: () => updatePriority(2),
						},
						{
							type: "radio",
							label: "3",
							checked: room.priority === 3,
							click: () => updatePriority(3),
						},
						{
							type: "radio",
							label: "4",
							checked: room.priority === 4,
							click: () => updatePriority(4),
						},
						{
							type: "radio",
							label: "5",
							checked: room.priority === 5,
							click: () => updatePriority(5),
						},
					],
				},
				{
					label: pintitle,
					click: () => {
						if (room.index) room.index = 0;
						else room.index = 1;
						this.rooms = [...this.rooms];
						if (this.mongodb)
							storage.updateRoom(room.roomId, room)
						else db.set("rooms", this.rooms).write();
					},
				},
				{
					label: "Delete Chat",
					click: () => {
						db.unset("messages." + room.roomId).write();
						this.rooms = this.rooms.filter((item) => item != room);
						if (this.mongodb)
							storage.removeRoom(room.roomId)
						else db.set("rooms", this.rooms).write();
					},
				},
				{
					label: "Ignore Chat",
					click: () => {
						this.ignoredChats.push({
							id: room.roomId,
							name: room.roomName,
						});
						db.unset("messages." + room.roomId).write();
						this.rooms = this.rooms.filter((item) => item != room);
						if (this.mongodb)
							storage.removeRoom(room.roomId)
						else db.set("rooms", this.rooms).write();
						db.set("ignoredChats", this.ignoredChats).write();
					},
				},
				{
					label: "Copy Name",
					click: () => {
						clipboard.writeText(room.roomName);
					},
				},
				{
					label: "Copy ID",
					click: () => {
						clipboard.writeText(String(Math.abs(room.roomId)));
					},
				},
				{
					label: "Download Avatar",
					click: () => {
						this.downloadImage(room.avatar);
					},
				},
				{
					label: 'Auto Download',
					submenu: [
						{
							type: "checkbox",
							label: "Files in this chat",
							checked: !!room.autoDownload,
							click: (menuItem) => {
								room.autoDownload = menuItem.checked
								if (this.mongodb)
									storage.updateRoom(room.roomId, room)
								else db.set("rooms", this.rooms).write();
							},
						},
						{
							label: "Set download path",
							click: () => {
								const selection = remote.dialog.showOpenDialogSync(remote.getCurrentWindow(), {
									title: 'Select download path',
									properties: ['openDirectory'],
									defaultPath: room.downloadPath
								})
								console.log(selection)
								if (selection && selection.length) {
									room.downloadPath = selection[0]
									if (this.mongodb)
										storage.updateRoom(room.roomId, room)
									else db.set("rooms", this.rooms).write();
								}
							},
						},
					],
				},

			]);
			if (room === this.selectedRoom && this.mongodb)
				menu.append(new remote.MenuItem({
					label: 'Get History',
					click: () => {
						this.getLatestHistory(room.roomId)
					}
				}))
			if (build) return menu;
			menu.popup({window: remote.getCurrentWindow()});
		},
		friendPoke(data) {
			console.log(data)
			const roomId =
				data.operator_id == this.account ? data.user_id : data.operator_id;
			const room = this.rooms.find((e) => e.roomId == roomId);
			if (room) {
				this.rooms = [room, ...this.rooms.filter((item) => item !== room)];
				room.utime = data.time * 1000;
				let msg = "";
				if (data.operator_id != this.account) msg += room.roomName;
				else msg += "你";
				msg += data.action;
				if (data.operator_id == data.target_id) msg += "自己";
				else if (data.target_id != this.account) msg += room.roomName;
				else msg += "你";
				if (data.suffix) msg += data.suffix;
				room.lastMessage = {
					content: msg,
					username: null,
					timestamp: new Date().format("hh:mm"),
				};
				const message = {
					content: msg,
					senderId: 0,
					timestamp: new Date().format("hh:mm"),
					date: new Date().format("dd/MM/yyyy"),
					_id: data.time,
					system: true,
					time: data.time * 1000,
				};
				if (room === this.selectedRoom)
					this.messages = [...this.messages, message];
				if (this.mongodb) {
					storage.updateRoom(room.roomId, room)
					storage.addMessage(roomId, message)
				}
				else
					db.get("messages." + roomId)
						.push(message)
						.write();
			}
		},
		startChat(id, name) {
			var room = this.rooms.find((e) => e.roomId == id);
			const avatar =
				id < 0
					? `https://p.qlogo.cn/gh/${-id}/${-id}/0`
					: `https://q1.qlogo.cn/g?b=qq&nk=${id}&s=640`;

			if (room === undefined) {
				// create room
				room = this.createRoom(id, name, avatar);
				this.rooms = [room, ...this.rooms];
				if (this.mongodb) storage.addRoom(room);
				else db.set("messages." + id, []).write();
			}
			this.chroom(room);
			this.view = "chats";
		},
		chroom(room) {
			if (this.selectedRoom === room) return;
			this.selectedRoom.at = false;
			this.selectedRoom = room;
			this.updateTrayIcon();
			this.fetchMessage(true);
			this.updateAppMenu();
			convertImgToBase64(room.avatar, (b64) => {
				remote.getCurrentWindow().setIcon(nativeImage.createFromDataURL(b64));
			});
		},
		pokeFriend() {
			console.log("poke");
			if (this.selectedRoom.roomId > 0)
				bot.sendGroupPoke(this.selectedRoom.roomId, this.selectedRoom.roomId);
			this.$refs.room.focusTextarea();
		},
		createRoom(roomId, roomName, avatar) {
			const room = {
				roomId,
				roomName,
				avatar,
				index: 0,
				unreadCount: 0,
				priority: roomId > 0 ? 4 : 2,
				utime: new Date().getTime(),
				users: [
					{_id: 1, username: "1"},
					{_id: 2, username: "2"},
				],
				lastMessage: {content: "", timestamp: ""},
			};
			if (roomId < 0) room.users.push({_id: 3, username: "3"});
			return room;
		},
		addToStickers(message) {
			const downpath = path.join(
				STORE_PATH,
				"/stickers/",
				String(new Date().getTime())
			);
			download(
				message.file.url.replace("http://", "https://"),
				downpath,
				() => {
					this.$notify.success({
						title: "Image Saved to stickers folder",
						message: downpath,
					});
					this.panel = "refresh";
					this.$nextTick(() => {
						this.panel = "stickers";
					});
				}
			);
		},
		getUnreadCount() {
			return this.rooms.filter((e) => {
				return e.unreadCount && e.priority >= this.priority;
			}).length;
		},
		clearCurrentRoomUnread() {
			this.selectedRoom.unreadCount = 0;
			this.updateTrayIcon();
		},
		updateTrayIcon() {
			let p;
			const unread = this.getUnreadCount();
			const title = this.selectedRoom.roomName
				? this.selectedRoom.roomName
				: "Electron QQ";
			if (unread) {
				p = path.join(
					__static,
					this.darkTaskIcon ? "darknewmsg.png" : "newmsg.png"
				);
				const newMsgRoom = this.rooms.find(
					(e) => e.unreadCount && e.priority >= this.priority
				)
				const extra = newMsgRoom ? (' : ' + newMsgRoom.roomName) : ''
				document.title = `(${unread}${extra}) ${title}`;
			}
			else {
				p = path.join(__static, this.darkTaskIcon ? "dark.png" : "256x256.png");
				document.title = title;
			}
			if (socketIo) socketIo.emit('qqCount', unread)
			this.tray.setImage(p);
			remote.app.setBadgeCount(unread);
		},
		closeAria() {
			this.dialogAriaVisible = false;
			db.set("aria2", this.aria2).write();
			if (this.aria2.enabled) this.startAria();
		},
		startAria() {
			this.aria = new Aria2(this.aria2);
			this.aria
				.open()
				.then(this.$message("Aria2 RPC connected"))
				.catch((err) => {
					console.log(err);
					this.$message("Aria2 failed");
				});
		},
		download(url, dest, cb, out, dir) {
			if (this.aria2.enabled) {
				const opt = {};
				if (dir) opt.dir = dir;
				if (out) opt.out = out;
				else if (dest) {
					opt.dir = path.dirname(dest);
					opt.out = path.basename(dest);
				}
				this.aria
					.call("aria2.addUri", [url], opt)
					.then(cb)
					.catch((err) => {
						console.log(err);
						this.$message("Aria2 failed");
					});
			}
			else download(url, dest ? dest : path.join(dir, cb), cb);
		},
		exit() {
			const win = remote.getCurrentWindow()
			const size = win.getSize()
			remote.getGlobal('glodb').set('winSize', {
				width: size[0],
				height: size[1],
				max: win.isMaximized()
			}).write()
			win.destroy();
		},
		downloadImage(url) {
			console.log(url)
			const downdir = remote.app.getPath("downloads");
			const downpath = path.join(
				downdir,
				"QQ_Image_" + new Date().getTime() + ".jpg"
			);
			this.download(url.replace("http://", "https://"), downpath, () => {
				this.$notify.success({
					title: "Image Saved",
					message: downpath,
				});
			});
		},
		async groupPoke(data) {
			console.log(data);
			const room = this.rooms.find((e) => e.roomId == -data.group_id);
			if (room) {
				this.rooms = [room, ...this.rooms.filter((item) => item !== room)];
				room.utime = data.time * 1000;
				let operator = (
					await bot.getGroupMemberInfo(data.group_id, data.operator_id, false)
				).data;
				operator = operator.card ? operator.card : operator.nickname;
				let user = (
					await bot.getGroupMemberInfo(data.group_id, data.user_id, false)
				).data;
				user = user.card ? user.card : user.nickname;
				let msg = "";
				if (data.operator_id != this.account) msg += operator;
				else msg += "你";
				msg += data.action;
				if (data.user_id != this.account) msg += user;
				else if (data.operator_id == this.account) msg += "自己";
				else msg += "你";
				if (data.suffix) msg += data.suffix;
				room.lastMessage = {
					content: msg,
					username: null,
					timestamp: new Date().format("hh:mm"),
				};
				const message = {
					content: msg,
					senderId: 0,
					timestamp: new Date().format("hh:mm"),
					date: new Date().format("dd/MM/yyyy"),
					_id: data.time,
					system: true,
					time: data.time * 1000,
				};
				if (room === this.selectedRoom)
					this.messages = [...this.messages, message];
				if (this.mongodb) {
					storage.updateRoom(room.roomId, room)
					storage.addMessage(room.roomId, message);
				}
				else
					db.get("messages." + room.roomId)
						.push(message)
						.write();
			}
		},
		pokeGroup(uin) {
			const group = -this.selectedRoom.roomId;
			bot.sendGroupPoke(group, uin);
			this.$refs.room.focusTextarea();
		},
		revealMessage(message) {
			message.reveal = true;
			this.messages = [...this.messages];
			if (this.mongodb)
				storage.updateMessage(this.selectedRoom.roomId, message._id, {reveal: true})
			else
				db.get("messages." + this.selectedRoom.roomId)
					.find({_id: message._id})
					.assign({reveal: true})
					.write();
		},
		async processMessage(oicqMessage, message, lastMessage, roomId = null) {
			if (!Array.isArray(oicqMessage))
				oicqMessage = [oicqMessage]
			let lastType
			for (let i = 0; i < oicqMessage.length; i++) {
				const m = oicqMessage[i];
				let appurl;
				let url;
				switch (m.type) {
					case "at":
						if (lastType === 'reply')
							break
					case "text":
						lastMessage.content += m.data.text;
						message.content += m.data.text;
						if (m.data.qq === "all") {
							message.at = "all";
						}
						else if (m.data.qq == this.account) {
							message.at = true;
						}
						break;
					case "image":
					case "flash":
						lastMessage.content += "[Image]";
						url = m.data.url;
						message.file = {
							type: "image/jpeg",
							url,
						};
						break;
					case "bface":
						lastMessage.content += "[Sticker]" + m.data.text;
						url = `https://gxh.vip.qq.com/club/item/parcel/item/${m.data.file.substr(
							0,
							2
						)}/${m.data.file.substr(0, 32)}/300x300.png`;
						message.file = {
							type: "image/webp",
							url,
						};
						break;
					case "file":
						lastMessage.content += "[File]" + m.data.name;
						message.content += m.data.name;
						message.file = {
							type: "object/stream",
							size: m.data.size,
							url: m.data.url,
							name: m.data.name,
							fid: m.data.fileid
						};
						break;
					case "share":
						lastMessage.content += "[Link]" + m.data.title;
						message.content += m.data.url;
						break;
					case "reply":
						let replyMessage;
						if (roomId) {
							if (this.mongodb)
								replyMessage = await storage.getMessage(m.data.id);
							else
								replyMessage = db
									.get("messages." + roomId)
									.find({_id: m.data.id})
									.value();
						}
						if (!replyMessage) {
							//get the message
							const getRet = await bot.getMsg(m.data.id);
							if (getRet.data) {
								replyMessage = await this.onQQMessage(
									getRet.data,
									roomId ? roomId : true
								);
								//todo: refresh view
							}
						}
						if (replyMessage) {
							message.replyMessage = {
								_id: m.data.id,
								username: replyMessage.username,
								content: replyMessage.content,
							};
							if (replyMessage.file) {
								message.replyMessage.file = replyMessage.file;
							}
						}
						break;
					case "json":
						const json = m.data.data;
						message.code = json;
						const biliRegex = /(https?:\\?\/\\?\/b23\.tv\\?\/\w*)\??/;
						const zhihuRegex = /(https?:\\?\/\\?\/\w*\.?zhihu\.com\\?\/[^?"=]*)\??/;
						const biliRegex2 = /(https?:\\?\/\\?\/\w*\.?bilibili\.com\\?\/[^?"=]*)\??/;
						const jsonLinkRegex = /{.*"app":"com.tencent.structmsg".*"jumpUrl":"(https?:\\?\/\\?\/[^",]*)".*}/;
						const jsonAppLinkRegex = /"contentJumpUrl": ?"(https?:\\?\/\\?\/[^",]*)"/;
						if (biliRegex.test(json))
							appurl = json.match(biliRegex)[1].replace(/\\\//g, "/");
						else if (biliRegex2.test(json))
							appurl = json.match(biliRegex2)[1].replace(/\\\//g, "/");
						else if (zhihuRegex.test(json))
							appurl = json.match(zhihuRegex)[1].replace(/\\\//g, "/");
						else if (jsonLinkRegex.test(json))
							appurl = json.match(jsonLinkRegex)[1].replace(/\\\//g, "/");
						else if (jsonAppLinkRegex.test(json))
							appurl = json.match(jsonAppLinkRegex)[1].replace(/\\\//g, "/");
						if (appurl) {
							lastMessage.content = appurl;
							message.content = appurl;
						}
						else {
							lastMessage.content = "[JSON]";
							message.content = "[JSON]";
						}
						break;
					case "xml":
						message.code = m.data.data;
						const urlRegex = /url="([^"]+)"/;
						if (urlRegex.test(m.data.data))
							appurl = m.data.data.match(urlRegex)[1].replace(/\\\//g, "/");
						if (m.data.data.includes('action="viewMultiMsg"')) {
							lastMessage.content += "[Forward multiple messages]";
							message.content += "[Forward multiple messages]";
							const resIdRegex = /m_resid="([\w+=/]+)"/;
							if (resIdRegex.test(m.data.data)) {
								const resId = m.data.data.match(resIdRegex)[1];
								console.log(resId);
								message.content = `[Forward: ${resId}]`;
							}
						}
						else if (appurl) {
							appurl = appurl.replace(/&amp;/g, "&");
							lastMessage.content = appurl;
							message.content = appurl;
						}
						else {
							lastMessage.content += "[XML]";
							message.content += "[XML]";
						}
						break;
					case "face":
						message.content += `[Face: ${m.data.id}]`;
						lastMessage.content += m.data.text
						break;
					case "video":
						message.content = "";
						lastMessage.content = `[Video]`;
						message.file = {
							type: "video/mp4",
							url: m.data.url,
						};
						break;
					case "record":
						message.content = "[Audio]";
						lastMessage.content = `[Audio]`;
						break;
				}
				lastType = m.type
			}
			return {message, lastMessage};
		},
		updateAppMenu() {
			const menu = remote.Menu.buildFromTemplate([
				{
					label: "Electron QQ",
					submenu: this.menu[2],
				},
				this.menu[0],
				{
					label: "Options",
					submenu: this.menu[1],
				},
			]);
			if (this.selectedRoom)
				menu.append(
					new remote.MenuItem({
						label: this.selectedRoom.roomName,
						submenu: this.roomContext(this.selectedRoom, true),
					})
				);
			remote.Menu.setApplicationMenu(menu);
		},
		async getHistory(message) {
			const messages = [];
			while (true) {
				const history = await bot.getChatHistory(message._id);
				console.log(history);
				if (history.error) {
					console.log(history.error);
					this.$message.error('错误：' + history.error.message)
					break
				}
				if (history.data.length < 2) break
				const newMsgs = []
				for (let i = 0; i < history.data.length; i++) {
					const data = history.data[i];
					const message = {
						senderId: data.sender.user_id,
						username: data.group_id
							? data.anonymous
								? data.anonymous.name
								: data.sender.card || data.sender.nickname
							: data.sender.remark || data.sender.nickname,
						content: "",
						timestamp: new Date(data.time * 1000).format("hh:mm"),
						date: new Date(data.time * 1000).format("dd/MM/yyyy"),
						_id: data.message_id,
						time: data.time * 1000,
					};
					await this.processMessage(
						data.message,
						message,
						{},
						this.selectedRoom.roomId
					);
					messages.push(message);
					newMsgs.push(message)
				}
				message = newMsgs[0]
				const firstOwnMsg = this.selectedRoom.roomId < 0 ?
					newMsgs[0] : //群的话只要第一条消息就行
					newMsgs.find(e => e.senderId == this.account)
				if (!firstOwnMsg || await storage.getMessage(this.selectedRoom.roomId, firstOwnMsg._id)) break
			}
			console.log(messages);
			message.historyGot = true;
			storage.updateMessage(this.selectedRoom.roomId, message._id, {historyGot: true})
			storage.addMessages(this.selectedRoom.roomId, messages)
				.then(() => storage.fetchMessages(this.selectedRoom.roomId, 0, this.messages.length))
				.then(msgs2add => setTimeout(() => {
					console.log('ok')
					this.messages = msgs2add;
					this.fetchMessage();
				}, 0))
		},
		getLatestHistory(roomId) {
			let buffer
			if (roomId < 0) {
				buffer = Buffer.alloc(21)
				roomId = -roomId
			}
			else buffer = Buffer.alloc(17)
			buffer.writeUInt32BE(roomId, 0)
			this.getHistory({
				_id: buffer.toString('base64')
			})
		},
		async openForward(resId) {
			const history = await bot.getForwardMsg(resId);
			console.log(history);
			if (history.error) {
				console.log(history.error);
				return;
			}
			const messages = [];
			for (let i = 0; i < history.data.length; i++) {
				const data = history.data[i];
				const message = {
					senderId: data.user_id,
					username: data.nickname,
					content: "",
					timestamp: new Date(data.time * 1000).format("hh:mm"),
					date: new Date(data.time * 1000).format("dd/MM/yyyy"),
					_id: i,
					time: data.time * 1000,
				};
				await this.processMessage(
					data.message,
					message,
					{},
					this.selectedRoom.roomId
				);
				messages.push(message);
			}
			const size = remote.screen.getPrimaryDisplay().size;
			let width = size.width - 300;
			if (width > 1440) width = 900;
			const win = new remote.BrowserWindow({
				height: size.height - 200,
				width,
				autoHideMenuBar: true,
				webPreferences: {
					nodeIntegration: true,
					enableRemoteModule: true,
					webSecurity: false,
					contextIsolation: false
				},
			});
			const winURL =
				process.env.NODE_ENV === "development"
					? `http://localhost:9080`
					: `file://${__dirname}/index.html`;
			win.loadURL(winURL + "#/history");
			win.webContents.on("did-finish-load", function () {
				win.webContents.send(
					"loadMessages",
					messages,
					remote.getCurrentWindow().id
				);
			});
		},
		initSocketIo() {
			socketIo = new io(db.get('socketIoSlave').value(), {transports: ["websocket"]})
			console.log(socketIo)
		}
	},
	computed: {
		cssVars() {
			const defaultStyles = defaultThemeStyles["light"];
			const customStyles = {};

			Object.keys(defaultStyles).map((key) => {
				customStyles[key] = {
					...defaultStyles[key],
					...(this.styles[key] || {}),
				};
			});

			return cssThemeVars(customStyles);
		},
	},
};
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

.el-col {
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
