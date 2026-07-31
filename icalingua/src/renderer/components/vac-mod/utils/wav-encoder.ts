const DEFAULT_SAMPLE_RATE = 24000
const CHANNEL_COUNT = 1
const BIT_DEPTH = 16
const BYTES_PER_SAMPLE = BIT_DEPTH / 8

export interface WavRecord {
    id: number
    blob: Blob
    url: string
    duration?: number
}

export interface WavEncoderOptions {
    bufferSize?: number
    sampleRate?: number
    inputSampleRate?: number
    samples?: Float32Array | Float32Array[]
}

/**
 * Encode mono Float32 PCM samples as a 16-bit PCM WAV file.
 *
 * `inputSampleRate` is the sample rate supplied by AudioContext. Chromium
 * commonly captures at 48kHz even when the requested output is 24kHz, so the
 * encoder performs a small linear resample when the rates differ.
 */
export default class WavEncoder {
    private readonly bufferSize: number
    private readonly sampleRate: number
    private readonly inputSampleRate: number
    private readonly samples: Float32Array | Float32Array[]

    constructor(options: WavEncoderOptions = {}) {
        this.bufferSize = options.bufferSize || 4096
        this.sampleRate = Number(options.sampleRate) || DEFAULT_SAMPLE_RATE
        this.inputSampleRate = Number(options.inputSampleRate) || this.sampleRate
        this.samples = options.samples || []
    }

    finish(): WavRecord {
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
    private _joinSamples(): Float32Array {
        if (ArrayBuffer.isView(this.samples)) return new Float32Array(this.samples)

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
    private _resample(input: Float32Array): Float32Array {
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

    private _floatTo16BitPCM(output: DataView, offset: number, input: Float32Array): void {
        for (let i = 0; i < input.length; i++, offset += BYTES_PER_SAMPLE) {
            const sample = Math.max(-1, Math.min(1, input[i]))
            output.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
        }
    }

    private _writeString(view: DataView, offset: number, string: string): void {
        for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i))
    }
}
