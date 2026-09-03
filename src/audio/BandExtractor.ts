export class BandExtractor {
  bass = 0
  mid = 0
  high = 0
  rms = 0
  beat = 0

  attack = 0.45
  release = 0.08

  private prevBass = 0

  update(
    freqData: Uint8Array,
    timeData: Uint8Array,
    sampleRate: number,
    fftSize: number,
    dt: number,
  ): void {
    const binHz = sampleRate / fftSize
    const rawBass = this.bandRms(freqData, 20, 150, binHz)
    const rawMid = this.bandRms(freqData, 150, 2000, binHz)
    const rawHigh = this.bandRms(freqData, 2000, 12000, binHz)

    this.bass = this.envelope(this.bass, rawBass, dt)
    this.mid = this.envelope(this.mid, rawMid, dt)
    this.high = this.envelope(this.high, rawHigh, dt)

    let acc = 0
    const n = timeData.length
    for (let i = 0; i < n; i++) {
      const x = (timeData[i]! - 128) * 0.0078125
      acc += x * x
    }
    const rawRms = Math.sqrt(acc / n)
    this.rms = this.envelope(this.rms, rawRms, dt)

    const delta = this.bass - this.prevBass
    this.prevBass = this.bass
    const onset = delta > 0.045 ? 1 : 0
    const beatDecay = Math.exp(-dt * 8)
    this.beat = Math.max(onset, this.beat * beatDecay)
  }

  private envelope(current: number, target: number, dt: number): number {
    const k = target > current ? this.attack : this.release
    const a = 1 - Math.exp(-k * dt * 60)
    return current + (target - current) * a
  }

  private bandRms(
    data: Uint8Array,
    startHz: number,
    endHz: number,
    binHz: number,
  ): number {
    const start = Math.max(1, Math.floor(startHz / binHz))
    const end = Math.min(data.length - 1, Math.ceil(endHz / binHz))
    if (end < start) return 0
    let acc = 0
    const count = end - start + 1
    for (let i = start; i <= end; i++) {
      const v = data[i]! * 0.00392156862745098
      acc += v * v
    }
    return Math.sqrt(acc / count)
  }
}
