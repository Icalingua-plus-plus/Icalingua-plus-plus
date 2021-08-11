import Vue from "vue";
import Router from "vue-router";
import ChatView from '../views/ChatView.vue'
import HistoryView from '../views/HistoryView.vue'
import LoginView from '../views/LoginView.vue'
import Aria2Settings from '../views/Aria2Settings.vue'
import IgnoreManage from '../views/IgnoreManageView.vue'

Vue.use(Router);

export default new Router({
  routes: [
    {
      path: "/main",
      name: "chat-page",
      component: ChatView
    },
    {
      path: "/history",
      name: "history-page",
      component: HistoryView
    },
    {
      path: "/login",
      name: "login-page",
      component: LoginView
    },
    {
      path: "/aria2",
      name: "aria2-page",
      component: Aria2Settings
    },
    {
      path: "/ignoreManage",
      name: "ignore-manage-page",
      component: IgnoreManage
    },
  ],
});
