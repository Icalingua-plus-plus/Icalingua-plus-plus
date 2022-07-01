<template>
    <div @dblclick="$emit('dblclick')" @click.right="ctx" @click.left="$emit('click')">
        <div class="contact-entry-root">
            <div class="contact-entry-entry">
                <div class="contact-entry-left">
                    <el-avatar size="large" :src="getAvatarUrl(id)" />
                </div>
                <div class="contact-entry-right">
                    <div class="contact-entry-flex contact-entry-l1">
                        <div class="contact-entry-name">
                            {{ remark }}
                            <span class="contact-entry-rawname" v-show="name && name !== remark"> ({{ name }}) </span>
                        </div>
                    </div>
                    <div class="contact-entry-flex">
                        <div class="contact-entry-desc">
                            {{ displayId }}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import ipc from '../utils/ipc'
import getAvatarUrl from '../../utils/getAvatarUrl'

export default {
    name: 'ContactEntry',
    props: ['id', 'name', 'remark', 'group', 'type'],
    computed: {
        displayId() {
            return Math.abs(this.id)
        },
    },
    methods: {
        ctx() {
            if (this.type === 'groupmember') {
                ipc.popupGroupMemberMenu(this.remark, this.name, this.displayId, this.group)
            } else {
                ipc.popupContactMenu(this.remark, this.name, this.displayId, this.group)
            }
        },
        getAvatarUrl,
    },
}
</script>

<style>
.contact-entry-root {
    padding: 0 15px;
    transition: background-color 0.3s;
    cursor: default;
}

.contact-entry-root:hover {
    background-color: var(--panel-item-bg-hover);
}

div.contact-entry-entry {
    padding: 10px 0;
    height: 50px;
    display: flex;
    align-items: center;
    border-bottom: var(--chat-border-style);
}

.contact-entry-left {
    width: max-content;
    float: left;
    padding-top: 5px;
}

.contact-entry-right {
    margin-left: 15px;
    width: 100%;
}

.contact-entry-desc {
    color: var(--panel-color-desc);
    font-size: 12px;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    width: 0;
    flex: 1;
}

.contact-entry-name {
    font-weight: bold;
    color: var(--panel-color-name);
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    width: 0;
    flex: 1;
    font-size: 16px;
}

.contact-entry-flex {
    display: flex;
    height: 18px;
}

.contact-entry-l1 {
    height: 25px;
}

.contact-entry-rawname {
    color: var(--panel-color-icon);
    font-size: 14px;
}
</style>
