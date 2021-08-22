<template>
    <div @dblclick="$emit('dblclick')" @click.right="ctx">
        <div class="contact-entry-root">
            <div class="contact-entry-entry">
                <div class="contact-entry-left">
                    <el-avatar
                        size="large"
                        :src="
              id < 0
                ? `https://p.qlogo.cn/gh/${-id}/${-id}/0`
                : `https://q1.qlogo.cn/g?b=qq&nk=${id}&s=640`
            "
                    />
                </div>
                <div class="contact-entry-right">
                    <div class="contact-entry-flex contact-entry-l1">
                        <div class="contact-entry-name">
                            {{ remark }}
                            <span class="contact-entry-rawname" v-show="name && name != remark">
                ({{ name }})
              </span>
                        </div>
                    </div>
                    <div class="contact-entry-flex">
                        <div class="contact-entry-desc">
                            {{ displayId }}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import ipc from '../utils/ipc'

export default {
    name: 'ContactEntry',
    props: ['id', 'name', 'remark', 'group'],
    computed: {
        displayId() {
            return Math.abs(this.id)
        },
    },
    methods: {
        ctx() {
            ipc.popupContactMenu(this.remark, this.name, this.displayId, this.group)
        },
    },
}
</script>

<style>
.contact-entry-root {
  padding: 0 15px;
  transition: background-color 0.3s;
  cursor: default;
}

.contact-entry-root:hover {
  background-color: #f2f6fc;
}

div.contact-entry-entry {
  padding: 10px 0;
  height: 50px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #e4e7ed;
}

.contact-entry-left {
  width: max-content;
  float: left;
  padding-top: 5px;
}

.contact-entry-right {
  margin-left: 15px;
  width: 100%;
}

.contact-entry-desc {
  color: #606266;
  font-size: 12px;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  width: 0;
  flex: 1;
}

.contact-entry-name {
  font-weight: bold;
  color: #303133;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  width: 0;
  flex: 1;
  font-size: 16px;
}

.contact-entry-flex {
  display: flex;
  height: 18px;
}

.contact-entry-l1 {
  height: 25px;
}

.contact-entry-rawname {
  color: #909399;
  font-size: 14px;
}
</style>
