<template>
  <transition name="vac-slide-up">
    <div
      v-if="messageReply"
      class="vac-reply-container"
      :style="{ bottom: `${$parent.$refs.roomFooter.clientHeight}px` }"
    >
      <div class="vac-reply-box">
        <img
          v-if="isImageFile"
          :src="messageReply.file.url"
          class="vac-image-reply"
        />
        <div class="vac-reply-info">
          <div class="vac-reply-username">
            {{ messageReply.username }}
          </div>
          <div class="vac-reply-content">
            <format-message
              :content="messageReply.content"
              :users="room.users"
              :text-formatting="true"
              :reply="true"
            />
          </div>
        </div>
      </div>

      <div class="vac-icon-reply">
        <div class="vac-svg-button" @click="$emit('reset-message')">
          <slot name="reply-close-icon">
            <svg-icon name="close-outline" />
          </slot>
        </div>
      </div>
    </div>
  </transition>
</template>

<script>
import SvgIcon from "../../components/SvgIcon";
import FormatMessage from "../../components/FormatMessage";

const { isImageFile } = require("../../utils/mediaFile");

export default {
  name: "RoomMessageReply",
  components: {
    SvgIcon,
    FormatMessage,
  },

  props: {
    room: { type: Object, required: true },
    messageReply: { type: Object, default: null },
  },

  computed: {
    isImageFile() {
      return isImageFile(this.messageReply.file);
    },
  },
};
</script>

<style lang="scss" scoped>
.vac-reply-container {
  position: absolute;
  display: flex;
  padding: 10px 10px 0 10px;
  background: var(--chat-footer-bg-color);
  align-items: center;
  width: calc(100% - 20px);

  .vac-reply-box {
    width: 100%;
    overflow: hidden;
    background: var(--chat-footer-bg-color-reply);
    border-radius: 4px;
    padding: 8px 10px;
    display: flex;
  }

  .vac-reply-info {
    overflow: hidden;
  }

  .vac-reply-username {
    color: var(--chat-message-color-reply-username);
    font-size: 12px;
    line-height: 15px;
    margin-bottom: 2px;
  }

  .vac-reply-content {
    font-size: 12px;
    color: var(--chat-message-color-reply-content);
    white-space: pre-line;
  }

  .vac-icon-reply {
    margin-left: 10px;

    svg {
      height: 20px;
      width: 20px;
    }
  }

  .vac-image-reply {
    max-height: 100px;
    margin-right: 10px;
    border-radius: 4px;
  }
}

@media only screen and (max-width: 768px) {
  .vac-reply-container {
    padding: 5px 8px;
    width: calc(100% - 16px);
  }
}
</style>
