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
import OpenForward from '../views/OpenForward.vue'
import MuteUser from '../views/MuteUser.vue'
import MakeForward from '../views/MakeForward.vue'
import UnlockView from '../views/UnlockView.vue'
import SetLockPasswordView from '../views/SetLockPasswordView.vue'

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
            path: '/muteUser/:gin/:uin/:groupName/:userName/:anonymousflag',
            name: 'mute-user-confirm-page',
            component: MuteUser,
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
        {
            path: '/openForward',
            name: 'open-forward-page',
            component: OpenForward,
        },
        {
            path: '/makeForward',
            name: 'make-forward-page',
            component: MakeForward,
        },
        {
            path: '/unlock',
            name: 'unlock-page',
            component: UnlockView,
        },
        {
            path: '/setLockPassword',
            name: 'set-lock-password-page',
            component: SetLockPasswordView,
        }
    ],
})
