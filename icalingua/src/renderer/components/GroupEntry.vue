<template>
    <a @click="$emit('click')">
        <el-card class="card">
            <div class="left">
                <el-avatar size="large" :src="getAvatarUrl(chat.id)" />
            </div>
            <div class="right">
                <p class="name withoutdesc">
                    {{ removeEmotes ? removeGroupNameEmotes(chat.name) : chat.name }}
                    ({{ Math.abs(chat.id) }})
                </p>
            </div>
        </el-card>
    </a>
</template>

<script>
import getAvatarUrl from '../../utils/getAvatarUrl'
import removeGroupNameEmotes from '../../utils/removeGroupNameEmotes'

export default {
    name: 'GroupEntry',
    props: ['chat', 'removeEmotes'],
    methods: {
        getAvatarUrl,
        removeGroupNameEmotes,
    },
}
</script>

<style scoped>
.card {
    margin-bottom: 10px;
    cursor: pointer;
}

.left {
    width: max-content;
    float: left;
}

.right {
    margin-left: 50px;
}

a {
    text-decoration: none;
}

.desc {
    margin-top: 10px;
    color: #606266;
}

.name {
    font-weight: bold;
    color: #303133;
}

.withoutdesc {
    margin-top: 10px;
    margin-bottom: 10px;
}
</style>
