import GUI from 'lil-gui'
import type { Pipeline } from '../webgl/Pipeline.ts'
import { FILTERS } from '../visual/filters.ts'

export class DebugGui {
  private readonly gui: GUI

  constructor(pipeline: Pipeline) {
    this.gui = new GUI({ title: 'Manuka' })
    const u = pipeline.uniforms
    this.gui.add(u.uDecay, 'value', 0.15, 0.82, 0.01).name('decay').listen()
    this.gui.add(u.uWarp, 'value', 0, 3, 0.01).name('warp').listen()
    this.gui.add(u.uExposure, 'value', 0.2, 3, 0.01).name('exposure')
    this.gui
      .add(u.uFilter, 'value', 0, FILTERS.length - 1, 1)
      .name('filter')
      .listen()
    this.gui.add(pipeline.extractor, 'attack', 0.05, 1, 0.01)
    this.gui.add(pipeline.extractor, 'release', 0.01, 0.5, 0.01)
    this.gui.add(pipeline.scaler, 'frozen').name('freeze scaler')
    const meters = this.gui.addFolder('meters')
    meters.add(pipeline.extractor, 'bass', 0, 1).listen().disable()
    meters.add(pipeline.extractor, 'mid', 0, 1).listen().disable()
    meters.add(pipeline.extractor, 'high', 0, 1).listen().disable()
    meters.add(pipeline, 'fps', 0, 120).name('fps').listen().disable()
    meters.add(pipeline.scaler, 'scale', 0.4, 1).name('scale').listen().disable()
  }

  dispose(): void {
    this.gui.destroy()
  }
}
