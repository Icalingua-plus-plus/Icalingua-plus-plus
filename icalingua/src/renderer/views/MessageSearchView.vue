<template>
    <div class="message-search">
        <div class="search-header">
            <span class="search-title">{{ roomName }} - 搜索聊天记录</span>
        </div>
        <div class="search-bar">
            <el-input
                v-model="keyword"
                placeholder="输入关键词搜索"
                prefix-icon="el-icon-search"
                clearable
                size="medium"
                @keydown.enter.native="doSearch"
                @clear="clearResults"
            />
            <el-button type="primary" size="medium" @click="doSearch" :loading="loading">搜索</el-button>
        </div>
        <div class="search-results" ref="resultsContainer" @scroll="handleScroll">
            <div v-if="messages.length === 0 && searched && !loading" class="empty-state">
                <i class="el-icon-search"></i>
                <p>未找到相关消息</p>
            </div>
            <div v-for="msg in messages" :key="msg._id" class="result-item">
                <div class="result-avatar">
                    <img :src="getAvatar(msg)" @error="handleAvatarError" />
                </div>
                <div class="result-content">
                    <div class="result-header">
                        <span class="result-sender">{{ msg.username }}</span>
                        <span class="result-time">{{ formatTime(msg.time) }}</span>
                    </div>
                    <div class="result-text" v-html="highlightKeyword(msg.content)"></div>
                </div>
                <div class="result-action">
                    <el-button type="text" size="small" @click="jumpToMessage(msg)">
                        <i class="el-icon-position"></i> 跳转
                    </el-button>
                </div>
            </div>
            <div v-if="loading" class="loading-indicator"><i class="el-icon-loading"></i> 搜索中...</div>
            <div v-if="noMore && messages.length > 0" class="no-more">没有更多结果了</div>
        </div>
    </div>
</template>

<script>
import { ipcRenderer } from 'electron'
import ipc from '../utils/ipc'
import '../utils/themes'

export default {
    name: 'MessageSearchView',
    data() {
        return {
            roomId: 0,
            roomName: '',
            keyword: '',
            messages: [],
            loading: false,
            noMore: false,
            searched: false,
        }
    },
    async created() {
        document.title = '搜索聊天记录'
        ipcRenderer.on('initMessageSearch', (event, { roomId, roomName }) => {
            this.roomId = roomId
            this.roomName = roomName
            document.title = `${roomName} - 搜索聊天记录`
        })
    },
    methods: {
        async doSearch() {
            const keyword = this.keyword.trim()
            if (!keyword) return
            this.messages = []
            this.noMore = false
            this.searched = true
            await this.fetchResults()
        },
        async fetchResults() {
            if (this.loading || this.noMore) return
            const keyword = this.keyword.trim()
            if (!keyword) return
            this.loading = true
            try {
                const msgs = await ipc.searchMessages(this.roomId, keyword, this.messages.length)
                if (msgs && msgs.length) {
                    this.messages = [...this.messages, ...msgs]
                }
                if (!msgs || msgs.length < 20) {
                    this.noMore = true
                }
            } catch (e) {
                console.error('Search failed:', e)
                this.noMore = true
            }
            this.loading = false
        },
        clearResults() {
            this.messages = []
            this.noMore = false
            this.searched = false
        },
        handleScroll(e) {
            const { scrollTop, scrollHeight, clientHeight } = e.target
            if (scrollHeight - scrollTop - clientHeight < 200) {
                this.fetchResults()
            }
        },
        jumpToMessage(msg) {
            ipc.gotoMessage(this.roomId, String(msg._id))
        },
        getAvatar(msg) {
            if (msg.head_img) return msg.head_img
            const senderId = msg.senderId || 0
            return `https://q1.qlogo.cn/g?b=qq&nk=${senderId}&s=140`
        },
        handleAvatarError(e) {
            e.target.src = 'https://q1.qlogo.cn/g?b=qq&nk=0&s=140'
        },
        formatTime(time) {
            if (!time) return ''
            const date = new Date(time)
            const now = new Date()
            const isToday = date.toDateString() === now.toDateString()
            const pad = (n) => String(n).padStart(2, '0')
            const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}`
            if (isToday) return timeStr
            return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${timeStr}`
        },
        highlightKeyword(content) {
            if (!content || !this.keyword.trim()) return content || ''
            const escaped = this.keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            return content.replace(new RegExp(escaped, 'gi'), (match) => `<span class="highlight">${match}</span>`)
        },
    },
}
</script>

<style lang="scss" scoped>
.message-search {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    background: var(--chat-content-bg-color, #f5f5f5);
    color: var(--chat-color, #333);
}

.search-header {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    background: var(--chat-header-bg-color, #fff);
    border-bottom: 1px solid var(--chat-border-color, #e0e0e0);
    -webkit-app-region: drag;

    .search-title {
        font-size: 16px;
        font-weight: 500;
    }
}

.search-bar {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    gap: 8px;
    background: var(--chat-header-bg-color, #fff);
    border-bottom: 1px solid var(--chat-border-color, #e0e0e0);
    -webkit-app-region: no-drag;
}

.search-results {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
}

.result-item {
    display: flex;
    align-items: flex-start;
    padding: 10px 16px;
    gap: 10px;
    cursor: default;
    transition: background 0.15s;

    &:hover {
        background: var(--chat-sidemenu-bg-color-hover, rgba(0, 0, 0, 0.04));
    }
}

.result-avatar {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    overflow: hidden;

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
}

.result-content {
    flex: 1;
    min-width: 0;
    overflow: hidden;
}

.result-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
}

.result-sender {
    font-size: 13px;
    font-weight: 500;
    color: var(--chat-color, #333);
}

.result-time {
    font-size: 11px;
    color: var(--chat-header-color-info, #999);
}

.result-text {
    font-size: 13px;
    color: var(--chat-color, #333);
    line-height: 1.4;
    word-break: break-all;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.result-text ::v-deep .highlight {
    background: #ffeb3b;
    color: #333;
    border-radius: 2px;
    padding: 0 1px;
}

.result-action {
    flex-shrink: 0;
    display: flex;
    align-items: center;
}

.loading-indicator,
.no-more,
.empty-state {
    text-align: center;
    padding: 20px;
    color: var(--chat-header-color-info, #999);
}

.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 60%;

    i {
        font-size: 64px;
        margin-bottom: 16px;
        opacity: 0.5;
    }

    p {
        font-size: 14px;
    }
}
</style>

<style lang="scss">
@import '../components/vac-mod/styles/index.scss';
</style>
