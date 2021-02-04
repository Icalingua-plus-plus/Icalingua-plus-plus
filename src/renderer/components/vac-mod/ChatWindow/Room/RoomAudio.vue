<template>
	<div class="vac-icon-textarea-left">
		<div class="vac-svg-button" @click="recordAudio">
			<slot v-if="recorder.state === 'recording'" name="microphone-off-icon">
				<svg-icon name="microphone-off" class="vac-icon-microphone-off" />
			</slot>
			<slot v-else name="microphone-icon">
				<svg-icon name="microphone" class="vac-icon-microphone" />
			</slot>
		</div>
	</div>
</template>

<script>
import SvgIcon from '../../components/SvgIcon'

export default {
	name: 'room-audio',
	components: {
		SvgIcon
	},

	props: {},

	data() {
		return {
			recorderStream: {},
			recorder: {},
			recordedChunks: [],
			audioDuration: 0
		}
	},

	methods: {
		async recordAudio() {
			if (this.recorder.state === 'recording') {
				this.recorder.stop()
			} else {
				this.$emit('update-file', null)
				this.recordedChunk = await this.startRecording()
			}
		},
		async startRecording() {
			this.audioDuration = new Date().getTime()

			const stream = await navigator.mediaDevices.getUserMedia({
				audio: true,
				video: false
			})

			this.recorder = new MediaRecorder(stream)

			this.recorder.ondataavailable = e => this.recordedChunks.push(e.data)
			this.recorder.start()

			const stopped = new Promise((resolve, reject) => {
				this.recorder.onstop = resolve
				this.recorder.onerror = event => reject(event.name)
			})

			stopped.then(async () => {
				stream.getTracks().forEach(track => track.stop())

				const blob = new Blob(this.recordedChunks, {
					type: 'audio/ogg; codecs="opus"'
				})

				const duration = (new Date().getTime() - this.audioDuration) / 1000

				this.$emit('update-file', {
					blob: blob,
					name: 'audio',
					size: blob.size,
					duration: parseFloat(duration.toFixed(2)),
					type: blob.type,
					audio: true,
					localUrl: URL.createObjectURL(blob)
				})
			})
		}
	}
}
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
