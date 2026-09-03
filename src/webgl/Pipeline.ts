import {
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  HalfFloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  NoColorSpace,
  NoToneMapping,
  OrthographicCamera,
  RedFormat,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  UnsignedByteType,
  WebGLRenderer,
  WebGLRenderTarget,
  BufferAttribute,
  BufferGeometry,
} from 'three'
import { AudioEngine } from '../audio/AudioEngine.ts'
import { BandExtractor } from '../audio/BandExtractor.ts'
import { createUniforms, PRESET_LOOK, type VisualizerUniforms } from './Uniforms.ts'
import { clampFilterId } from '../visual/filters.ts'
import { DynamicScaler } from './DynamicScaler.ts'
import raymarchVert from '../glsl/raymarch.vert'
import raymarchFrag from '../glsl/raymarch.frag'
import feedbackFrag from '../glsl/feedback.frag'
import compositeFrag from '../glsl/composite.frag'

function createFullscreenTriangle(): BufferGeometry {
  const geometry = new BufferGeometry()
  const positions = new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0])
  const uvs = new Float32Array([0, 0, 2, 0, 0, 2])
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
  return geometry
}

function createDataTex(data: Uint8Array, width: number): DataTexture {
  const tex = new DataTexture(data, width, 1, RedFormat, UnsignedByteType)
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
  tex.wrapS = ClampToEdgeWrapping
  tex.wrapT = ClampToEdgeWrapping
  tex.colorSpace = NoColorSpace
  tex.unpackAlignment = 1
  tex.needsUpdate = true
  tex.generateMipmaps = false
  tex.flipY = false
  return tex
}

function createHdrTarget(width: number, height: number): WebGLRenderTarget {
  const rt = new WebGLRenderTarget(width, height, {
    type: HalfFloatType,
    format: RGBAFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
    colorSpace: LinearSRGBColorSpace,
  })
  rt.texture.wrapS = ClampToEdgeWrapping
  rt.texture.wrapT = ClampToEdgeWrapping
  return rt
}

export class Pipeline {
  readonly uniforms: VisualizerUniforms
  readonly scaler: DynamicScaler
  readonly extractor: BandExtractor
  fps = 60

  private readonly canvas: HTMLCanvasElement
  private readonly audio: AudioEngine
  private readonly renderer: WebGLRenderer
  private readonly scene: Scene
  private readonly camera: OrthographicCamera
  private readonly geometry: BufferGeometry
  private readonly mesh: Mesh
  private readonly raymarchMat: ShaderMaterial
  private readonly feedbackMat: ShaderMaterial
  private readonly compositeMat: ShaderMaterial
  private readonly spectrumTex: DataTexture
  private readonly waveformTex: DataTexture

  private sceneRT: WebGLRenderTarget
  private pingA: WebGLRenderTarget
  private pingB: WebGLRenderTarget
  private pingWrite = 0
  private rtW = 1
  private rtH = 1
  private readonly clearColor = new Color(0x000000)

  private raf = 0
  private running = false
  private lastNow = 0
  private time = 0
  private readonly onResize: () => void
  private readonly onFrame: (now: number) => void

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.audio = AudioEngine.get()
    this.extractor = new BandExtractor()
    this.scaler = new DynamicScaler(30)

    this.spectrumTex = createDataTex(this.audio.freqData, this.audio.freqData.length)
    this.waveformTex = createDataTex(this.audio.timeData, this.audio.timeData.length)
    this.uniforms = createUniforms(this.spectrumTex, this.waveformTex)

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      depth: false,
      stencil: false,
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.toneMapping = NoToneMapping
    this.renderer.setClearColor(0x030308, 1)
    this.renderer.autoClear = true

    this.scene = new Scene()
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.geometry = createFullscreenTriangle()

    const shared = {
      uniforms: this.uniforms,
      vertexShader: raymarchVert,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }

    this.raymarchMat = new ShaderMaterial({
      ...shared,
      fragmentShader: raymarchFrag,
    })
    this.feedbackMat = new ShaderMaterial({
      ...shared,
      fragmentShader: feedbackFrag,
    })
    this.compositeMat = new ShaderMaterial({
      ...shared,
      fragmentShader: compositeFrag,
    })

    this.mesh = new Mesh(this.geometry, this.raymarchMat)
    this.mesh.frustumCulled = false
    this.scene.add(this.mesh)

    this.sceneRT = createHdrTarget(1, 1)
    this.pingA = createHdrTarget(1, 1)
    this.pingB = createHdrTarget(1, 1)

    this.onResize = () => {
      this.rebuildTargets()
    }
    this.onFrame = (now: number) => {
      this.tick(now)
    }

    window.addEventListener('resize', this.onResize)
    this.rebuildTargets()
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.lastNow = performance.now()
    this.raf = requestAnimationFrame(this.onFrame)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  async unlockAudio(): Promise<void> {
    await this.audio.unlock()
  }

