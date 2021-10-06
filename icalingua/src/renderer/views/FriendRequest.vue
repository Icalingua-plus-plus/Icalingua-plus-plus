<template>
  <div style="overflow-x: hidden" ondragstart="return false">
    <h1 style="text-align: center">申请列表</h1>
    <h3 v-if="!Object.keys(request).length" style="text-align: center">暂无未处理的请求</h3>
    <div class="item" v-for="item in request" :key="item.flag">
      <div style="position: sticky">
        <img class="group-avatar"
             :src="getAvatar(item.group_id, true)"
             v-if="item.request_type==='group'"
        />
        <el-avatar :size="60" :src="getAvatar(item.user_id, false)"/>
      </div>
      <div class="info">
        <div style="flex-direction: column">
          <div>
            <span>{{ item.nickname }}({{ item.user_id }})</span>
          </div>
          <div>
            <span v-if="item.request_type === 'friend'">
              来源：{{ item.source }}
            </span>
            <span v-if="item.request_type === 'group'&&item.sub_type==='add'">
              申请加入：{{ item.group_name }}({{ item.group_id }})
            </span>
            <span v-if="item.request_type === 'group'&&item.sub_type==='invite'">
              邀请你加入：{{ item.group_name }}({{ item.group_id }})
            </span>
          </div>
          <div>
            <span>{{ item.comment }}</span>
          </div>
        </div>
      </div>
      <el-button-group>
        <el-button @click="approve(item.request_type, item.flag)">同意</el-button>
        <el-button @click="reject(item.request_type, item.flag)">拒绝</el-button>
      </el-button-group>
    </div>
  </div>
</template>

<script>
import ipc from '../utils/ipc'
import getAvatarUrl from '../../utils/getAvatarUrl'
import { ipcRenderer } from 'electron'

export default {
  name: 'FriendRequest',
  data: function () {
    return {
      request: {},
    }
  },

  async created() {
    document.title = '申请列表'
    this.request = {...this.request, ...(await ipc.getSystemMsg())}
    ipcRenderer.on('sendAddRequest', (e, data) => this.$set(this.request, data.flag, data))
  },

  methods: {
    getAvatar(uid, group = false) {
      return getAvatarUrl(group ? -uid : uid)
    },
    approve(type, flag) {
      ipc.handleRequest(type, flag)
      this.$delete(this.request, flag)
    },
    reject(type, flag) {
      ipc.handleRequest(type, flag, false)
      this.$delete(this.request, flag)
    },
  },
}
</script>

<style scoped lang="scss">
span {
  margin: 0 6px;
}

.item {
  display: flex;
  margin: 0 20px;
  padding: 10px 0;
  align-items: center;

  &:not(:last-child) {
    border-bottom: 1px solid #e4e7ed;
  }
}

.info {
  display: flex;
  margin-right: 20px;
  flex-grow: 1;
}

.group-avatar {
  position: absolute;
  border-radius: 50%;
  object-fit: cover;
  height: 30px;
  width: 30px;
  line-height: 30px;
  bottom: -3px;
  right: 0;
}
</style>
