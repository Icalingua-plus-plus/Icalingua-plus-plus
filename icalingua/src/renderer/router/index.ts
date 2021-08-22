import Vue from 'vue'
import Router from 'vue-router'
import ChatView from '../views/ChatView.vue'
import HistoryView from '../views/HistoryView.vue'
import LoginView from '../views/LoginView.vue'
import Aria2Settings from '../views/Aria2Settings.vue'
import IgnoreManage from '../views/IgnoreManageView.vue'
import GroupNickEdit from '../views/GroupNickEdit.vue'
import FriendRequest from '../views/FriendRequest.vue'
import KickAndExit from '../views/KickAndExit.vue'

Vue.use(Router)

export default new Router({
    routes: [
        {
            path: '/main',
            name: 'chat-page',
            component: ChatView,
        },
        {
            path: '/groupNickEdit/:gin/:gn/:nick',
            name: 'group-nick-edit-page',
            component: GroupNickEdit,
        },
        {
            path: '/kickAndExit/:action/:gin/:uin/:groupName/:userName',
            name: 'lick-and-exit-confirm-page',
            component: KickAndExit,
        },
        {
            path: '/history',
            name: 'history-page',
            component: HistoryView,
        },
        {
            path: '/login',
            name: 'login-page',
            component: LoginView,
        },
        {
            path: '/aria2',
            name: 'aria2-page',
            component: Aria2Settings,
        },
        {
            path: '/ignoreManage',
            name: 'ignore-manage-page',
            component: IgnoreManage,
        },
        {
            path: '/friendRequest',
            name: 'friend-request-page',
            component: FriendRequest,
        },
    ],
})
