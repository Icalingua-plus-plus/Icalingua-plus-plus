import WavEncoder, { WavRecord } from './wav-encoder'

const DEFAULT_SAMPLE_RATE = 24000
const CHANNEL_COUNT = 1
const BIT_DEPTH = 16
const BUFFER_SIZE = 4096
const READY_TIMEOUT_MS = 5000

export interface RecorderOptions {
    beforeRecording?: (message: string) => void
    pauseRecording?: (message: string) => void
    afterRecording?: (record: WavRecord) => void
    micFailed?: (error: unknown) => void
    format?: string
    bitRate?: number
    sampleRate?: number
    bufferSize?: number
}

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext }

/**
 * Capture microphone input and produce a mono 24kHz/16-bit WAV record.
 * The public callbacks and recordList/lastRecord methods are kept compatible
 * with the old VAC recorder helper.
 */
export default class Recorder {
    beforeRecording?: (message: string) => void
    pauseRecording?: (message: string) => void
    afterRecording?: (record: WavRecord) => void
    micFailed?: (error: unknown) => void
    format?: string

    encoderOptions: {
        bitRate?: number
        sampleRate: number
    }
    bufferSize: number
    records: WavRecord[]
    isPause: boolean
    isRecording: boolean
    duration: number
    volume: number | string
    wavSamples: Float32Array[]

    private _duration: number
    private _capturedSamples: number
    private _sessionId: number
    private inputSampleRate: number
    private stream: MediaStream | null
    private input: MediaStreamAudioSourceNode | null
    private processor: ScriptProcessorNode | null
    private context: AudioContext | null
    private sink: GainNode | AudioDestinationNode | null
    private _readyResolve: ((value: Recorder | null) => void) | null
    private _readyReject: ((reason?: unknown) => void) | null
    private _readyTimer: ReturnType<typeof setTimeout> | null

    constructor(options: RecorderOptions = {}) {
        this.beforeRecording = options.beforeRecording
        this.pauseRecording = options.pauseRecording
        this.afterRecording = options.afterRecording
        this.micFailed = options.micFailed
        this.format = options.format

        this.encoderOptions = {
            bitRate: options.bitRate,
            sampleRate: Number(options.sampleRate) || DEFAULT_SAMPLE_RATE,
        }

        this.bufferSize = options.bufferSize || BUFFER_SIZE
        this.records = []
        this.isPause = false
        this.isRecording = false
        this.duration = 0
        this.volume = 0
        this.wavSamples = []

        this._duration = 0
        this._capturedSamples = 0
        this._sessionId = 0
        this.inputSampleRate = this.encoderOptions.sampleRate
        this.stream = null
        this.input = null
        this.processor = null
        this.context = null
        this.sink = null
        this._readyResolve = null
        this._readyReject = null
        this._readyTimer = null
    }

    start(): Promise<Recorder | null> {
        if (this.isRecording && !this.isPause) return Promise.resolve(this)

        const mediaDevices = typeof navigator !== 'undefined' && navigator.mediaDevices
        if (!mediaDevices?.getUserMedia) {
            const error = new Error('当前环境不支持麦克风录音')
            this.isRecording = false
            this.isPause = false
            this._micError(error)
            return Promise.resolve(null)
        }

        const sessionId = ++this._sessionId
        this.beforeRecording?.('start recording')
        this.isPause = false
        this.isRecording = true
        this._capturedSamples = 0

        return mediaDevices
            .getUserMedia({
                video: false,
                audio: {
                    channelCount: CHANNEL_COUNT,
                    sampleRate: this.encoderOptions.sampleRate,
                    sampleSize: BIT_DEPTH,
                    echoCancellation: false,
                },
            })
            .then(async (stream) => {
                // Stop a stream that resolved after the caller stopped/cancelled it.
                if (sessionId !== this._sessionId || !this.isRecording) {
                    stream.getTracks().forEach((track) => track.stop())
                    return null
                }
                const ready = await this._micCaptured(stream)
                if (!ready || sessionId !== this._sessionId || !this.isRecording) return null
                return this
            })
            .catch((error: unknown) => {
                if (sessionId === this._sessionId) {
                    this.isRecording = false
                    this.isPause = false
                    this._micError(error)
                }
                return null
            })
    }

    stop(): WavRecord | null {
        if (!this.isRecording && !this.stream) return null

        ++this._sessionId
        this._disconnectCapture()

        const record = new WavEncoder({
            bufferSize: this.bufferSize,
            sampleRate: this.encoderOptions.sampleRate,
            inputSampleRate: this.inputSampleRate,
            samples: this.wavSamples,
        }).finish()
        record.duration = this.duration
        this.records.push(record)

        this.wavSamples = []
        this._duration = 0
        this._capturedSamples = 0
        this.duration = 0
        this.volume = 0
        this.isPause = false
        this.isRecording = false

        this.afterRecording?.(record)
        return record
    }

