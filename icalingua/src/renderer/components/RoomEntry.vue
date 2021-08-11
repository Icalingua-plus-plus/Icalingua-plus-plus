<template>
  <a @click="$emit('click')" @click.right="$emit('contextmenu')">
    <div class="root" :class="{ selected }">
      <div class="entry">
        <div class="left">
          <el-badge
            value="@"
            :type="room.at === 'all' ? 'warning' : undefined"
            :hidden="!room.at"
          >
            <el-avatar size="large" :src="room.avatar" />
          </el-badge>
        </div>
        <div class="right">
          <div class="flex l1" :class="{ withoutdesc: !desc }">
            <div class="name">
              {{ room.roomName }}
            </div>
            <div class="icon" v-show="room.priority < priority">
              <i class="el-icon-close-notification"></i>
            </div>
            <div class="icon" v-show="room.index === 1">
              <i class="el-icon-arrow-up"></i>
            </div>
            <div class="timestamp">
              {{ timestamp }}
            </div>
          </div>
          <div class="flex">
            <div class="desc">
              {{ desc }}
            </div>
            <div v-show="room.unreadCount !== 0">
              <el-badge
                :value="room.unreadCount"
                :type="room.priority < priority ? 'info' : undefined"
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
    priority: Number,
  },
  computed: {
    desc() {
      let d = "";
      if (this.room.roomId < 0 && this.room.lastMessage.username) {
        d += this.room.lastMessage.username + ": ";
      }
      d += this.room.lastMessage.content;
      return d;
    },
    timestamp() {
      const now = new Date();
      const time = new Date(this.room.utime);
      if (
        now.getFullYear() === time.getFullYear() &&
        now.getMonth() === time.getMonth() &&
        now.getDate() === time.getDate()
      )
        return this.room.lastMessage.timestamp;

      now.setTime(now.getTime() - 24 * 60 * 60 * 1000);
      if (
        now.getFullYear() === time.getFullYear() &&
        now.getMonth() === time.getMonth() &&
        now.getDate() === time.getDate()
      )
        return "Yesterday";
      else return time.getDate() + "/" + (time.getMonth() + 1);
    },
  },
};
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

::v-deep .el-badge * {
  font-family: msyh;
}
</style>
