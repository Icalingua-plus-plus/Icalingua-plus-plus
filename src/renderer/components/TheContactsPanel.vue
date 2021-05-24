<template>
  <div class="root">
    <el-input
      placeholder="Enter Name"
      v-model="searchContext"
      @change="searchContextChanged"
    ></el-input>

    <el-tabs v-model="activeName" :stretch="true" v-if="!showSearchResults">
      <el-tab-pane label="Friends" name="friends">
        <div
          class="panel"
          v-show="activeName == 'friends'"
          v-infinite-scroll="loadF"
          :infinite-scroll-disabled="friendsLoaded"
          :infinite-scroll-distance="20"
        >
          <ContactEntry
            v-for="i in friends"
            :key="i.user_id"
            :id="i.user_id"
            :remark="i.remark"
            :name="i.nickname"
            @dblclick="$emit('dblclick', i.user_id, i.remark)"
          />
        </div>
      </el-tab-pane>
      <el-tab-pane label="Groups" name="groups">
        <div
          class="panel"
          v-show="activeName == 'groups'"
          v-infinite-scroll="loadG"
          :infinite-scroll-disabled="groupsLoaded"
          :infinite-scroll-distance="20"
        >
          <ContactEntry
            v-for="i in groups"
            :key="i.group_id"
            :id="-i.group_id"
            :remark="i.group_name"
            @dblclick="$emit('dblclick', -i.group_id, i.group_name)"
          />
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-tabs v-model="activeName" :stretch="true" v-if="showSearchResults">
      <el-tab-pane label="Friends" name="friends">
        <div class="panel" v-show="activeName == 'friends'">
          <ContactEntry
            v-for="i in searchedFriends"
            :key="i.user_id"
            :id="i.user_id"
            :remark="i.remark"
            :name="i.nickname"
            @dblclick="$emit('dblclick', i.user_id, i.remark)"
          />
        </div>
      </el-tab-pane>
      <el-tab-pane label="Groups" name="groups">
        <div class="panel" v-show="activeName == 'groups'">
          <ContactEntry
            v-for="i in searchedGroups"
            :key="i.group_id"
            :id="-i.group_id"
            :remark="i.group_name"
            @dblclick="$emit('dblclick', -i.group_id, i.group_name)"
          />
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script>
import { remote } from "electron";
import ContactEntry from "./ContactEntry.vue";

const bot = remote.getGlobal("bot");

export default {
  components: { ContactEntry },
  data() {
    return {
      activeName: "friends",
      groups: [],
      friends: [],
      groupsAll: [],
      friendsAll: [],
      friendsLoaded: false,
      groupsLoaded: false,
      searchContext: "",
      showSearchResults: false,
      searchedFriends: [],
      searchedGroups: [],
    };
  },
  created() {
    const friends = bot.getFriendList().data.values();
    let t = friends.next();
    while (!t.done) {
      this.friendsAll.push(t.value);
      t = friends.next();
    }
    const groups = bot.getGroupList().data.values();
    t = groups.next();
    while (!t.done) {
      this.groupsAll.push(t.value);
      t = groups.next();
    }
    this.groups.push(...this.groupsAll.slice(0, 20));
    this.groupsAll = this.groupsAll.slice(20);
    this.friends.push(...this.friendsAll.slice(0, 20));
    this.friendsAll = this.friendsAll.slice(20);
  },
  methods: {
    loadF() {
      this.friends.push(...this.friendsAll.slice(0, 10));
      this.friendsAll = this.friendsAll.slice(10);
      this.friendsLoaded = this.friendsAll.length == 0;
    },
    loadG() {
      this.groups.push(...this.groupsAll.slice(0, 10));
      this.groupsAll = this.groupsAll.slice(10);
      this.groupsLoaded = this.groupsAll.length == 0;
    },
    searchFriends(value) {
      this.searchedFriends = this.friendsAll.filter((friend) => {
        return friend.nickname.indexOf(value) != -1;
      });
    },
    searchGroups(value) {
      this.searchedGroups = this.groupsAll.filter((group) => {
        return group.group_name.indexOf(value) != -1;
      });
    },
    searchContextChanged(value) {
      if (value != "") {
        this.showSearchResults = true;
      } else {
        this.showSearchResults = false;
      }
      this.searchFriends(value);
      this.searchGroups(value);
    },
  },
};
</script>

<style scoped>
.root {
  overflow-y: auto;
  height: 100vh;
}

.panel {
  overflow-y: auto;
  height: calc(100vh - 54px);
}
</style>