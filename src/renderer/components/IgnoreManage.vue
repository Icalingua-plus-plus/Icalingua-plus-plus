<template>
  <div class="bg" ondragstart="return false;">
    <div>
      <div class="closeicon">
        <i class="el-icon-close" size="10px" @click="$emit('close')"></i>
      </div>
      <div class="title">
        <p>Ignored chats</p>
      </div>
      <GroupEntry
        v-for="chat in ignoredChats"
        :key="chat.id"
        :chat="chat"
        @click="$emit('remove', chat)"
      />
    </div>
  </div>
</template>

<script>
import GroupEntry from "./GroupEntry";
export default {
  name: "IgnoreManage",
  components: { GroupEntry },
  props: ["ignoredChats"],
};
</script>

<style scoped>
.bg {
  background-color: #fff;
  padding: 20px;
  height: 100vh;
  overflow-y: auto;
}

.closeicon {
  color: #606266;
  font-size: 1.5em;
  text-align: right;
}
</style>