  async startMic(): Promise<void> {
    await this.audio.startMic()
  }

  async loadFile(file: File): Promise<void> {
    await this.audio.loadFile(file)
  }

  async togglePause(): Promise<void> {
    await this.audio.togglePause()
  }

  get playing(): boolean {
    return this.audio.playing
  }

  get sourceKind() {
    return this.audio.kind
  }

  setPreset(id: number): void {
    const look = PRESET_LOOK[id] ?? PRESET_LOOK[0]
    this.uniforms.uPreset.value = id
    this.uniforms.uDecay.value = look.decay
    this.uniforms.uWarp.value = look.warp
    this.clearTargets()
  }

  setFilter(id: number): void {
    this.uniforms.uFilter.value = clampFilterId(id)
  }

  dispose(): void {
    this.stop()
    window.removeEventListener('resize', this.onResize)
    this.sceneRT.dispose()
    this.pingA.dispose()
    this.pingB.dispose()
    this.raymarchMat.dispose()
    this.feedbackMat.dispose()
    this.compositeMat.dispose()
    this.geometry.dispose()
    this.spectrumTex.dispose()
    this.waveformTex.dispose()
    this.renderer.dispose()
    this.audio.dispose()
  }

  private tick(now: number): void {
    if (!this.running) return
    this.raf = requestAnimationFrame(this.onFrame)

    let dt = (now - this.lastNow) * 0.001
    this.lastNow = now
    if (dt > 0.1) dt = 0.1
    this.time += dt
    const dtMs = dt * 1000

    this.audio.update()
    this.extractor.update(
      this.audio.freqData,
      this.audio.timeData,
      this.audio.sampleRate,
      this.audio.fftSize,
      dt,
    )

    this.spectrumTex.needsUpdate = true
    this.waveformTex.needsUpdate = true

    const u = this.uniforms
    u.uBass.value = this.extractor.bass
    u.uMid.value = this.extractor.mid
    u.uHigh.value = this.extractor.high
    u.uRms.value = this.extractor.rms
    u.uBeat.value = this.extractor.beat
    u.uTime.value = this.time

    const instFps = 1000 / Math.max(dtMs, 1)
    this.fps = this.fps * 0.9 + instFps * 0.1

    if (this.scaler.tick(dtMs)) {
      this.rebuildTargets()
    }

    this.render()
  }

  private render(): void {
    const read = this.pingWrite === 0 ? this.pingA : this.pingB
    const write = this.pingWrite === 0 ? this.pingB : this.pingA
    const u = this.uniforms

    u.uResolution.value.set(this.rtW, this.rtH)
    this.mesh.material = this.raymarchMat
    this.renderer.setRenderTarget(this.sceneRT)
    this.renderer.render(this.scene, this.camera)

    u.uScene.value = this.sceneRT.texture
    u.uPrev.value = read.texture
    this.mesh.material = this.feedbackMat
    this.renderer.setRenderTarget(write)
    this.renderer.render(this.scene, this.camera)

    u.uFeedback.value = write.texture
    u.uResolution.value.set(this.canvas.width, this.canvas.height)
    this.mesh.material = this.compositeMat
    this.renderer.setRenderTarget(null)
    this.renderer.render(this.scene, this.camera)

    this.pingWrite ^= 1
  }

  private rebuildTargets(): void {
    const cssW = Math.max(1, this.canvas.clientWidth)
    const cssH = Math.max(1, this.canvas.clientHeight)
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25)
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(cssW, cssH, false)

    const dbW = Math.max(1, Math.floor(cssW * dpr))
    const dbH = Math.max(1, Math.floor(cssH * dpr))
    const w = Math.max(1, Math.floor(dbW * this.scaler.scale))
    const h = Math.max(1, Math.floor(dbH * this.scaler.scale))
    if (w === this.rtW && h === this.rtH && this.sceneRT.width === w) return

    this.sceneRT.dispose()
    this.pingA.dispose()
    this.pingB.dispose()
    this.sceneRT = createHdrTarget(w, h)
    this.pingA = createHdrTarget(w, h)
    this.pingB = createHdrTarget(w, h)
    this.rtW = w
    this.rtH = h
    this.uniforms.uResolution.value.set(w, h)
    this.clearTargets()
  }

  private clearTargets(): void {
    this.renderer.setClearColor(this.clearColor, 1)
    this.renderer.setRenderTarget(this.sceneRT)
    this.renderer.clear()
    this.renderer.setRenderTarget(this.pingA)
    this.renderer.clear()
    this.renderer.setRenderTarget(this.pingB)
    this.renderer.clear()
    this.renderer.setRenderTarget(null)
    this.renderer.setClearColor(0x030308, 1)
  }
}
