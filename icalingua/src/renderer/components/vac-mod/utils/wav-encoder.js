const DEFAULT_SAMPLE_RATE = 24000
const CHANNEL_COUNT = 1
const BIT_DEPTH = 16
const BYTES_PER_SAMPLE = BIT_DEPTH / 8

/**
 * Encode mono Float32 PCM samples as a 16-bit PCM WAV file.
 *
 * `inputSampleRate` is the sample rate supplied by AudioContext. Chromium
 * commonly captures at 48kHz even when the requested output is 24kHz, so the
 * encoder performs a small linear resample when the rates differ.
 */
export default class WavEncoder {
    constructor(options = {}) {
        this.bufferSize = options.bufferSize || 4096
        this.sampleRate = Number(options.sampleRate) || DEFAULT_SAMPLE_RATE
        this.inputSampleRate = Number(options.inputSampleRate) || this.sampleRate
        this.samples = options.samples || []
    }

    finish() {
        const input = this._joinSamples()
        const samples = this._resample(input)
        const dataSize = samples.length * BYTES_PER_SAMPLE
        const buffer = new ArrayBuffer(44 + dataSize)
        const view = new DataView(buffer)

        this._writeString(view, 0, 'RIFF')
        view.setUint32(4, 36 + dataSize, true)
        this._writeString(view, 8, 'WAVE')
        this._writeString(view, 12, 'fmt ')
        view.setUint32(16, 16, true) // PCM fmt chunk size
        view.setUint16(20, 1, true) // PCM format
        view.setUint16(22, CHANNEL_COUNT, true)
        view.setUint32(24, this.sampleRate, true)
        view.setUint32(28, this.sampleRate * CHANNEL_COUNT * BYTES_PER_SAMPLE, true)
        view.setUint16(32, CHANNEL_COUNT * BYTES_PER_SAMPLE, true)
        view.setUint16(34, BIT_DEPTH, true)
        this._writeString(view, 36, 'data')
        view.setUint32(40, dataSize, true)
        this._floatTo16BitPCM(view, 44, samples)

        const blob = new Blob([buffer], { type: 'audio/wav' })
        return {
            id: Date.now(),
            blob,
            url: URL.createObjectURL(blob),
        }
    }

    /** Flatten ScriptProcessor chunks without padding the final chunk. */
    _joinSamples() {
        if (ArrayBuffer.isView(this.samples)) {
            return new Float32Array(this.samples)
        }

        const chunks = Array.isArray(this.samples) ? this.samples : []
        const length = chunks.reduce((total, chunk) => total + (chunk?.length || 0), 0)
        const joined = new Float32Array(length)
        let offset = 0
        for (const chunk of chunks) {
            if (!chunk?.length) continue
            joined.set(chunk, offset)
            offset += chunk.length
        }
        return joined
    }

    /** Linear resampling keeps the encoder dependency-free and deterministic. */
    _resample(input) {
        if (!input.length || this.inputSampleRate === this.sampleRate) return input

        const outputLength = Math.max(1, Math.round((input.length * this.sampleRate) / this.inputSampleRate))
        const output = new Float32Array(outputLength)
        const ratio = this.inputSampleRate / this.sampleRate
        for (let i = 0; i < output.length; i++) {
            const position = i * ratio
            const lower = Math.floor(position)
            const upper = Math.min(lower + 1, input.length - 1)
            const weight = position - lower
            output[i] = input[lower] + (input[upper] - input[lower]) * weight
        }
        return output
    }

    _floatTo16BitPCM(output, offset, input) {
        for (let i = 0; i < input.length; i++, offset += BYTES_PER_SAMPLE) {
            const sample = Math.max(-1, Math.min(1, input[i]))
            output.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
        }
    }

    _writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i))
        }
    }
}
