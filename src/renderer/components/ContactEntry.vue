<template>
  <div @dblclick="$emit('dblclick')" @click.right="ctx">
    <div class="root">
      <div class="entry">
        <div class="left">
          <el-avatar
            size="large"
            :src="
              id < 0
                ? `https://p.qlogo.cn/gh/${-id}/${-id}/0`
                : `https://q1.qlogo.cn/g?b=qq&nk=${id}&s=640`
            "
          />
        </div>
        <div class="right">
          <div class="flex l1">
            <div class="name">
              {{ remark }}
              <span class="rawname" v-show="name && name != remark">
                ({{ name }})
              </span>
            </div>
          </div>
          <div class="flex">
            <div class="desc">
              {{ displayId }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { remote, clipboard } from "electron";
export default {
  name: "ContactEntry",
  props: ["id", "name", "remark"],
  computed: {
    displayId() {
      return Math.abs(this.id);
    },
  },
  methods: {
    ctx() {
      const menu = new remote.Menu();
      if (this.remark) {
        menu.append(
          new remote.MenuItem({
            label: `Copy "${this.remark}"`,
            click: () => {
              clipboard.writeText(this.remark);
            },
          })
        );
      }
      if (this.name) {
        menu.append(
          new remote.MenuItem({
            label: `Copy "${this.name}"`,
            click: () => {
              clipboard.writeText(this.name);
            },
          })
        );
      }
      if (this.displayId) {
        menu.append(
          new remote.MenuItem({
            label: `Copy "${this.displayId}"`,
            click: () => {
              clipboard.writeText(this.displayId.toString());
            },
          })
        );
      }
      menu.popup({ window: remote.getCurrentWindow() });
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
.root:hover {
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
.flex {
  display: flex;
  height: 18px;
}
.l1 {
  height: 25px;
}
.rawname {
  color: #909399;
  font-size: 14px;
}
</style>