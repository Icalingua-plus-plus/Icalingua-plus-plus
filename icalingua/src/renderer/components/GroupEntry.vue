<template>
    <a @click="$emit('click')">
        <el-card class="card">
            <div class="left">
                <el-avatar size="large" :src="getAvatarUrl(chat.id)" />
            </div>
            <div class="right">
                <p class="name withoutdesc">{{ chat.name }}</p>
            </div>
        </el-card>
    </a>
</template>

<script>
import getAvatarUrl from '../../utils/getAvatarUrl'

export default {
    name: 'GroupEntry',
    props: ['chat'],
    methods: {
        getAvatarUrl,
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
