<template>
  <div class="vac-icon-textarea-left">
    <div class="vac-svg-button" @click="toggleRecorder">
      <slot v-if="recorder.isRecording" name="microphone-off-icon">
        <svg-icon name="microphone-off" class="vac-icon-microphone-off" />
      </slot>
      <slot v-else name="microphone-icon">
        <svg-icon name="microphone" class="vac-icon-microphone" />
      </slot>
    </div>
  </div>
</template>

<script>
import SvgIcon from "../../components/SvgIcon";

import Recorder from "../../utils/recorder";

export default {
  name: "RoomAudio",
  components: {
    SvgIcon,
  },

  props: {
    bitRate: { type: Number, default: 128 },
    sampleRate: { type: Number, default: 44100 },
    format: { type: String, default: "wav" },
    micFailed: { type: Function, default: null },
    beforeRecording: { type: Function, default: null },
    pauseRecording: { type: Function, default: null },
    afterRecording: { type: Function, default: null },
  },

  data() {
    return {
      recorder: this._initRecorder(),
    };
  },

  beforeDestroy() {
    this.stopRecorder();
  },

  methods: {
    _initRecorder() {
      return new Recorder({
        beforeRecording: this.beforeRecording,
        afterRecording: this.afterRecording,
        pauseRecording: this.pauseRecording,
        micFailed: this.micFailed,
        bitRate: this.bitRate,
        sampleRate: this.sampleRate,
        format: this.format,
      });
    },
    toggleRecorder() {
      if (!this.recorder.isRecording) {
        this.recorder.start();
      } else {
        this.recorder.stop();

        const record = this.recorder.records[0];

        this.$emit("update-file", {
          blob: record.blob,
          name: `audio.${this.format}`,
          size: record.blob.size,
          duration: record.duration,
          type: record.blob.type,
          audio: true,
          localUrl: URL.createObjectURL(record.blob),
        });

        this.recorder = this._initRecorder();
      }
    },
    stopRecorder() {
      if (this.recorder.isRecording) {
        this.recorder.stop();
        this.recorder = this._initRecorder();
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.vac-icon-textarea-left {
  display: flex;
  margin: 12px 5px 0 0;

  svg,
  .vac-wrapper {
    margin: 0 7px;
  }
}

.vac-icon-microphone {
  fill: var(--chat-icon-color-microphone);
}

.vac-icon-microphone-off {
  animation: vac-scaling 0.8s ease-in-out infinite alternate;
}

@keyframes vac-scaling {
  0% {
    transform: scale(1);
  }
  100% {
    transform: scale(1.2);
  }
}

@media only screen and (max-width: 768px) {
  .vac-icon-textarea-left {
    margin: 6px 5px 0 0;

    svg,
    .wrapper {
      margin: 0 5px;
    }
  }
}
</style>
