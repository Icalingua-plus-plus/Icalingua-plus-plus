import WavEncoder from './wav-encoder'

export default class {
	constructor(options = {}) {
		this.beforeRecording = options.beforeRecording
		this.pauseRecording = options.pauseRecording
		this.afterRecording = options.afterRecording
		this.micFailed = options.micFailed
		this.format = options.format

		this.encoderOptions = {
			bitRate: options.bitRate,
			sampleRate: options.sampleRate
		}

		this.bufferSize = 4096
		this.records = []

		this.isPause = false
		this.isRecording = false

		this.duration = 0
		this.volume = 0

		this.wavSamples = []

		this._duration = 0
	}

	start() {
		const constraints = {
			video: false,
			audio: {
				channelCount: 1,
				echoCancellation: false
			}
		}

		this.beforeRecording && this.beforeRecording('start recording')

		navigator.mediaDevices
			.getUserMedia(constraints)
			.then(this._micCaptured.bind(this))
			.catch(this._micError.bind(this))

		this.isPause = false
		this.isRecording = true
	}

	stop() {
		this.stream.getTracks().forEach(track => track.stop())
		this.input.disconnect()
		this.processor.disconnect()
		this.context.close()

		let record = null

		let wavEncoder = new WavEncoder({
			bufferSize: this.bufferSize,
			sampleRate: this.encoderOptions.sampleRate,
			samples: this.wavSamples
		})
		record = wavEncoder.finish()
		this.wavSamples = []

		record.duration = this.duration
		this.records.push(record)

		this._duration = 0
		this.duration = 0

		this.isPause = false
		this.isRecording = false

		this.afterRecording && this.afterRecording(record)
	}

	pause() {
		this.stream.getTracks().forEach(track => track.stop())
		this.input.disconnect()
		this.processor.disconnect()

		this._duration = this.duration
		this.isPause = true

		this.pauseRecording && this.pauseRecording('pause recording')
	}

	recordList() {
		return this.records
	}

	lastRecord() {
		return this.records.slice(-1).pop()
	}

	_micCaptured(stream) {
		this.context = new (window.AudioContext || window.webkitAudioContext)()
		this.duration = this._duration
		this.input = this.context.createMediaStreamSource(stream)
		this.processor = this.context.createScriptProcessor(this.bufferSize, 1, 1)
		this.stream = stream

		this.processor.onaudioprocess = ev => {
			const sample = ev.inputBuffer.getChannelData(0)
			let sum = 0.0

			this.wavSamples.push(new Float32Array(sample))

			for (let i = 0; i < sample.length; ++i) {
				sum += sample[i] * sample[i]
			}

			this.duration =
				parseFloat(this._duration) +
				parseFloat(this.context.currentTime.toFixed(2))
			this.volume = Math.sqrt(sum / sample.length).toFixed(2)
		}

		this.input.connect(this.processor)
		this.processor.connect(this.context.destination)
	}

	_micError(error) {
		this.micFailed && this.micFailed(error)
	}
}