    /** Stop capture and discard the current recording without emitting a record. */
    cancel(): void {
        ++this._sessionId
        this._disconnectCapture()
        this.wavSamples = []
        this._duration = 0
        this._capturedSamples = 0
        this.duration = 0
        this.volume = 0
        this.isPause = false
        this.isRecording = false
    }

    /** Alias used by components when they are destroyed. */
    dispose(): void {
        this.cancel()
        this.clearRecords()
    }

    pause(): void {
        if (!this.isRecording || this.isPause) return

        this._disconnectCapture()
        this._duration = this.duration
        this.isPause = true
        this.pauseRecording?.('pause recording')
    }

    recordList(): WavRecord[] {
        return this.records
    }

    lastRecord(): WavRecord | undefined {
        return this.records.slice(-1).pop()
    }

    clearRecords(): void {
        this.records.forEach((record) => {
            if (record?.url) URL.revokeObjectURL(record.url)
        })
        this.records = []
    }

    private async _micCaptured(stream: MediaStream): Promise<Recorder | null> {
        this.stream = stream
        try {
            const AudioContextCtor = window.AudioContext || (window as WebkitWindow).webkitAudioContext
            if (!AudioContextCtor) throw new Error('当前环境不支持 AudioContext')

            let context: AudioContext
            try {
                context = new AudioContextCtor({ sampleRate: this.encoderOptions.sampleRate })
            } catch (_) {
                context = new AudioContextCtor()
            }

            this.context = context
            this.inputSampleRate = context.sampleRate || this.encoderOptions.sampleRate
            this.duration = this._duration
            this.input = context.createMediaStreamSource(stream)
            this.processor = context.createScriptProcessor(this.bufferSize, CHANNEL_COUNT, CHANNEL_COUNT)

            // A silent sink keeps ScriptProcessor callbacks alive without monitoring
            // the microphone through the speakers.
            this.sink = context.createGain ? context.createGain() : context.destination
            if (this.sink && 'gain' in this.sink) this.sink.gain.value = 0

            const firstFrame = new Promise<Recorder | null>((resolve, reject) => {
                this._readyResolve = resolve
                this._readyReject = reject
                this._readyTimer = setTimeout(() => {
                    this._settleReady(null, new Error('麦克风启动超时'))
                }, READY_TIMEOUT_MS)
            })

            this.processor.onaudioprocess = (event: AudioProcessingEvent) => {
                const sample = event.inputBuffer.getChannelData(0)
                if (!sample.length) return

                this.wavSamples.push(new Float32Array(sample))
                this._capturedSamples += sample.length
                this.duration = this._duration + this._capturedSamples / this.inputSampleRate

                let sum = 0
                for (let i = 0; i < sample.length; i++) sum += sample[i] * sample[i]
                this.volume = Math.sqrt(sum / sample.length).toFixed(2)
                this._settleReady(this)
            }

            this.input.connect(this.processor)
            this.processor.connect(this.sink)
            if (this.sink !== context.destination) this.sink.connect(context.destination)
            const resumeContext =
                context.state === 'suspended' && typeof context.resume === 'function'
                    ? Promise.resolve(context.resume())
                    : Promise.resolve()
            const [, ready] = await Promise.all([resumeContext, firstFrame])
            return ready
        } catch (error) {
            this._disconnectCapture()
            throw error
        }
    }

    private _disconnectCapture(): void {
        this._settleReady(null)
        this.stream?.getTracks().forEach((track) => track.stop())
        this.input?.disconnect()
        if (this.processor) {
            this.processor.onaudioprocess = null
            this.processor.disconnect()
        }
        if (this.sink && this.sink !== this.context?.destination) this.sink.disconnect()
        if (this.context && this.context.state !== 'closed' && typeof this.context.close === 'function') {
            try {
                Promise.resolve(this.context.close()).catch(() => {})
            } catch (_) {
                // Some older AudioContext implementations throw when already closed.
            }
        }

        this.stream = null
        this.input = null
        this.processor = null
        this.sink = null
        this.context = null
    }

    private _settleReady(value: Recorder | null, error: Error | null = null): void {
        if (!this._readyResolve && !this._readyReject) return
        if (this._readyTimer) clearTimeout(this._readyTimer)
        const resolve = this._readyResolve
        const reject = this._readyReject
        this._readyResolve = null
        this._readyReject = null
        this._readyTimer = null
        if (error) reject?.(error)
        else resolve?.(value)
    }

    private _micError(error: unknown): void {
        this.micFailed?.(error)
    }
}
