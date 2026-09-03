import type { AudioSourceKind } from './types.ts'

const FFT_SIZE = 2048

let instance: AudioEngine | null = null

export class AudioEngine {
  readonly fftSize = FFT_SIZE
  readonly freqData: Uint8Array<ArrayBuffer>
  readonly timeData: Uint8Array<ArrayBuffer>

  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private gain: GainNode | null = null
  private source: AudioNode | null = null
  private mediaStream: MediaStream | null = null
  private audioEl: HTMLAudioElement | null = null
  private fileUrl: string | null = null
  private _kind: AudioSourceKind = 'none'
  private _playing = false

  static get(): AudioEngine {
    if (!instance) instance = new AudioEngine()
    return instance
  }

  private constructor() {
    this.freqData = new Uint8Array(new ArrayBuffer(FFT_SIZE / 2))
    this.timeData = new Uint8Array(new ArrayBuffer(FFT_SIZE))
  }

  get kind(): AudioSourceKind {
    return this._kind
  }

  get playing(): boolean {
    return this._playing
  }

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 44100
  }

  update(): void {
    if (!this.analyser) return
    this.analyser.getByteFrequencyData(this.freqData)
    this.analyser.getByteTimeDomainData(this.timeData)
  }

  /** Call from a click handler so AudioContext is unlocked before the file dialog. */
  async unlock(): Promise<void> {
    await this.ensureGraph()
  }

  async startMic(): Promise<void> {
    await this.ensureGraph()
    this.disconnectSource()
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    })
    this.mediaStream = stream
    const src = this.ctx!.createMediaStreamSource(stream)
    src.connect(this.analyser!)
    this.source = src
    this.gain!.gain.value = 0
    this._kind = 'mic'
    this._playing = true
  }

  async loadFile(file: File): Promise<void> {
    await this.ensureGraph()
    this.disconnectSource()

    const url = URL.createObjectURL(file)
    this.fileUrl = url

    const el = new Audio()
    el.preload = 'auto'
    el.loop = true
    el.crossOrigin = 'anonymous'
    el.src = url
    this.audioEl = el

    await this.waitForCanPlay(el)

    const src = this.ctx!.createMediaElementSource(el)
    src.connect(this.analyser!)
    this.source = src
    this.gain!.gain.value = 1
    this._kind = 'file'

    if (this.ctx!.state !== 'running') {
      await this.ctx!.resume()
    }

    try {
      await el.play()
      this._playing = true
    } catch {
      // File is wired up; Play can start it under a fresh user gesture.
      this._playing = false
      el.pause()
    }
  }

  async togglePause(): Promise<void> {
    if (this._kind === 'none' || !this.ctx) return

    if (this._kind === 'file' && this.audioEl) {
      if (this.audioEl.paused) {
        if (this.ctx.state !== 'running') {
          await this.ctx.resume()
        }
        await this.audioEl.play()
        this._playing = true
      } else {
        this.audioEl.pause()
        this._playing = false
      }
      return
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume()
      this._playing = true
    } else {
      await this.ctx.suspend()
      this._playing = false
    }
  }

  dispose(): void {
    this.disconnectSource()
    if (this.gain) {
      this.gain.disconnect()
      this.gain = null
    }
    if (this.analyser) {
      this.analyser.disconnect()
      this.analyser = null
    }
    if (this.ctx) {
      void this.ctx.close()
      this.ctx = null
    }
    this._kind = 'none'
    this._playing = false
    instance = null
  }

  private async ensureGraph(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = FFT_SIZE
      this.analyser.smoothingTimeConstant = 0
      this.gain = this.ctx.createGain()
      this.gain.gain.value = 0
      this.analyser.connect(this.gain)
      this.gain.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume()
    }
  }

  private waitForCanPlay(el: HTMLAudioElement): Promise<void> {
    if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      const onReady = () => {
        cleanup()
        resolve()
      }
      const onError = () => {
        cleanup()
        const detail = el.error?.message || 'Unsupported or unreadable audio file'
        reject(new Error(detail))
      }
      const cleanup = () => {
        el.removeEventListener('canplay', onReady)
        el.removeEventListener('error', onError)
      }
      el.addEventListener('canplay', onReady)
      el.addEventListener('error', onError)
      el.load()
    })
  }

  private disconnectSource(): void {
    if (this.source) {
      this.source.disconnect()
      this.source = null
    }
    if (this.mediaStream) {
      const tracks = this.mediaStream.getTracks()
      for (let i = 0; i < tracks.length; i++) tracks[i]!.stop()
      this.mediaStream = null
    }
    if (this.audioEl) {
      this.audioEl.pause()
      this.audioEl.removeAttribute('src')
      this.audioEl.load()
      this.audioEl = null
    }
    if (this.fileUrl) {
      URL.revokeObjectURL(this.fileUrl)
      this.fileUrl = null
    }
  }
}
