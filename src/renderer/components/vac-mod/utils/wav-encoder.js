export default class {
	constructor(options) {
		this.bufferSize = options.bufferSize || 4096
		this.sampleRate = options.sampleRate
		this.samples = options.samples
	}

	finish() {
		this._joinSamples()

		let buffer = new ArrayBuffer(44 + this.samples.length * 2)
		let view = new DataView(buffer)

		this._writeString(view, 0, 'RIFF') // RIFF identifier
		view.setUint32(4, 36 + this.samples.length * 2, true) // RIFF chunk length
		this._writeString(view, 8, 'WAVE') // RIFF type
		this._writeString(view, 12, 'fmt ') // format chunk identifier
		view.setUint32(16, 16, true) // format chunk length
		view.setUint16(20, 1, true) // sample format (raw)
		view.setUint16(22, 1, true) // channel count
		view.setUint32(24, this.sampleRate, true) // sample rate
		view.setUint32(28, this.sampleRate * 4, true) // byte rate (sample rate * block align)
		view.setUint16(32, 4, true) // block align (channel count * bytes per sample)
		view.setUint16(34, 16, true) // bits per sample
		this._writeString(view, 36, 'data') // data chunk identifier
		view.setUint32(40, this.samples.length * 2, true) // data chunk length

		this._floatTo16BitPCM(view, 44, this.samples)

		const blob = new Blob([view], { type: 'audio/wav' })

		return {
			id: Date.now(),
			blob: blob,
			url: URL.createObjectURL(blob)
		}
	}

	_floatTo16BitPCM(output, offset, input) {
		for (let i = 0; i < input.length; i++, offset += 2) {
			let s = Math.max(-1, Math.min(1, input[i]))
			output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
		}
	}

	_joinSamples() {
		let recordLength = this.samples.length * this.bufferSize
		let joinedSamples = new Float64Array(recordLength)
		let offset = 0

		for (let i = 0; i < this.samples.length; i++) {
			let sample = this.samples[i]
			joinedSamples.set(sample, offset)
			offset += sample.length
		}

		this.samples = joinedSamples
	}

	_writeString(view, offset, string) {
		for (let i = 0; i < string.length; i++) {
			view.setUint8(offset + i, string.charCodeAt(i))
		}
	}
}
