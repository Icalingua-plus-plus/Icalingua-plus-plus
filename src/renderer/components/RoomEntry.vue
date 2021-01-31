<template>
	<a @click="$emit('click')">
		<div class="root" :class="{ selected }">
			<div class="entry">
				<div class="left">
					<el-avatar
						size="large"
						:src="
							room.roomId < 0
								? `https://p.qlogo.cn/gh/${-room.roomId}/${-room.roomId}/0`
								: `http://q1.qlogo.cn/g?b=qq&nk=${room.roomId}&s=640`
						"
					/>
				</div>
				<div class="right">
					<div class="flex l1" :class="{ withoutdesc: !desc }">
						<div class="name">
							{{ room.roomName }}
						</div>
						<div
							class="icon"
							v-show="
								(room.roomId < 0 && muteAllGroups && !room.unmute) ||
								(room.roomId < 0 && !muteAllGroups && room.mute) ||
								(room.roomId > 0 && room.mute)
							"
						>
							<i class="el-icon-close-notification"></i>
						</div>
						<div class="icon" v-show="room.index == 1">
							<i class="el-icon-arrow-up"></i>
						</div>
						<div class="timestamp">
							{{ room.lastMessage.timestamp }}
						</div>
					</div>
					<div class="flex">
						<div class="desc">
							{{ desc }}
						</div>
						<div v-show="room.unreadCount != 0">
							<el-badge
								:value="room.unreadCount"
								:type="
									(room.roomId < 0 && muteAllGroups && !room.unmute) ||
									(room.roomId < 0 && !muteAllGroups && room.mute) ||
									(room.roomId > 0 && room.mute)
										? 'info'
										: undefined
								"
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	</a>
</template>

<script>
	export default {
		name: "RoomEntry",
		props: {
			room: Object,
			selected: Boolean,
			muteAllGroups: Boolean
		},
		computed: {
			desc() {
				var d = ""
				if (this.room.roomId < 0) {
					d += this.room.lastMessage.username + ': '
				}
				d += this.room.lastMessage.content
				return d
			}
		}
	}
</script>

<style scoped>
	.root {
		padding: 0 15px;
		transition: background-color 0.3s;
		cursor: default;
	}
	.root:not(.selected):hover {
		background-color: #f2f6fc;
	}
	div.entry {
		padding: 10px 0;
		height: 50px;
		display: flex;
		align-items: center;
		border-bottom: 1px solid #e4e7ed;
	}
	.left {
		width: max-content;
		float: left;
		padding-top: 5px;
	}
	.right {
		margin-left: 15px;
		width: 100%;
	}
	a {
		text-decoration: none;
	}
	.desc {
		color: #606266;
		font-size: 12px;
		text-overflow: ellipsis;
		overflow: hidden;
		white-space: nowrap;
		width: 0;
		flex: 1;
	}
	.icon {
		color: #909399;
		font-size: 11px;
		margin-left: 2px;
	}
	.name {
		font-weight: bold;
		color: #303133;
		text-overflow: ellipsis;
		overflow: hidden;
		white-space: nowrap;
		width: 0;
		flex: 1;
		font-size: 16px;
	}
	.timestamp {
		margin-left: 5px;
		color: #606266;
		font-size: 11px;
	}
	.withoutdesc {
		margin-top: 10px;
		margin-bottom: 10px;
	}
	.flex {
		display: flex;
		height: 18px;
	}
	.l1 {
		height: 25px;
	}
	.selected {
		background-color: #e5effa;
	}
	.el-badge {
		margin-top: -2px;
		margin-left: 2px;
	}
</style>