export class DynamicScaler {
  scale = 0.7
  frozen = false
  minScale = 0.4
  maxScale = 1

  private readonly samples: Float32Array
  private index = 0
  private filled = 0
  private warmup = 45
  private cooldown = 0

  constructor(windowSize = 30) {
    this.samples = new Float32Array(windowSize)
  }

  tick(dtMs: number): boolean {
    if (this.frozen) return false
    if (this.warmup > 0) {
      this.warmup--
      return false
    }
    if (this.cooldown > 0) {
      this.cooldown--
      return false
    }
    if (dtMs > 40) return false

    this.samples[this.index] = dtMs
    this.index = (this.index + 1) % this.samples.length
    if (this.filled < this.samples.length) this.filled++

    let sum = 0
    for (let i = 0; i < this.filled; i++) sum += this.samples[i]!
    const avg = sum / this.filled

    let next = this.scale
    if (avg > 18) next = Math.max(this.minScale, this.scale * 0.88)
    else if (avg < 14.5 && this.filled === this.samples.length) {
      next = Math.min(this.maxScale, this.scale * 1.06)
    }

    if (Math.abs(next - this.scale) > 0.03) {
      this.scale = next
      this.cooldown = 40
      return true
    }
    return false
  }
}
