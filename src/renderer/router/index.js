import Vue from 'vue'
import Router from 'vue-router'

Vue.use(Router)

export default new Router({
  routes: [
    {
      path: '/chat',
      name: 'chat-page',
      component: require('@/views/ChatView').default
    }
  ]
})